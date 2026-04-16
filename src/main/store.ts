import Store from 'electron-store'
import type { AppSettings } from '../shared/types.js'

const store = new Store<AppSettings>({
  defaults: {
    authMode: 'api-key',
    researchMode: 'ahrefs',
    anthropicApiKey: '',
    ahrefsApiKey: '',
    figmaAccessToken: '',
    openaiApiKey: '',
    outputDir: ''
  },
  encryptionKey: 'stiilileidja-v1'
})

export default store
