<template>
  <div>
    <CSVBoxButton 
      licenseKey="Sheet License Key" 
      :user="{ user_id: 'default123' }" 
      :onImport="onImport"
      :onReady="onReady"
      :onClose="onClose"
      :onSubmit="onSubmit"
      >Import</CSVBoxButton>

  </div>
</template>
<script>

import CSVBoxButton from './components/CSVBoxButton'

export default {
  name: 'App',
  components: {
    CSVBoxButton
  },
  methods: {
    onImport(result, data){
      console.log("onImport", result, data);
      if(result){
        console.log("success");
        console.log(data.row_success + " rows uploaded");
        //custom code
      }else{
        console.log("fail");
        //custom code
      }
    },
    onReady(){
      console.log("onReady")
    },
    onSubmit(data){
      console.log("onSubmit")
      console.log(data)
    },
    onClose(){
      console.log("onClose")
    }
  },
  mounted() {
    
  },
}
</script>
