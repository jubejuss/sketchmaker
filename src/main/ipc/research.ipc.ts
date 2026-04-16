import { ipcMain, BrowserWindow } from 'electron'
import { researchCompetitors } from '../services/ahrefs.js'
import { analyzeSeoWcag } from '../services/seo-wcag.js'
import store from '../store.js'
import type { ScrapedSite } from '../../shared/types.js'

export function registerResearchIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('research-competitors', async (_event, domain: string) => {
    const apiKey = store.get('ahrefsApiKey')
    console.log('[research] competitors for domain:', domain, '| ahrefs key present:', !!apiKey)
    try {
      const result = await researchCompetitors(apiKey, domain)
      console.log('[research] competitors done ✓, count:', result?.length ?? 0)
      return result
    } catch (err) {
      console.error('[research] competitors error:', err)
      throw err
    }
  })

  ipcMain.handle('analyze-seo-wcag', async (_event, site: ScrapedSite) => {
    const apiKey = store.get('anthropicApiKey')
    console.log('[seo-wcag] apiKey present:', !!apiKey, apiKey ? `(${apiKey.slice(0, 16)}...)` : '(empty)')
    console.log('[seo-wcag] site url:', site?.url)
    if (!apiKey) throw new Error('API võti puudub. Kontrolli seadeid.')
    try {
      const result = await analyzeSeoWcag(apiKey, site, (token: string) => {
        mainWindow.webContents.send('seo-wcag:token', token)
      })
      console.log('[seo-wcag] done ✓ seo score:', result?.seo?.score, 'wcag score:', result?.wcag?.score)
      return result
    } catch (err) {
      console.error('[seo-wcag] error:', err)
      throw err
    }
  })
}
