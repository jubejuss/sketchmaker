import { ipcMain, BrowserWindow } from 'electron'
import { synthesize } from '../services/claude.js'
import { generateImagesForDirections } from '../services/image-gen.js'
import store from '../store.js'
import type { SynthesisContext } from '../../shared/types.js'

export function registerSynthesisIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('synthesize-brief', async (_event, context: SynthesisContext) => {
    const authMode = store.get('authMode') || 'api-key'
    const apiKey = store.get('anthropicApiKey')
    const imageSource = store.get('imageSource') || 'pexels'
    const openaiKey = store.get('openaiApiKey') || ''
    const pexelsKey = store.get('pexelsApiKey') || ''

    console.log('[synthesize] authMode:', authMode)
    console.log('[synthesize] apiKey present:', !!apiKey, apiKey ? `(${apiKey.slice(0, 16)}...)` : '(empty)')
    console.log('[synthesize] brief length:', context.brief?.length ?? 0, 'competitors:', context.competitors?.length ?? 0)

    if (!apiKey) throw new Error('API võti puudub. Kontrolli seadeid.')

    try {
      const result = await synthesize(
        apiKey,
        context,
        (token: string) => { mainWindow.webContents.send('synthesis:token', token) },
        (attempt: number, waitSec: number) => {
          console.warn(`[synthesize] waiting ${waitSec}s (attempt ${attempt})`)
          mainWindow.webContents.send('synthesis:rate-limit-wait', { attempt, waitSec })
        }
      )
      console.log('[synthesize] done ✓ keys:', Object.keys(result))
      console.log('[synthesize] discoveredCompetitors:', result.discoveredCompetitors?.length ?? 'none')
      console.log('[synthesize] seoWcag present:', !!result.seoWcag)

      const activeKey = imageSource === 'pexels' ? pexelsKey : openaiKey
      if (activeKey && result.directionSpecs && result.directionSpecs.length > 0) {
        console.log(`[synthesize] fetching images (${imageSource})...`)
        mainWindow.webContents.send('synthesis:image-progress', { done: 0, total: 0, label: 'Alustan piltide otsingut' })
        const imgResult = await generateImagesForDirections(
          imageSource,
          { openaiApiKey: openaiKey, pexelsApiKey: pexelsKey },
          result.directionSpecs,
          (done, total, label) => {
            mainWindow.webContents.send('synthesis:image-progress', { done, total, label })
          }
        )
        console.log(`[synthesize] images (${imageSource}): generated ${imgResult.generated}, failed ${imgResult.failed}`)
      } else if (!activeKey) {
        console.log(`[synthesize] skipping image fetch — no ${imageSource} key`)
      }

      return result
    } catch (err) {
      console.error('[synthesize] error:', err)
      throw err
    }
  })
}
