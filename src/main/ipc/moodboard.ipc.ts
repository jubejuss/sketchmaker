import { ipcMain, BrowserWindow, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import { checkFigmaAvailable, executeFigmaMoodboard, getFigmaStatus, probeFigmaImages } from '../services/mcp-figma.js'
import { checkPencilAvailable, executePencilMoodboard } from '../services/mcp-pencil.js'
import { buildPrompt } from '../services/prompt-builder.js'
import store from '../store.js'
import type { MoodboardData, OutputMode } from '../../shared/types.js'

export function registerMoodboardIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle('check-mcp-status', async () => {
    const [figmaResult, pencilResult, figmaStatus] = await Promise.all([
      checkFigmaAvailable().catch((e) => ({ ok: false, error: String(e) })),
      checkPencilAvailable().catch((e) => ({ ok: false, error: String(e) })),
      getFigmaStatus()
    ])
    return {
      figma: figmaResult.ok,
      pencil: pencilResult.ok,
      figmaError: figmaResult.error,
      pencilError: pencilResult.error,
      figmaPort: figmaStatus.port,
      figmaClients: figmaStatus.clients,
      figmaDaemonRunning: figmaStatus.running
    }
  })

  ipcMain.handle('probe-figma-images', async () => {
    try {
      const result = await probeFigmaImages()
      return { ok: true, result }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('generate-moodboard', async (_event, data: MoodboardData, mode: OutputMode) => {
    const sendProgress = (msg: string): void => {
      mainWindow.webContents.send('moodboard:progress', msg)
    }

    const language = data.language ?? store.get('outputLanguage') ?? 'et'
    const enrichedData: MoodboardData = { ...data, language }

    if (mode === 'figma-execute') {
      const check = await checkFigmaAvailable()
      if (!check.ok) {
        return {
          success: false,
          fallback: 'figma-prompt',
          message: check.error ?? 'Figma ühendus ebaõnnestus.',
          prompt: buildPrompt(enrichedData, 'figma-prompt')
        }
      }
      const screenshot = await executeFigmaMoodboard(enrichedData, sendProgress)
      return {
        success: true,
        screenshot,
        message: screenshot ? undefined : 'Moodboard loodud Figmas! Ava Figma, et näha tulemust.'
      }
    }

    if (mode === 'pencil-execute') {
      const check = await checkPencilAvailable()
      if (!check.ok) {
        return {
          success: false,
          fallback: 'pencil-prompt',
          message: check.error ?? 'Pencil ühendus ebaõnnestus.',
          prompt: buildPrompt(enrichedData, 'pencil-prompt')
        }
      }
      const screenshot = await executePencilMoodboard(enrichedData, sendProgress)
      return { success: true, screenshot }
    }

    // Prompt modes — save to file and return
    const generatedPrompt = buildPrompt(enrichedData, mode)
    const outputDir = store.get('outputDir') || path.join(app.getPath('desktop'), 'stiilileidja-output')
    fs.mkdirSync(outputDir, { recursive: true })

    const timestamp = new Date().toISOString().slice(0, 10)
    const filename = `${timestamp}-moodboard-prompt-${mode.replace('-prompt', '')}.md`
    const promptPath = path.join(outputDir, filename)
    fs.writeFileSync(promptPath, generatedPrompt.prompt, 'utf-8')
    shell.showItemInFolder(promptPath)

    return { success: true, promptPath, prompt: generatedPrompt }
  })
}
