<template>
    <div>
        <button :disabled="disableImportButton || blockedByOther" @click.prevent="openModal">
            <slot></slot>
        </button>
        <div ref="holder" class="holder-style" :style="holderStyle"></div>
    </div>
</template>
<script>

    import { version } from "../../package.json";
    import { Logger } from "../utils/Logger";

    import {
        HOLDER_STYLE,
        IFRAME_STYLE,
        buildImportUrl,
        generateUuid,
        buildInitPayload,
        createModalLifecycle,
        createMessageGate,
        createImportTracker,
        createFileSender,
        classifyStructuredMessage,
        classifyLegacyMessage,
        registerOpenImporter,
        unregisterOpenImporter,
        isBlockedByOpenImporter,
        subscribeOpenImporters
    } from '@csvbox/adapter';

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
            // The holder is a fixed, full-screen layer that stays hidden until the importer opens. The style is
            // set here instead of in a <style> block: a block injects CSS into the document as soon as the
            // package is imported, which fails on a server that has no document.
            holderStyle() {
                return { ...HOLDER_STYLE };
            },
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
                this.closeReported = false;
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
                    this.fileSender.send();
                    return;
                }

                if(this.lifecycle.requestOpen()) {
                    this.logger.verbose("Opening importer modal");
                    this.isModalShown = true;
                    this.closeReported = false;
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
                    this.fileSender.send();
                    return;
                }

                this.openModal();
            },
            clearProbeTimer() {
                this.clearFileAckTimer();
                this.fileSender.reset();
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
                    // A newer importer sends the typed message as well; act on that one only.
                    if (!this.messageGate.allowLegacy()) {
                        return;
                    }
                    let ended = this.importTracker.observe(legacy);
                    // Clean up before the callbacks run: a callback that throws must not leave a closed import behind.
                    this.finishImport(ended);
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

                // File handshake messages (what openModalWithFile waits for). handleMessage also learns the
                // importer's origin from any message that carries this instance's token.
                const fileMessage = this.fileSender.handleMessage(event);
                if (fileMessage) {
                    if (fileMessage.type === "probe-reply") {
                        // Reply to our probe (it has no file). It only tells us the origin, so do nothing.
                        return;
                    }
                    if (fileMessage.type === "modal-shown") {
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
                    if (fileMessage.type === "rejected") {
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
                        console.warn("[csvbox] importer declined the supplied file: " + fileMessage.reason);
                        return;
                    }
                }

                let message = classifyStructuredMessage(event.data, this.uuid);
                if (!message) {
                    return;
                }

                this.messageGate.markTyped();
                let ended = this.importTracker.observe(message);
                this.finishImport(ended);
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
                // A repeated close message must not call onClose a second time. The flag is cleared when the importer is opened again.
                if (this.closeReported) {
                    return;
                }
                this.closeReported = true;
                if (this.importTracker.isInFlight()) {
                    // Closed after submitting and before the result arrived: keep the iframe and its
                    // listener so the late result still reaches onImport. It is removed once that
                    // result has been delivered (see finishImport), so the next open is a fresh load.
                    if (this.$refs.holder) {
                        this.$refs.holder.style.display = 'none';
                        this.$refs.holder.style.pointerEvents = 'auto';
                    }
                    this.lifecycle.markHidden();
                    this.isModalShown = false;
                    this.clearFileAckTimer();
                    unregisterOpenImporter(this.registryEntry);
                    this.onClose();
                    return;
                }
                this.destroyImporter();
                this.onClose();
            },
            // Called after the result of an import has been delivered. If the modal was closed in the
            // meantime the iframe was only hidden, so remove it now.
            finishImport(ended) {
                if (ended && !this.isModalShown && this.iframe) {
                    this.destroyImporter();
                }
            },
            // Puts the importer away: the next open builds a new iframe with a new token.
            destroyImporter() {
                if (this.$refs.holder) {
                    this.$refs.holder.style.display = 'none';
                    this.$refs.holder.style.pointerEvents = 'auto';
                    this.$refs.holder.innerHTML = '';
                }
                this.lifecycle.markClosed();
                this.messageGate.reset();
                this.importTracker.reset();
                // A new iframe is built on the next open, so the origin is learned again.
                this.clearProbeTimer();
                this.isModalShown = false;
                this.isIframeLoaded = false;
                this.iframe = null;
                unregisterOpenImporter(this.registryEntry);
            },
            syncBlocked() {
                this.blockedByOther = isBlockedByOpenImporter(this.registryEntry);
            },
            initImporter() {
                this.uuid = generateUuid();
                this.messageGate.reset();
                this.importTracker.reset();
                this.closeReported = false;
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
                Object.assign(iframe.style, IFRAME_STYLE);

                window.addEventListener("message", this.onMessageEvent, false);

                iframe.onload = () => {
                    this.isIframeLoaded = true;
                    this.logger.info("Importer ready");
                    iframe.contentWindow.postMessage(buildInitPayload(this.user, this.dynamicColumns, this.options, this.uuid), "*");
                    this.disableImportButton = false;
                    // The importer is ready whatever the callback does: if onReady throws, an open that was waiting
                    // for the iframe must still go ahead.
                    const openWhenReady = this.lifecycle.markReady();
                    try {
                        this.onReady();
                    } finally {
                        if (openWhenReady) {
                            this.openModal();
                        }
                    }
                };

                this.$refs.holder.appendChild(iframe);
            }
        },
        created() {
            // Plain properties, not data(): they hold no template state and must not be made reactive.
            this.messageGate = createMessageGate();
            this.closeReported = false;
            this.importTracker = createImportTracker();
            this.registryEntry = { getHolder: () => this.$refs.holder };
            this.fileSender = createFileSender({
              getIframe: () => this.iframe,
              getToken: () => this.uuid,
              getTargetOrigin: () => this.targetOrigin,
              getBaseDomain: () => this.baseDomain,
              takeFile: () => {
                const file = this.pendingFile;
                this.pendingFile = null;
                return file;
              },
              onSent: () => this.startFileAckTimer()
            });
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
            this.destroyImporter();
            if (this.unsubscribeOpenImporters) {
                this.unsubscribeOpenImporters();
                this.unsubscribeOpenImporters = null;
            }
        }
    }
</script>
