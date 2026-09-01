import { createApp } from 'vue'
import { gte } from 'semver'
import App from './App.vue'

const MIN_SUPPORTED_APP_VERSION = '0.1.0'
if (!gte(process.env.VUE_APP_VERSION ?? MIN_SUPPORTED_APP_VERSION, MIN_SUPPORTED_APP_VERSION)) {
  console.warn(`This build requires app version ${MIN_SUPPORTED_APP_VERSION} or later.`)
}

createApp(App).mount('#app')
