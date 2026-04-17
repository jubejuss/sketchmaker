import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import type { MoodboardData } from '../../shared/types.js'
import { buildFigmaScript } from './figma-script.js'
import { cleanupImageTempFiles } from './image-gen.js'
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

/**
 * Clean up orphaned figma-console-mcp daemons from previous crashed Electron runs.
 *
 * An orphan has PPID=1 (reparented to launchd after its Electron parent died).
 * Healthy daemons still have an Electron parent. We also clear stale port files
 * whose PID no longer exists.
 *
 * This runs once on startup, before we spawn our own daemon. If a live orphan
 * was serving another app (e.g., Claude Desktop after a crash), that app will
 * need to reconnect — but leaving orphans around means OUR startup fails with
 * "port file not found" because the new daemon gets pushed to a different port.
 */
function cleanupOrphanDaemons(): void {
  let files: string[] = []
  try {
    files = fs.readdirSync('/tmp').filter(f => /^figma-console-mcp-\d+\.json$/.test(f))
  } catch {
    return
  }

  for (const f of files) {
    const filePath = `/tmp/${f}`
    let pid: number | null = null
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { pid?: unknown }
      if (typeof data.pid === 'number') pid = data.pid
    } catch {}

    if (!pid) {
      try { fs.unlinkSync(filePath) } catch {}
      console.log(`[figma-daemon] Removed unreadable port file ${f}`)
      continue
    }

    // process.kill(pid, 0) throws ESRCH if the PID doesn't exist
    let alive = true
    try { process.kill(pid, 0) } catch { alive = false }

    if (!alive) {
      try { fs.unlinkSync(filePath) } catch {}
      console.log(`[figma-daemon] Removed stale port file ${f} (PID ${pid} dead)`)
      continue
    }

    let ppid: number | null = null
    try {
      ppid = parseInt(execSync(`ps -o ppid= -p ${pid}`, { encoding: 'utf8' }).trim())
    } catch {}

    if (ppid === 1) {
      try { process.kill(pid, 'SIGKILL') } catch {}
      try { fs.unlinkSync(filePath) } catch {}
      console.log(`[figma-daemon] Killed orphan daemon PID ${pid} (port file ${f})`)
    }
  }
}

