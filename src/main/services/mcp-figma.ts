import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import fs from 'fs'
import type { MoodboardData } from '../../shared/types.js'
import { buildFigmaScript } from './figma-script.js'
import store from '../store.js'

const FIGMA_MCP_PATH = '/Users/juhokalberg/.nvm/versions/node/v20.19.2/lib/node_modules/figma-console-mcp/dist/local.js'
const NODE_BIN = '/Users/juhokalberg/.nvm/versions/node/v20.19.2/bin/node'

// Persistent daemon state — one process kept alive for the app lifetime
let daemonClient: Client | null = null
let daemonPort: number | null = null
let _startPromise: Promise<void> | null = null

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Figma timeout (${label}, ${ms}ms)`)), ms)
    )
  ])
}

function getPortFiles(): Set<number> {
  const ports = new Set<number>()
  try {
    for (const f of fs.readdirSync('/tmp')) {
      const m = f.match(/^figma-console-mcp-(\d+)\.json$/)
      if (m) ports.add(parseInt(m[1]))
    }
  } catch {}
  return ports
}

async function checkHealth(port: number): Promise<{ ok: boolean; clients: number }> {
  try {
    const resp = await fetch(`http://localhost:${port}/`, {
      signal: AbortSignal.timeout(2000)
    })
    const data = await resp.json() as { status?: string; clients?: number }
    return { ok: true, clients: data.clients ?? 0 }
  } catch {
    return { ok: false, clients: 0 }
  }
}

async function _startDaemon(): Promise<void> {
  const figmaToken = store.get('figmaAccessToken')
  if (!figmaToken) {
    console.log('[figma-daemon] No token configured — skipping')
    return
  }

  // Snapshot existing ports before spawning to identify our new process
  const portsBefore = getPortFiles()
  console.log('[figma-daemon] Existing ports before spawn:', [...portsBefore])

  const transport = new StdioClientTransport({
    command: NODE_BIN,
    args: [FIGMA_MCP_PATH],
    env: {
      FIGMA_ACCESS_TOKEN: figmaToken,
      ENABLE_MCP_APPS: 'true',
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin'
    }
  })

  const client = new Client({ name: 'stiilileidja', version: '0.1.0' })

  try {
    await withTimeout(client.connect(transport), 8000, 'daemon-connect')
  } catch (err) {
    console.error('[figma-daemon] Failed to connect:', err)
    throw err
  }

  // Wait for our new /tmp/figma-console-mcp-PORT.json to appear (up to 5s)
  let ourPort: number | null = null
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const portsAfter = getPortFiles()
    for (const port of portsAfter) {
      if (!portsBefore.has(port)) {
        ourPort = port
        break
      }
    }
    if (ourPort) break
    await new Promise(r => setTimeout(r, 250))
  }

  daemonClient = client
  daemonPort = ourPort
  console.log(`[figma-daemon] Running on port ${ourPort ?? 'unknown (port file not found)'}`)

  // When the process exits, clear state so the next call restarts it
  transport.onclose = () => {
    console.log('[figma-daemon] Transport closed — resetting state')
    daemonClient = null
    daemonPort = null
    _startPromise = null
  }
}

/**
 * Start the figma-console-mcp daemon once at app launch.
 * Subsequent calls return immediately if already running.
 * The Figma Desktop Bridge plugin will discover this process during its ONE port scan.
 * If the plugin was already running before the app started, the user must reload the plugin.
 */
export async function startFigmaDaemon(): Promise<void> {
  if (daemonClient) return  // already running, nothing to do

  if (_startPromise) {
    await _startPromise  // already starting, wait for it
    return
  }

  _startPromise = _startDaemon().catch(err => {
    console.error('[figma-daemon] Start failed:', err)
    daemonClient = null
    daemonPort = null
  }).finally(() => {
    _startPromise = null
  })

  await _startPromise
}

export async function getFigmaStatus(): Promise<{ running: boolean; port: number | null; clients: number }> {
  if (!daemonClient) return { running: false, port: null, clients: 0 }
  if (!daemonPort) return { running: true, port: null, clients: 0 }
  const health = await checkHealth(daemonPort)
  return { running: health.ok, port: daemonPort, clients: health.clients }
}

