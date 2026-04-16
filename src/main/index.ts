import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { registerScraperIpc } from './ipc/scraper.ipc.js'
import { registerResearchIpc } from './ipc/research.ipc.js'
import { registerSynthesisIpc } from './ipc/synthesis.ipc.js'
import { registerReportIpc } from './ipc/report.ipc.js'
import { registerMoodboardIpc } from './ipc/moodboard.ipc.js'
import { registerSettingsIpc } from './ipc/settings.ipc.js'
import { registerAuthIpc } from './ipc/auth.ipc.js'
import { registerProjectsIpc } from './ipc/projects.ipc.js'
import { startFigmaDaemon } from './services/mcp-figma.js'

// Set Playwright browsers path early
app.on('ready', () => {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(app.getPath('userData'), 'browsers')
})

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Register IPC handlers
  registerScraperIpc()
  registerResearchIpc(mainWindow)
  registerSynthesisIpc(mainWindow)
  registerReportIpc()
  registerMoodboardIpc(mainWindow)
  registerSettingsIpc()
  registerAuthIpc(mainWindow)
  registerProjectsIpc()

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
  // Start figma-console-mcp daemon immediately so the Figma Desktop Bridge plugin
  // can find it during its one-time port scan (9223–9232).
  // If Figma was already running with the plugin open, the user needs to reload
  // the plugin once — after that it stays connected for the rest of the session.
  startFigmaDaemon().catch(err => console.error('[main] Figma daemon:', err))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