async function _startDaemon(): Promise<void> {
  const figmaToken = store.get('figmaAccessToken')
  if (!figmaToken) {
    console.log('[figma-daemon] No token configured — skipping')
    return
  }

  cleanupOrphanDaemons()

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

/**
 * Probe Figma's image APIs via the already-connected Bridge daemon.
 * Runs a tiny focused script to identify which image creation path works
 * in the Bridge eval sandbox, then tries applying the resulting hash as
 * an image fill on a live rectangle. Result is returned as JSON.
 */
export async function probeFigmaImages(): Promise<unknown> {
  if (!daemonClient) {
    throw new Error('Figma MCP daemon ei tööta. Taaskäivita rakendus.')
  }
  const client = daemonClient

  // 1×1 valid JPEG (red pixel), minimal reproducer
  const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAr/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/AP/Z'

  const code = `
const report = { apis: {} };
report.apis.createImage = typeof figma.createImage;
report.apis.createImageAsync = typeof figma.createImageAsync;
report.apis.atob = typeof atob;
report.apis.fetch = typeof fetch;

const TINY = ${JSON.stringify(TINY_JPEG)};
const base64 = TINY.slice(TINY.indexOf(',') + 1);

// Attempt 1: sync createImage(bytes)
report.syncCreateImage = { attempted: false };
if (typeof figma.createImage === 'function' && typeof atob === 'function') {
  report.syncCreateImage.attempted = true;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const img = figma.createImage(bytes);
    report.syncCreateImage.ok = true;
    report.syncCreateImage.hash = img && img.hash;
    report.syncCreateImage.hashLen = (img && img.hash || '').length;
  } catch (e) {
    report.syncCreateImage.ok = false;
    report.syncCreateImage.err = (e && (e.message || e.toString())) || 'unknown';
  }
}

// Attempt 2: createImageAsync(dataUrl)
report.asyncDataUrl = { attempted: false };
if (typeof figma.createImageAsync === 'function') {
  report.asyncDataUrl.attempted = true;
  try {
    const img = await figma.createImageAsync(TINY);
    report.asyncDataUrl.ok = true;
    report.asyncDataUrl.hash = img && img.hash;
    report.asyncDataUrl.hashLen = (img && img.hash || '').length;
  } catch (e) {
    report.asyncDataUrl.ok = false;
    report.asyncDataUrl.err = (e && (e.message || e.toString())) || 'unknown';
  }
}

// Attempt 3: createImageAsync(httpsUrl) — real Pexels CDN
report.asyncHttps = { attempted: false };
if (typeof figma.createImageAsync === 'function') {
  report.asyncHttps.attempted = true;
  try {
    const img = await figma.createImageAsync('https://images.pexels.com/photos/33521778/pexels-photo-33521778.jpeg?auto=compress&cs=tinysrgb&h=650&w=940');
    report.asyncHttps.ok = true;
    report.asyncHttps.hash = img && img.hash;
    report.asyncHttps.hashLen = (img && img.hash || '').length;
  } catch (e) {
    report.asyncHttps.ok = false;
    report.asyncHttps.err = (e && (e.message || e.toString())) || 'unknown';
  }
}

// Attempt 4: apply any produced hash as a fill on a live rectangle
report.setFills = { attempted: false };
const producedHash = (report.syncCreateImage && report.syncCreateImage.hash) ||
                     (report.asyncDataUrl && report.asyncDataUrl.hash) ||
                     (report.asyncHttps && report.asyncHttps.hash);
if (producedHash) {
  report.setFills.attempted = true;
  report.setFills.hashUsed = producedHash;
  try {
    await figma.loadAllPagesAsync();
    const page = figma.currentPage;
    const r = figma.createRectangle();
    r.resize(200, 200);
    r.x = 0; r.y = 0;
    r.name = 'PROBE IMAGE FILL';
    page.appendChild(r);
    r.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: producedHash }];
    report.setFills.ok = true;
    report.setFills.nodeId = r.id;
  } catch (e) {
    report.setFills.ok = false;
    report.setFills.err = (e && (e.message || e.toString())) || 'unknown';
  }
}

return report;
`.trim()

  const result = await withTimeout(
    client.callTool({ name: 'figma_execute', arguments: { code, timeout: 20000 } }),
    25000,
    'figma_execute probe'
  )

  // Step 5: test the REAL production path — write a test image to disk, create
  // a rectangle via figma_execute, then call figma_set_image_fill via MCP with
  // the file path. This validates the end-to-end flow the moodboard uses.
  const filePathReport = await probeFilePathFlow(client, TINY_JPEG)

  return { ...mergeContent(result), filePathFlow: filePathReport }
}

async function probeFilePathFlow(
  client: Client,
  _tinyJpegDataUrl: string
): Promise<unknown> {
  const report: Record<string, unknown> = { attempted: true }
  try {
    // Build a *valid* 32×32 solid-red PNG so the visual check is unambiguous —
    // a proper red rectangle means fill worked, grey means it didn't.
    const pngBytes = buildSolidColorPng(32, 32, 0xFF, 0x33, 0x33)
    const tmpDir = path.join(os.tmpdir(), 'stiilileidja-images')
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'probe-red.png')
    fs.writeFileSync(filePath, pngBytes)
    report.filePath = filePath
    report.fileBytes = fs.statSync(filePath).size

    // Create a rectangle via figma_execute and capture its nodeId
    const createResult = await withTimeout(
      client.callTool({
        name: 'figma_execute',
        arguments: {
          code: `
            await figma.loadAllPagesAsync();
            const page = figma.currentPage;
            const r = figma.createRectangle();
            r.resize(200, 200);
            r.x = 240; r.y = 0;
            r.name = 'PROBE FILE-PATH FILL';
            r.fills = [{ type: 'SOLID', color: { r: 0.78, g: 0.76, b: 0.73 } }];
            page.appendChild(r);
            return { nodeId: r.id };
          `.trim(),
          timeout: 10000
        }
      }),
      15000,
      'figma_execute (probe create rect)'
    )

    const nodeId = extractNodeId(createResult)
    report.nodeId = nodeId
    if (!nodeId) {
      report.ok = false
      report.err = 'failed to extract nodeId from figma_execute result'
      return report
    }

    // Call figma_set_image_fill with the absolute file path
    const fillResult = await withTimeout(
      client.callTool({
        name: 'figma_set_image_fill',
        arguments: { nodeIds: [nodeId], imageData: filePath, scaleMode: 'FILL' }
      }),
      20000,
      'figma_set_image_fill (probe)'
    )
    report.fillResult = fillResult
    report.ok = !isToolError(fillResult)
  } catch (err) {
    report.ok = false
    report.err = (err as Error).message
  }
  return report
}

function mergeContent(result: unknown): Record<string, unknown> {
  if (typeof result === 'object' && result !== null) return result as Record<string, unknown>
  return { result }
}

function extractNodeId(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null
  const r = result as Record<string, unknown>
  if (!Array.isArray(r.content)) return null
  for (const item of r.content) {
    if (typeof item !== 'object' || item === null) continue
    const i = item as Record<string, unknown>
    if (i.type !== 'text' || typeof i.text !== 'string') continue
    try {
      const outer = JSON.parse(i.text) as { result?: { nodeId?: unknown } }
      const id = outer.result?.nodeId
      if (typeof id === 'string') return id
    } catch { /* ignore */ }
  }
  return null
}