export async function checkFigmaAvailable(): Promise<{ ok: boolean; error?: string }> {
  const figmaToken = store.get('figmaAccessToken')
  if (!figmaToken) {
    return { ok: false, error: 'Figma Access Token puudub seadetest. Lisa token Seaded → Figma Access Token.' }
  }

  // Try to start daemon if not running (in case app restarted or token was just added)
  if (!daemonClient) {
    await startFigmaDaemon()
  }

  if (!daemonClient) {
    return { ok: false, error: 'Figma MCP protsess ei käivitu. Kontrolli terminalis: npm install -g figma-console-mcp' }
  }

  if (!daemonPort) {
    return { ok: false, error: 'Figma MCP server käivitus aga pordi faili ei leita. Taaskäivita rakendus.' }
  }

  const health = await checkHealth(daemonPort)
  if (!health.ok) {
    return { ok: false, error: `Figma MCP server ei vasta pordil ${daemonPort}. Taaskäivita rakendus.` }
  }

  if (health.clients === 0) {
    return {
      ok: false,
      error:
        `Figma Desktop Bridge plugin ei ole ühendunud (server töötab pordil ${daemonPort}).\n\n` +
        'Plugin skaneerib saadaval olevaid porte ainult KORD käivitumisel — ' +
        'kui plugin käivitus enne stiilileidja rakendust, ei leia ta serveri porti.\n\n' +
        'Lahendus — tee ainult ÜKS kord:\n' +
        '1. Ava Figma Desktop\n' +
        '2. Plugins → Development → Figma Desktop Bridge\n' +
        '3. Sule plugin (klõpsa X)\n' +
        '4. Ava plugin uuesti — nüüd peaks ta ühenduma automaatselt\n\n' +
        'Pärast seda töötab Figma Execute normaalselt.'
    }
  }

  return { ok: true }
}

export async function executeFigmaMoodboard(
  data: MoodboardData,
  onProgress: (msg: string) => void
): Promise<string | null> {
  if (!daemonClient) {
    throw new Error('Figma MCP daemon ei tööta. Taaskäivita rakendus.')
  }

  const client = daemonClient

  onProgress('Kontrollin Figma ühendust...')
  await withTimeout(
    client.callTool({ name: 'figma_list_open_files', arguments: {} }),
    8000,
    'figma_list_open_files'
  )

  onProgress('Loon värvivariable...')
  const { colorStrategy } = data.synthesis
  await withTimeout(
    client.callTool({
      name: 'figma_batch_create_variables',
      arguments: {
        collection_name: 'Brand',
        variables: [
          { name: 'color/primary', type: 'COLOR', value: colorStrategy.primary },
          { name: 'color/accent', type: 'COLOR', value: colorStrategy.accent },
          { name: 'color/neutral', type: 'COLOR', value: colorStrategy.neutral },
          { name: 'color/background', type: 'COLOR', value: colorStrategy.background }
        ]
      }
    }),
    10000,
    'figma_batch_create_variables'
  )

  onProgress('Ehitan moodboardi raamid...')
  const script = buildFigmaScript(data)
  // timeout:30000 is the maximum figma_execute allows (schema max: 30000)
  await withTimeout(
    client.callTool({ name: 'figma_execute', arguments: { code: script, timeout: 30000 } }),
    35000,
    'figma_execute'
  )

  onProgress('Salvestan ekraanipildi...')
  // Brief pause to avoid 429 rate limit on Figma REST API (screenshot uses REST, not plugin)
  await new Promise(r => setTimeout(r, 2000))
  let screenshotResult: unknown = null
  try {
    screenshotResult = await withTimeout(
      client.callTool({ name: 'figma_take_screenshot', arguments: {} }),
      10000,
      'figma_take_screenshot'
    )
  } catch (err) {
    console.warn('[figma] Screenshot failed (rate limit or timeout):', (err as Error).message)
  }

  return extractScreenshot(screenshotResult)
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
