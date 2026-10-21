<template>
    <div>
        <button :disabled="disableImportButton || blockedByOther" @click.prevent="openModal">
            <slot></slot>
        </button>
        <div ref="holder" class="holder-style"></div>
    </div>
</template>
<script>

    import { version } from "../../package.json";
    import { Logger } from "../utils/Logger";

    // Page-wide record of the importers that are open or opening, shared by every CSVBox adapter
    // on the page (it lives on window so separate copies of an adapter see the same list). It does
    // two things: the newest importer is stacked on top (every holder is fixed, full screen and
    // z-index 2147483647, so equal z-indexes would leave the one that comes first in the DOM on
    // top), and the other instances learn that an importer is open so they can disable their button.
    const OPEN_IMPORTERS_KEY = '__csvboxOpenImporters';
    const TOP_Z_INDEX = 2147483647;

    function openImporters() {
        if (!window[OPEN_IMPORTERS_KEY]) window[OPEN_IMPORTERS_KEY] = { open: [], listeners: [] };
        return window[OPEN_IMPORTERS_KEY];
    }

    function restackOpenImporters(reg) {
        reg.open.forEach(function (entry, i) {
            const holder = entry.getHolder();
            if (holder) holder.style.zIndex = String(TOP_Z_INDEX - (reg.open.length - 1 - i));
        });
    }

    function registerOpenImporter(entry) {
        const reg = openImporters();
        if (reg.open.indexOf(entry) >= 0) return;
        reg.open.push(entry);
        restackOpenImporters(reg);
        reg.listeners.slice().forEach(function (fn) { fn(); });
    }

    function unregisterOpenImporter(entry) {
        const reg = openImporters();
        const i = reg.open.indexOf(entry);
        if (i < 0) return;
        reg.open.splice(i, 1);
        restackOpenImporters(reg);
        reg.listeners.slice().forEach(function (fn) { fn(); });
    }

    function isBlockedByOpenImporter(entry) {
        const reg = openImporters();
        return reg.open.length > 0 && reg.open.indexOf(entry) < 0;
    }

    function subscribeOpenImporters(fn) {
        const reg = openImporters();
        reg.listeners.push(fn);
        return function () {
            const i = reg.listeners.indexOf(fn);
            if (i >= 0) reg.listeners.splice(i, 1);
        };
    }

    import {
        buildImportUrl,
        generateUuid,
        buildInitPayload,
        createModalLifecycle,
        classifyStructuredMessage,
        classifyLegacyMessage
    } from "@csvbox/adapter";

    export default {
        name: 'csvbox-button',
        props: {
            licenseKey: {
                type: String,
                required: true
            },
            onImport: {
                type: Function,
                default: function() {}
            },
            onReady: {
                type: Function,
                default: function() {}
            },
            onSubmit: {
                type: Function,
                default: function() {}
            },
            onClose: {
                type: Function,
                default: function() {}
            },
            user: {
                type: Object,
                default: function () {
                    return { user_id: 'default123' };
                }
            },
            dynamicColumns: {
                type: Array,
                default: function () {
                    return null;
                }
            },
            options: {
                type: Object,
                default: function () {
                    return { user_id: 'default123' };
                }
            },
            dataLocation: {
                type: String,
                required: false
            },
            customDomain: {
                type: String,
                required: false
            },
            debug: {
                type: String,
                required: false,
                default: null
            },
            language: {
                type: String,
                required: false
            },
            lazy: {
                type: Boolean,
                required: false,
                default: false
            },
            loadStarted: {
                type: Function,
                default: function() {}
            },
            environment: {
                type: Object,
                default: function () {
                    return null;
                }
            },
            theme: {
                type: String,
                required: false
            },
        },
        computed: {
            // Default place to send the file. A file is only ever sent to a named origin, never "*".
            targetOrigin() {
                return new URL(this.iframeSrc).origin;
            },
            // Data-location sheets redirect to another host, so the iframe origin can differ from
            // targetOrigin. baseDomain is used to check the real origin before trusting it.
            baseDomain() {
                return this.customDomain || "app.csvbox.io";
            },
            iframeSrc() {
                return buildImportUrl(
                    {
                        licenseKey: this.licenseKey,
                        customDomain: this.customDomain,
                        dataLocation: this.dataLocation,
                        language: this.language,
                        theme: this.theme,
                        environment: this.environment
                    },
                    "vue",
                    version
                );
            }
        },
        data() {
            return {
                disableImportButton: true,
                uuid: generateUuid(),
                logger: new Logger(this.debug),
                iframe: null,
                lifecycle: createModalLifecycle(),
                isModalShown: false,
                isIframeLoaded: false,
                pendingFile: null,
                importerOrigin: null,
                probingOrigin: false,
                // True while a different importer on the page is open: the button stays disabled.
                blockedByOther: false,
            };
        },
        methods: {
            openModal() {
                // Counts as open from the moment it is requested, so the other buttons are disabled
                // while this importer is still loading, and so it is stacked above any importer
                // opened earlier.
                registerOpenImporter(this.registryEntry);
                if(!this.iframe) {
                    this.lifecycle.requestOpen();
                    this.initImporter();
                    return;
                }

                this.logger.info("openModal();");

                if(this.pendingFile) {
                    if(!this.isIframeLoaded) {
                        // Deferred: onload's markReady() calls openModal() again once the iframe is up.
                        this.lifecycle.requestOpen();
                        return;
                    }
                    // The importer opens its own modal once it has the file, so that it can
                    // inject on 'shown.bs.modal'. Sending 'openModal' as well would race that.
                    //
                    // It can also decline: wrong step, an import file URL configured on the
                    // sheet, or an importer too old to know the message at all. So the holder
                    // goes up click-through and stays that way until 'csvbox-modal-shown'
                    // confirms the modal is really up. It covers the viewport at z-index
                    // 2147483647 and the importer renders transparent with its modal closed,
                    // so arming it on an unanswered message leaves an invisible sheet over the
                    // host page eating every click.
                    //
                    // display:block regardless, so the iframe lays out and animates normally;
                    // only pointer-events is held back. isModalShown likewise waits for the
                    // confirmation, or a declined file would latch the importer shut for good.
                    this.logger.verbose("Opening importer modal with a supplied file");
                    this.$refs.holder.style.pointerEvents = 'none';
                    this.$refs.holder.style.display = 'block';
                    this.postPendingFile();
                    return;
                }

                if(this.lifecycle.requestOpen()) {
                    this.logger.verbose("Opening importer modal");
                    this.isModalShown = true;
                    // Explicit: a previously declined file leaves the holder click-through.
                    this.$refs.holder.style.pointerEvents = 'auto';
                    this.$refs.holder.style.display = 'block';
                    this.iframe.contentWindow.postMessage('openModal', '*');
                } else {
                    this.logger.verbose("Modal already showing, shown, or queued to open once ready");
                }
            },
            /**
             * Open the importer on a File the host page already has, instead of the file picker.
             *
             * Reachable through a template ref on the component
             * (`this.$refs.importer.openModalWithFile(file)`).
             *
             * The File crosses to the iframe by structured clone, so the importer receives the real
             * object and applies its own extension, worksheet and size rules to it -- this does not
             * bypass any of them. Pass a File; a Blob has no name for the importer to read an
             * extension from.
             */
            openModalWithFile(file) {
                if(!window.File || !(file instanceof window.File)) {
                    this.logger.info("openModalWithFile(): not a File, ignored");
                    return;
                }
                this.logger.info("openModalWithFile();");
                this.pendingFile = file;

                // Already open: hand it over now rather than holding it for the next open. The
                // importer takes it only while it is still on the upload step, and ignores it once
                // the user has a dataset and a mapping in progress.
                if(this.isModalShown && this.iframe && this.isIframeLoaded) {
                    this.postPendingFile();
                    return;
                }

                this.openModal();
            },
            postPendingFile() {
              if (this.importerOrigin) {
                this.sendPendingFile(this.importerOrigin);
                return;
              }

              // Origin not known yet: send a probe without the file, and send the file to the origin
              // that replies. If nobody replies in time, use targetOrigin like before.
              if (this.probingOrigin) {
                return;
              }
              this.probingOrigin = true;
              this.iframe.contentWindow.postMessage({
                type: 'csvbox-set-file',
                unique_token: this.uuid
              }, '*');
              this.probeTimer = setTimeout(() => {
                this.probeTimer = null;
                this.probingOrigin = false;
                this.sendPendingFile(this.targetOrigin);
              }, 1500);
            },
            sendPendingFile(origin) {
              if (!this.pendingFile || !this.iframe) {
                return;
              }
              this.iframe.contentWindow.postMessage({
                type: 'csvbox-set-file',
                file: this.pendingFile,
                unique_token: this.uuid
              }, origin);
              this.pendingFile = null;
              this.startFileAckTimer();
            },
            // Remember the importer's origin, only from our own iframe, with our token, and a csvbox host.
            learnImporterOrigin(event) {
              if (this.importerOrigin || !this.iframe || event.source !== this.iframe.contentWindow) {
                return;
              }
              if (!this.isImporterOrigin(event.origin)) {
                return;
              }
              this.importerOrigin = event.origin;
              if (this.probingOrigin) {
                this.probingOrigin = false;
                this.clearProbeTimer();
                this.sendPendingFile(this.importerOrigin);
              }
            },
            isImporterOrigin(origin) {
              let url;
              try {
                url = new URL(origin);
              } catch (e) {
                return false;
              }
              if (url.protocol !== 'https:') {
                return false;
              }
              return url.host === this.baseDomain || url.host.endsWith('-' + this.baseDomain);
            },
            clearProbeTimer() {
                this.clearFileAckTimer();
                if (this.probeTimer) {
                    clearTimeout(this.probeTimer);
                    this.probeTimer = null;
                }
            },
            startFileAckTimer() {
                this.clearFileAckTimer();
                this.fileAckTimer = setTimeout(() => {
                    this.fileAckTimer = null;
                    this.giveUpOnFile();
                }, 8000);
            },
            clearFileAckTimer() {
                if (this.fileAckTimer) {
                    clearTimeout(this.fileAckTimer);
                    this.fileAckTimer = null;
                }
            },
            // The importer never confirmed the file it was sent (an origin we do not trust, or an importer too
            // old to know the message). Without this the holder would stay up, invisible and click-through,
            // and the other instances' buttons would stay disabled for good.
            giveUpOnFile() {
                if (this.isModalShown) {
                    return;
                }
                const holder = this.$refs.holder;
                if (holder) {
                    holder.style.display = 'none';
                    holder.style.pointerEvents = 'auto';
                }
                unregisterOpenImporter(this.registryEntry);
                console.warn("[csvbox] the importer did not respond to the supplied file");
            },
            onMessageEvent(event) {
                let legacy = classifyLegacyMessage(event.data);
                if (legacy) {
                    // Legacy messages carry no token, so the only way to tell which importer sent one
                    // is its window. Ignore those that came from another instance's iframe (or anywhere else).
                    if (!this.iframe || event.source !== this.iframe.contentWindow) {
                        return;
                    }
                    if (legacy.type === "mainModalHidden") {
                        this.handleModalClosed();
                    }
                    if (legacy.type === "uploadSuccessful") {
                        this.onImport(true);
                    }
                    if (legacy.type === "uploadFailed") {
                        this.onImport(false);
                    }
                    return;
                }

                // Set-file handshake messages. The shared core does not classify these, so they are
                // read here, behind the same unique_token check the core applies.
                let raw = event.data;
                if (raw && typeof raw === "object" && raw.data && raw.data.unique_token == this.uuid) {
                    this.learnImporterOrigin(event);

                    if (raw.type === "csvbox-set-file-rejected" && raw.data.reason === "not-a-file") {
                        // Reply to our probe (it has no file). It only tells us the origin, so do nothing.
                        return;
                    }
                    if (raw.type === "csvbox-modal-shown") {
                        this.clearFileAckTimer();
                        registerOpenImporter(this.registryEntry);
                        // What the file path in openModal() is waiting for. display as well as
                        // pointer-events: a second file declined while the first was still opening
                        // the modal has put the holder away in the meantime.
                        this.isModalShown = true;
                        this.lifecycle.requestOpen();
                        this.$refs.holder.style.display = 'block';
                        this.$refs.holder.style.pointerEvents = 'auto';
                        return;
                    }
                    if (raw.type === "csvbox-set-file-rejected") {
                        this.clearFileAckTimer();
                        // The importer has the file and will not take it. Put the holder away only if
                        // the modal was never confirmed up: a file declined while it is open leaves
                        // that modal where it is, and its own 'csvbox-modal-hidden' will put the
                        // holder away when it closes.
                        if (!this.isModalShown) {
                            this.$refs.holder.style.display = 'none';
                            this.$refs.holder.style.pointerEvents = 'auto';
                            unregisterOpenImporter(this.registryEntry);
                        }
                        console.warn("[csvbox] importer declined the supplied file: " + raw.data.reason);
                        return;
                    }
                }

                let message = classifyStructuredMessage(event.data, this.uuid);
                if (!message) {
                    return;
                }

                this.logger.verbose("Event:", `'${message.type}'`, event.data.data);

                if (message.type === "data-on-submit") {
                    this.onSubmit?.(message.metadata);
                } else if (message.type === "data-push-status") {
                    this.onImport(message.success, message.metadata);
                } else if (message.type === "csvbox-modal-hidden") {
                    this.handleModalClosed();
                } else if (message.type === "csvbox-upload-successful") {
                    this.onImport(true);
                } else if (message.type === "csvbox-upload-failed") {
                    this.onImport(false);
                }
            },
            handleModalClosed() {
                if (this.$refs.holder) {
                    this.$refs.holder.style.display = 'none';
                    this.$refs.holder.style.pointerEvents = 'auto';
                    this.$refs.holder.innerHTML = '';
                }
                this.lifecycle.markClosed();
                // A new iframe is built on the next open, so the origin is learned again.
                this.importerOrigin = null;
                this.probingOrigin = false;
                this.clearProbeTimer();
                this.isModalShown = false;
                this.isIframeLoaded = false;
                this.iframe = null;
                unregisterOpenImporter(this.registryEntry);
                this.onClose();
            },
            syncBlocked() {
                this.blockedByOther = isBlockedByOpenImporter(this.registryEntry);
            },
            initImporter() {
                this.uuid = generateUuid();
                this.loadStarted();
                this.logger.info("Framework:", "Vue");
                this.logger.info("Library version:", version);
                if(this.customDomain){
                    this.logger.info("Using domain:", this.customDomain);
                }
                if(this.dataLocation) {
                    this.logger.info("Data location:", this.dataLocation);
                }
                this.logger.info("Importer url:", this.iframeSrc);

                let iframe = document.createElement("iframe");
                this.iframe = iframe;
                iframe.setAttribute("src", this.iframeSrc);
                iframe.setAttribute("allow", "clipboard-read; clipboard-write *");
                iframe.frameBorder = 0;
                iframe.classList.add('csvbox-iframe');

                window.addEventListener("message", this.onMessageEvent, false);

                iframe.onload = () => {
                    this.isIframeLoaded = true;
                    this.logger.info("Importer ready");
                    iframe.contentWindow.postMessage(buildInitPayload(this.user, this.dynamicColumns, this.options, this.uuid), "*");
                    this.disableImportButton = false;
                    this.onReady();
                    if (this.lifecycle.markReady()) {
                        this.openModal();
                    }
                };

                this.$refs.holder.appendChild(iframe);
            }
        },
        created() {
            this.registryEntry = { getHolder: () => this.$refs.holder };
        },
        mounted() {
            this.syncBlocked();
            this.unsubscribeOpenImporters = subscribeOpenImporters(() => this.syncBlocked());
            if(this.lazy) {
                this.disableImportButton = false;
            } else {
                this.initImporter();
            }
        },
        beforeDestroy() {
            this.logger.verbose("Removing message event listener");
            window.removeEventListener("message", this.onMessageEvent);
            this.clearProbeTimer();
            unregisterOpenImporter(this.registryEntry);
            if (this.unsubscribeOpenImporters) {
                this.unsubscribeOpenImporters();
                this.unsubscribeOpenImporters = null;
            }
        }
    }
</script>
<style scoped>
    .holder-style {
        display: none;
        z-index: 2147483647;
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        right: 0;
    }
</style>
<style>
.csvbox-iframe {
    height: 100%;
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
}
</style>