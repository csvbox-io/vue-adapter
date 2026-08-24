<template>
    <div>
        <button :disabled="disableImportButton" @click.prevent="openModal">
            <slot></slot>
        </button>
        <div ref="holder" class="holder-style"></div>
    </div>
</template>
<script>

    import { version } from "../../package.json";
    import { Logger } from "../utils/Logger";
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
            };
        },
        methods: {
            openModal() {
                if(!this.iframe) {
                    this.lifecycle.requestOpen();
                    this.initImporter();
                    return;
                }

                this.logger.info("openModal();");

                if(this.lifecycle.requestOpen()) {
                    this.logger.verbose("Opening importer modal");
                    this.$refs.holder.style.display = 'block';
                    this.iframe.contentWindow.postMessage('openModal', '*');
                } else {
                    this.logger.verbose("Modal already showing, shown, or queued to open once ready");
                }
            },
            onMessageEvent(event) {
                let legacy = classifyLegacyMessage(event.data);
                if (legacy) {
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
                    this.$refs.holder.innerHTML = '';
                }
                this.lifecycle.markClosed();
                this.iframe = null;
                this.onClose();
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
                iframe.frameBorder = 0;
                iframe.classList.add('csvbox-iframe');

                window.addEventListener("message", this.onMessageEvent, false);

                iframe.onload = () => {
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
        mounted() {
            if(this.lazy) {
                this.disableImportButton = false;
            } else {
                this.initImporter();
            }
        },
        beforeDestroy() {
            this.logger.verbose("Removing message event listener");
            window.removeEventListener("message", this.onMessageEvent);
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