// ── Minimal PNG builder (used by the image-API probe) ──────────────────────
// Generates a valid solid-colour RGB PNG with zero dependencies. Figma will
// actually decode and render these pixels, so the probe gives a visual result.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function buildSolidColorPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 2   // colour type: RGB
  // compression (0), filter (0), interlace (0) already zeroed
  const scanlineBytes = 1 + width * 3
  const raw = Buffer.alloc(scanlineBytes * height)
  for (let y = 0; y < height; y++) {
    const off = y * scanlineBytes
    raw[off] = 0 // filter byte (None)
    for (let x = 0; x < width; x++) {
      raw[off + 1 + x * 3] = r
      raw[off + 2 + x * 3] = g
      raw[off + 3 + x * 3] = b
    }
  }
  const idatData = zlib.deflateSync(raw)
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function isToolError(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return true
  const r = result as Record<string, unknown>
  if (r.isError === true) return true
  if (!Array.isArray(r.content)) return false
  for (const item of r.content) {
    if (typeof item !== 'object' || item === null) continue
    const i = item as Record<string, unknown>
    if (i.type !== 'text' || typeof i.text !== 'string') continue
    try {
      const parsed = JSON.parse(i.text) as { error?: unknown; success?: boolean }
      if (parsed.error) return true
      if (parsed.success === false) return true
    } catch { /* ignore */ }
  }
  return false
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
  const sizeKB = (script.length / 1024).toFixed(1)
  const imageElCount = (script.match(/"kind":"image"/g) || []).length
  const dataUrlCount = (script.match(/data:image\//g) || []).length
  console.log(`[figma] script built — size: ${sizeKB} KB, image elements: ${imageElCount}, data URLs embedded: ${dataUrlCount}`)
  // timeout:30000 is the maximum figma_execute allows (schema max: 30000)
  const execResult = await withTimeout(
    client.callTool({ name: 'figma_execute', arguments: { code: script, timeout: 30000 } }),
    35000,
    'figma_execute'
  )

  const imgRequests = extractImgRequests(execResult)
  if (imgRequests.length > 0) {
    // Group nodeIds by shared image source so images that repeat across
    // directions only get uploaded once.
    const bySource = new Map<string, string[]>()
    for (const req of imgRequests) {
      const arr = bySource.get(req.url)
      if (arr) arr.push(req.nodeId)
      else bySource.set(req.url, [req.nodeId])
    }

    let done = 0
    const total = imgRequests.length
    onProgress(`Rakendan pilte 0/${total}...`)
    for (const [source, nodeIds] of bySource) {
      const imageData = resolveImageData(source)
      if (!imageData) { done += nodeIds.length; continue }
      try {
        // 120s per image: the Bridge plugin processes fills serially and each
        // call can take ~60s when many images are queued. 30s caused every
        // call after the first to time out silently, leaving grey rectangles.
        await withTimeout(
          client.callTool({
            name: 'figma_set_image_fill',
            arguments: { nodeIds, imageData, scaleMode: 'FILL' }
          }),
          120000,
          'figma_set_image_fill'
        )
      } catch (err) {
        console.warn('[figma] set_image_fill failed for', nodeIds.length, 'nodes:', (err as Error).message)
      }
      done += nodeIds.length
      onProgress(`Rakendan pilte ${done}/${total}...`)
    }
  }

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

  cleanupImageTempFiles()
  return extractScreenshot(screenshotResult)
}

interface ImgRequest { nodeId: string; url: string }

function extractImgRequests(result: unknown): ImgRequest[] {
  if (typeof result !== 'object' || result === null) return []
  const r = result as Record<string, unknown>
  if (!Array.isArray(r.content)) return []
  for (const item of r.content) {
    if (typeof item !== 'object' || item === null) continue
    const i = item as Record<string, unknown>
    if (i.type !== 'text' || typeof i.text !== 'string') continue
    try {
      const outer = JSON.parse(i.text) as { result?: { imgRequests?: unknown } }
      const requests = outer.result?.imgRequests
      if (!Array.isArray(requests)) return []
      return requests.filter(
        (x): x is ImgRequest =>
          typeof x === 'object' && x !== null &&
          typeof (x as ImgRequest).nodeId === 'string' &&
          typeof (x as ImgRequest).url === 'string'
      )
    } catch {
      return []
    }
  }
  return []
}

/**
 * Convert an imageUrl from image-gen.ts into the `imageData` string that
 * figma_set_image_fill expects. The MCP tool accepts two formats:
 *   - absolute file path starting with '/' → read from disk in the server
 *     (preferred for large images — avoids MCP stdio param truncation)
 *   - raw base64 bytes (no `data:` prefix)
 */
function resolveImageData(source: string): string | null {
  if (!source) return null
  if (source.startsWith('/')) return source
  if (source.startsWith('data:')) {
    const comma = source.indexOf(',')
    return comma < 0 ? null : source.slice(comma + 1)
  }
  return null
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
