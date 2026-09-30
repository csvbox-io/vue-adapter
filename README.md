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

## Importing a file you already have

`openModalWithFile(file)` opens the importer on a `File` your own page is holding — from your
own drop target, your own file input, anything — instead of the importer's file picker. The
file still goes through the importer's extension, worksheet and size checks; this skips the
picker, not the validation.

Call it through a template ref:

```jsx
<template>
  <div>
    <CSVBoxButton ref="importer" :licenseKey="licenseKey" :user="user" :onImport="onImport">
      Import
    </CSVBoxButton>

    <input type="file" @change="onFileChosen" />
  </div>
</template>

<script>
export default {
  // ...
  methods: {
    onFileChosen(e) {
      this.$refs.importer.openModalWithFile(e.target.files[0]);
    }
  }
}
</script>
```

The importer can decline a file it is handed, and says why in a console warning
(`[csvbox] importer declined the supplied file: <reason>`):

- `import-in-progress` — the importer is open past its upload step, or is still reading an
  earlier file. An import that is already open stays open.
- `modal-closing` — the importer was closing when the file arrived.
- `import-file-url-configured` — the sheet is set up to load its own file from a URL.

Pass a `File`, not a `Blob`: a `Blob` has no name to read an extension from, and anything that
is not a `File` is ignored.

## Readme

For usage see the guide here - https://help.csvbox.io/getting-started#2-install-code


## License

MIT © [csvbox-io](https://github.com/csvbox-io)
