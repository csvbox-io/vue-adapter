<template>
  <div>
    <CSVBoxButton licenseKey="Sheet license key" :user="{ user_id: 'default123' }" :onImport="onImport">Import</CSVBoxButton>
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
      console.log(result, data);
      if(result){
        console.log("success");
        console.log(data.row_success + " rows uploaded");
        //custom code
      }else{
        console.log("fail");
        //custom code
      }
    }
  },
  mounted() {
    
  },
}
</script>
