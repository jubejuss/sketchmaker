import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execSync } from 'child_process'
import type { MoodboardData } from '../../shared/types.js'
import { buildMoodboardHtml } from './prompt-builder.js'

// Paper.app ships its own MCP binary (uses --app desktop)
// Pencil MCP binary (Cursor version) is fallback
const PAPER_BINARY_BUNDLED = '/Applications/Paper.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64'
const PAPER_BINARY_PENCIL = '/Users/juhokalberg/.pencil/mcp/cursor/out/mcp-server-darwin-arm64'

function getPaperBinary(): { binary: string; app: string } {
  try {
    if (require('fs').existsSync(PAPER_BINARY_BUNDLED)) {
      return { binary: PAPER_BINARY_BUNDLED, app: 'desktop' }
    }
  } catch {}
  return { binary: PAPER_BINARY_PENCIL, app: 'desktop' }
}

function isPaperRunning(): boolean {
  try {
    execSync('pgrep -x Paper 2>/dev/null || pgrep -x Pencil 2>/dev/null', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function launchPaper(): void {
  try {
    execSync('open -a Paper 2>/dev/null || open -a Pencil 2>/dev/null', { stdio: 'pipe' })
  } catch {}
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Paper timeout (${ms}ms) — is Pencil app open?`)), ms)
    )
  ])
}

export async function checkPaperAvailable(): Promise<{ ok: boolean; error?: string }> {
  if (!isPaperRunning()) {
    return {
      ok: false,
      error: 'Paper rakendus ei tööta. Ava /Applications/Paper.app käsitsi.'
    }
  }
  let client: Client | null = null
  try {
    client = await connectPaper()
    await withTimeout(
      client.callTool({ name: 'get_basic_info', arguments: {} }),
      5000
    )
    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message
    console.log('[paper] availability check failed:', msg)
    return { ok: false, error: msg }
  } finally {
    if (client) {
      try { await (client as Client & { close?: () => Promise<void> }).close?.() } catch {}
    }
  }
}

async function connectPaper(): Promise<Client> {
  const { binary, app } = getPaperBinary()
  console.log(`[paper] Using binary: ${binary} --app ${app}`)
  const transport = new StdioClientTransport({
    command: binary,
    args: ['--app', app],
    env: {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'
    }
  })

  const client = new Client({
    name: 'stiilileidja',
    version: '0.1.0'
  })

  await withTimeout(client.connect(transport), 8000)
  return client
}

export async function executePaperMoodboard(
  data: MoodboardData,
  onProgress: (msg: string) => void
): Promise<string | null> {
  if (!isPaperRunning()) {
    onProgress('Käivitan Pencil rakenduse...')
    launchPaper()
    // Wait up to 8s for the app to start
    let ready = false
    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (isPaperRunning()) { ready = true; break }
    }
    if (!ready) throw new Error('Paper ei käivitu. Ava rakendus käsitsi: /Applications/Paper.app')
    // Give it a couple extra seconds to fully initialize
    await new Promise(r => setTimeout(r, 2000))
  }

  onProgress('Ühendan Pencil rakendusega...')
  const client = await connectPaper()

  try {
    onProgress('Reading canvas info...')
    await withTimeout(client.callTool({ name: 'get_basic_info', arguments: {} }), 8000)

    onProgress('Creating artboard...')
    const artboardResult = await withTimeout(client.callTool({
      name: 'create_artboard',
      arguments: { name: `Moodboard — ${data.projectName}`, width: 1440, height: 900 }
    }), 10000)

    onProgress('Writing moodboard HTML...')
    const html = buildMoodboardHtml(data)
    await withTimeout(client.callTool({
      name: 'write_html',
      arguments: { html, nodeId: extractNodeId(artboardResult) }
    }), 15000)

    onProgress('Capturing screenshot...')
    const screenshotResult = await withTimeout(
      client.callTool({ name: 'get_screenshot', arguments: {} }), 10000
    )

    onProgress('Finishing...')
    await withTimeout(client.callTool({ name: 'finish_working_on_nodes', arguments: {} }), 5000)

    return extractScreenshot(screenshotResult)
  } finally {
    try { await (client as Client & { close?: () => Promise<void> }).close?.() } catch {}
  }
}

function extractNodeId(result: unknown): string | undefined {
  if (typeof result === 'object' && result !== null) {
    const r = result as Record<string, unknown>
    if (typeof r.nodeId === 'string') return r.nodeId
    if (Array.isArray(r.content)) {
      for (const item of r.content) {
        if (typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).text === 'string') {
          const match = ((item as Record<string, unknown>).text as string).match(/"nodeId"\s*:\s*"([^"]+)"/)
          if (match) return match[1]
        }
      }
    }
  }
  return undefined
}

function extractScreenshot(result: unknown): string | null {
  if (typeof result === 'object' && result !== null) {
    const r = result as Record<string, unknown>
    if (Array.isArray(r.content)) {
      for (const item of r.content) {
        if (typeof item === 'object' && item !== null) {
          const i = item as Record<string, unknown>
          if (i.type === 'image' && typeof i.data === 'string') return i.data
        }
      }
    }
  }
  return null
}
