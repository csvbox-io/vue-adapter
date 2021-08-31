# @csvbox/vuejs

> Vue adapter for csvbox.io

[![NPM](https://img.shields.io/npm/v/@csvbox/vuejs.svg)](https://www.npmjs.com/package/@csvbox/vuejs) [![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Shell

```bash
npm install @csvbox/vuejs
```

## Usage

```jsx

<template>
  <div>
    <CSVBoxButton
      :licenseKey="licenseKey"
      :user="user"      
      :onImport="onImport">
      Upload File
    </CSVBoxButton>
  </div>
</template>

<script>
import { CSVBoxButton } from '@csvbox/vuejs';

export default {
  name: 'App',
  components: {
    CSVBoxButton,
  },
  data: () => ({
    licenseKey: 'Sheet license key',
    user: {
      user_id: 'default123',
    },
  }),
  methods: {    
    onImport: function (result, data) {    
       if(result) {
          console.log("success");
          console.log(data.row_success + " rows uploaded");
          //custom code
      } else {
          console.log("fail");
          //custom code
      }
    }
  }
}
</script>

```

## Readme

For usage see the guide here - https://help.csvbox.io/getting-started#2-install-code


## License

MIT © [csvbox-io](https://github.com/csvbox-io)
