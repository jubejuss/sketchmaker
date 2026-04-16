import { ipcMain, shell } from 'electron'
import store from '../store.js'
import type { AppSettings } from '../../shared/types.js'

export function registerSettingsIpc(): void {
  ipcMain.handle('get-settings', () => {
    return {
      authMode: store.get('authMode') || 'api-key',
      researchMode: store.get('researchMode') || 'ahrefs',
      anthropicApiKey: store.get('anthropicApiKey') || '',
      ahrefsApiKey: store.get('ahrefsApiKey') || '',
      figmaAccessToken: store.get('figmaAccessToken') || '',
      openaiApiKey: store.get('openaiApiKey') || '',
      outputDir: store.get('outputDir') || ''
    }
  })

  ipcMain.handle('save-settings', (_event, settings: Partial<AppSettings>) => {
    if (settings.authMode !== undefined) store.set('authMode', settings.authMode)
    if (settings.researchMode !== undefined) store.set('researchMode', settings.researchMode)
    if (settings.anthropicApiKey !== undefined) store.set('anthropicApiKey', settings.anthropicApiKey)
    if (settings.ahrefsApiKey !== undefined) store.set('ahrefsApiKey', settings.ahrefsApiKey)
    if (settings.figmaAccessToken !== undefined) store.set('figmaAccessToken', settings.figmaAccessToken)
    if (settings.openaiApiKey !== undefined) store.set('openaiApiKey', settings.openaiApiKey)
    if (settings.outputDir !== undefined) store.set('outputDir', settings.outputDir)
    return { ok: true }
  })

  ipcMain.handle('open-external', (_event, url: string) => {
    shell.openExternal(url)
  })
}
