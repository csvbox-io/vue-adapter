<template>
    <div>
        <button :disabled="disableImportButton" @click="openModal">
            <slot></slot>
        </button>
        <div ref="holder" class="holder-style">
            <iframe ref="iframe" class="iframe" :src="iframeSrc" frameBorder="0"></iframe>
        </div>
    </div>
</template>
<script>
    export default{
        name: 'csvbox-button',
        props: {
            licenseKey: {
                type: String,
                required: true
            },
            debugMode: {
                type: Boolean,
                required: false
            },
            useStagingServer: {
                type: Boolean,
                required: false
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
            onClose:{
                type: Function,
                default: function() {}
            },
            user: {
                type: Object,
                default: function () {
                    return { user_id: 'default123' };
                }
            },
            dynamicColumns:{
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
            }
        },
        computed:{
            iframeSrc() {
                let BASE_URL = `https://${this.useStagingServer ? 'staging' : 'app' }.csvbox.io/embed/${this.licenseKey}`;
                return `${BASE_URL}?library-version=2&source=embedCode&sourceLang=vue`;
            }
        },
        data(){
            return {
                isModalShown: false,
                disableImportButton: true,
                uuid: this._uid + '_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
            }
        },
        methods: {
            openModal() {
                if(!this.isModalShown) {
                    this.isModalShown = true;
                    this.$refs.holder.style.display = 'block';
                    this.$refs.iframe.contentWindow.postMessage('openModal', '*');
                }
            },
            onMessageEvent(event) {
                if (event.data === "mainModalHidden") {
                    this.$refs.holder.style.display = 'none';
                    this.isModalShown = false;
                    this.onClose();
                }
                if(event.data === "uploadSuccessful") {
                    this.onImport(true);
                }
                if(event.data === "uploadFailed") {
                    this.onImport(false);
                }
                if(typeof event.data == "object") {
                    if(event?.data?.data?.unique_token == this.uuid) {
                        if(event.data.type && event.data.type == "data-on-submit") {
                            let metadata = event.data.data;
                            metadata["column_mappings"] = event.data.column_mapping;
                            // this.callback(true, metadata);
                            delete metadata["unique_token"];
                            this.onSubmit?.(metadata);
                        }
                        else if(event.data.type && event.data.type == "data-push-status") {
                            if(event.data.data.import_status == "success") {
                                if(event.data && event.data.row_data) {
                                    let primary_row_data = event.data.row_data;
                                    let headers = event.data.headers;
                                    let rows = [];
                                    let dynamic_columns_indexes = event.data.dynamicColumnsIndexes;
                                    let virtual_columns_indexes = event.data.virtualColumnsIndexes || [];

                                    let dropdown_display_labels_mappings = event.data.dropdown_display_labels_mappings;
                                    primary_row_data.forEach((row_data) => {
                                        
                                        let x = {};
                                        let dynamic_columns = {};
                                        let virtual_data = {};
                                        
                                        row_data.data.forEach((col, i)=>{
                                            if(col == undefined){ col = "" }
                                            if(!!dropdown_display_labels_mappings[i] && !!dropdown_display_labels_mappings[i][col]) {
                                                col = dropdown_display_labels_mappings[i][col];
                                            }
                                            if(dynamic_columns_indexes.includes(i)) {
                                                dynamic_columns[headers[i]] = col;
                                            }
                                            else if(virtual_columns_indexes.includes(i)) {
                                                virtual_data[headers[i]] = col;
                                            }
                                            else{
                                                x[headers[i]] = col;
                                            }
                                        });

                                        if(row_data.unmapped_data) {
                                            x["_unmapped_data"] = row_data.unmapped_data;
                                        }
                                        if(dynamic_columns && Object.keys(dynamic_columns).length > 0) {
                                            x["_dynamic_data"] = dynamic_columns;
                                        }
                                        if(virtual_data && Object.keys(virtual_data).length > 0) {
                                            x["_virtual_data"] = virtual_data;
                                        }

                                        rows.push(x);
                                    });
                                    let metadata = event.data.data;
                                    metadata["rows"] = rows;
                                    delete metadata["unique_token"];
                                    this.onImport(true, metadata);
                                }else{
                                    let metadata = event.data.data;
                                    delete metadata["unique_token"];
                                    this.onImport(true, metadata);
                                }
                            } else {
                                this.onImport(false, event.data.data);
                            }
                        }
                    }
                }
            },
            randomString() {
                let result = '';
                let characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
                let charactersLength = characters.length;
                for (let i = 0; i < 20; i++) {
                    result += characters.charAt(Math.floor(Math.random() * charactersLength)); 
                }
                return result;
            }
        },
        mounted() {

            window.addEventListener("message", this.onMessageEvent, false);

            let iframe = this.$refs.iframe;

            let self = this;

            iframe.onload = function () {

                iframe.contentWindow.postMessage({
                    "customer" : self.user ? self.user : null,
                    "columns" : self.dynamicColumns ? self.dynamicColumns : null,
                    "options" : self.options ? self.options : null,
                    "unique_token": self.uuid
                }, "*");

                self.disableImportButton = false;

                self.onReady();

            }
        },
        beforeDestroy() {
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
    .iframe {
        height: 100%;
        width: 100%;
        position: absolute;
        top: 0;
        left: 0;
    }
</style>