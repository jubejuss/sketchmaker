import { ipcMain, BrowserWindow, session, clipboard } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import store from '../store.js'

function detectApiKey(): string {
  // Only accept real API keys (sk-ant-api...) — NOT OAuth tokens (sk-ant-oat...)
  // OAuth tokens are scoped to native Anthropic apps and are rejected by the Messages API
  // in third-party applications (Anthropic policy enforced since Jan 2026).

  // 1. Environment variable
  if (process.env.ANTHROPIC_API_KEY?.startsWith('sk-ant-api')) {
    return process.env.ANTHROPIC_API_KEY
  }
  // 2. ~/.claude.json primaryApiKey (only real API keys, not OAuth tokens)
  try {
    const claudeJson = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf-8'))
    if (claudeJson.primaryApiKey?.startsWith('sk-ant-api')) return claudeJson.primaryApiKey
  } catch { /* ignore */ }
  return ''
}

let loginWindow: BrowserWindow | null = null

export function registerAuthIpc(mainWindow: BrowserWindow): void {

  ipcMain.handle('auth-status', async () => {
    const apiKey = store.get('anthropicApiKey')
    if (apiKey) return { loggedIn: true, method: 'api-key' }

    const detected = detectApiKey()
    if (detected) {
      store.set('anthropicApiKey', detected)
      store.set('authMode', 'api-key')
      return { loggedIn: true, method: 'auto-detected' }
    }

    // Check if there's a valid session cookie for claude.ai
    const cookies = await session.defaultSession.cookies.get({ domain: 'claude.ai' })
    const hasSession = cookies.some(c => c.name === 'sessionKey' || c.name === '__session')
    if (hasSession) return { loggedIn: true, method: 'session' }

    return { loggedIn: false }
  })

  ipcMain.handle('detect-api-key', () => {
    const key = detectApiKey()
    if (key) {
      store.set('anthropicApiKey', key)
      store.set('authMode', 'api-key')
      return { found: true, preview: key.slice(0, 16) + '...' }
    }
    return { found: false }
  })

  ipcMain.handle('login-with-claude-code', () => {
    // OAuth tokens (sk-ant-oat...) from Claude Code are blocked for third-party apps
    // by Anthropic policy since January 2026. Always fail gracefully.
    return { ok: false, reason: 'Claude Code OAuth tokenid ei tööta kolmandate osapoolte rakendustes (Anthropic poliitika alates 2026). Kasuta API võtit platform.claude.com lehelt.' }
  })

  ipcMain.handle('open-login-window', () => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.focus()
      return
    }

    loginWindow = new BrowserWindow({
      width: 480,
      height: 700,
      title: 'Logi sisse — Anthropic',
      parent: mainWindow,
      modal: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:anthropic'  // separate session so login persists
      }
    })

    // Go directly to API keys page — console will handle login redirect if needed
    loginWindow.loadURL('https://console.anthropic.com/settings/keys')

    const onNavigate = async (_event: unknown, url: string): Promise<void> => {
      if (url.includes('console.anthropic.com/settings/keys')) {
        await injectHelperBanner(loginWindow!)
      }
    }

    loginWindow.webContents.on('did-navigate', onNavigate)
    loginWindow.webContents.on('did-navigate-in-page', onNavigate)

    // Watch clipboard for API key after user copies it
    let pollInterval: ReturnType<typeof setInterval> | null = null
    pollInterval = setInterval(() => {
      if (!loginWindow || loginWindow.isDestroyed()) {
        if (pollInterval) clearInterval(pollInterval)
        return
      }
      const text = clipboard.readText().trim()
      if (text.startsWith('sk-ant-')) {
        store.set('anthropicApiKey', text)
        store.set('authMode', 'api-key')
        mainWindow.webContents.send('auth:key-captured', text.slice(0, 12) + '...')
        if (pollInterval) clearInterval(pollInterval)
        loginWindow.close()
        mainWindow.show()
        mainWindow.focus()
      }
    }, 500)

    loginWindow.on('closed', () => {
      if (pollInterval) clearInterval(pollInterval)
      loginWindow = null
      mainWindow.webContents.send('auth:window-closed')
      mainWindow.show()
      mainWindow.focus()
    })
  })

  ipcMain.handle('close-login-window', () => {
    loginWindow?.close()
  })
}

async function injectHelperBanner(win: BrowserWindow): Promise<void> {
  await new Promise(r => setTimeout(r, 1200))
  if (win.isDestroyed()) return

  await win.webContents.executeJavaScript(`
    (function() {
      if (document.getElementById('stiilileidja-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'stiilileidja-banner';
      banner.style.cssText = \`
        position: fixed; top: 0; left: 0; right: 0; z-index: 99999;
        background: #1a1a1a; border-bottom: 2px solid #c8a96e;
        padding: 12px 20px; display: flex; align-items: center; gap: 12px;
        font-family: system-ui, sans-serif; font-size: 13px; color: #f0ebe0;
      \`;
      banner.innerHTML = \`
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="#c8a96e" stroke-width="1.5"/>
          <circle cx="8" cy="8" r="2.5" fill="#c8a96e"/>
        </svg>
        <span style="flex:1">
          <strong style="color:#c8a96e">Stiilileidja:</strong>
          Loo uus API võti → klõpsa <strong>Create key</strong> → kopeeri võti → aken sulgub automaatselt
        </span>
      \`;
      document.body.prepend(banner);
    })();
  `).catch(() => {})
}
