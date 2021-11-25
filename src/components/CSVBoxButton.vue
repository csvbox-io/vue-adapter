<template>
    <div>
        <button @click="openModal">
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
            onImport:{
                type: Function,
                default: function() {

                }
            },
            user: {
                type: Object,
                default: function (){
                    return { user_id: 'default123' };
                }
            },
            dynamicColumns:{
                type: Array,
                default: function (){
                    return null;
                }
            }

        },
        data(){
            return{
                iframeSrc: "https://app.csvbox.io/embed/" + this.licenseKey,
                isModalShown: false
            }
        },
        methods: {
            openModal() {
                if(!this.isModalShown) {
                    this.$refs.holder.style.display = 'block';
                    this.$refs.iframe.contentWindow.postMessage('openModal', '*');
                    this.isModalShown = true;
                }
            }
        },
        mounted() {
            
            window.addEventListener("message", (event) => {
                if (event.data === "mainModalHidden") {
                    this.$refs.holder.style.display = 'none';
                    this.isModalShown = false;
                }
                if(event.data === "uploadSuccessful") {
                    this.onImport(true);
                }
                if(event.data === "uploadFailed") {
                    this.onImport(false);
                }
                if(typeof event.data == "object") {
                    if(event.data.type && event.data.type == "data-push-status") {
                        if(event.data.data.import_status == "success"){
                            this.onImport(true, event.data.data);
                        }else {
                            this.onImport(false, event.data.data);
                        }

                    }
                }
            }, false);

            let iframe = this.$refs.iframe;
            iframe.onload = function () {
                if(this.user) {
                    iframe.contentWindow.postMessage({
                    "customer" : this.user
                    }, "*");
                }
                if(this.dynamicColumns) {
                    iframe.contentWindow.postMessage({
                    "columns" : this.dynamicColumns
                    }, "*");
                }
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
    .iframe {
        height: 100%;
        width: 100%;
        position: absolute;
        top: 0;
        left: 0;
    }
</style>