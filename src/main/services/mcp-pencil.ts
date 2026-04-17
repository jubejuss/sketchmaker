import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execSync } from 'child_process'
import fs from 'fs'
import type { MoodboardData, DirectionSpec, SectionSpec, VisualElement } from '../../shared/types.js'
import {
  buildElementSubtree,
  columnFrameData,
  countOpsInSubtree,
  sectionFrameData,
  type PendingImage
} from './pencil-script.js'

// Pencil.app ships its own MCP bridge binary (stdio ↔ WebSocket, --app desktop).
// The legacy copy at ~/.pencil/mcp/cursor/out/ is kept as fallback — same binary,
// older install path.
const PENCIL_BINARY_BUNDLED = '/Applications/Pencil.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64'
const PENCIL_BINARY_LEGACY = '/Users/juhokalberg/.pencil/mcp/cursor/out/mcp-server-darwin-arm64'

const MAX_OPS_PER_BATCH = 24

function getPencilBinary(): { binary: string; app: string } {
  try {
    if (fs.existsSync(PENCIL_BINARY_BUNDLED)) {
      return { binary: PENCIL_BINARY_BUNDLED, app: 'desktop' }
    }
  } catch {}
  return { binary: PENCIL_BINARY_LEGACY, app: 'desktop' }
}

function isPencilRunning(): boolean {
  try {
    execSync('pgrep -x Pencil 2>/dev/null', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function launchPencil(): void {
  try {
    execSync('open -a Pencil 2>/dev/null', { stdio: 'pipe' })
  } catch {}
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Pencil timeout (${label}, ${ms}ms) — is Pencil app open?`)), ms)
    )
  ])
}

async function connectPencil(): Promise<Client> {
  const { binary, app } = getPencilBinary()
  console.log(`[pencil] Using binary: ${binary} --app ${app}`)
  const transport = new StdioClientTransport({
    command: binary,
    args: ['--app', app],
    env: { PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin' }
  })
  const client = new Client({ name: 'stiilileidja', version: '0.1.0' })
  await withTimeout(client.connect(transport), 8000, 'connect')
  return client
}

export async function checkPencilAvailable(): Promise<{ ok: boolean; error?: string }> {
  if (!isPencilRunning()) {
    return { ok: false, error: 'Pencil rakendus ei tööta. Ava /Applications/Pencil.app käsitsi.' }
  }
  let client: Client | null = null
  try {
    client = await connectPencil()
    await withTimeout(
      client.callTool({ name: 'get_editor_state', arguments: { include_schema: false } }),
      5000,
      'get_editor_state'
    )
    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message
    console.log('[pencil] availability check failed:', msg)
    return { ok: false, error: msg }
  } finally {
    if (client) {
      try { await (client as Client & { close?: () => Promise<void> }).close?.() } catch {}
    }
  }
}

// ── Response parsing ────────────────────────────────────────────────────────

function resultText(result: unknown): string {
  if (typeof result !== 'object' || result === null) return ''
  const r = result as Record<string, unknown>
  if (Array.isArray(r.content)) {
    const parts: string[] = []
    for (const item of r.content) {
      if (typeof item === 'object' && item !== null) {
        const i = item as Record<string, unknown>
        if (typeof i.text === 'string') parts.push(i.text)
      }
    }
    return parts.join('\n')
  }
  return ''
}

function resultImage(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null
  const r = result as Record<string, unknown>
  if (!Array.isArray(r.content)) return null
  for (const item of r.content) {
    if (typeof item === 'object' && item !== null) {
      const i = item as Record<string, unknown>
      if (i.type === 'image' && typeof i.data === 'string') return i.data
    }
  }
  return null
}

function extractFilePath(result: unknown): string | null {
  const text = resultText(result)
  // A saved .pen file, e.g. "- `/Users/foo/design.pen`". Unsaved new docs
  // report the path as "/new" which is useless for batch_design, so we
  // deliberately don't match that.
  const m = text.match(/[`"']?(\/[^\s`"']+\.pen)[`"']?/)
  return m ? m[1] : null
}

// Pencil's get_editor_state prints top-level nodes as:
//   - `3TKdx` (frame): Some Name [user visible]
// We harvest the IDs so we can D() them before inserting fresh content —
// open_document("new") reopens the same untitled document rather than
// returning a pristine canvas, so leftovers from prior runs pile up.
function extractTopLevelNodeIds(result: unknown): string[] {
  const text = resultText(result)
  const re = /^-\s*`([a-zA-Z0-9_-]+)`\s*\(/gm
  const ids: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) ids.push(m[1])
  return ids
}

// Parse binding→nodeId map from batch_design response. Pencil's actual format
// (verified via scripts/probe-pencil-batch.ts) is:
//
//   # Successfully executed all operations.
//
//   ## Created binding → node IDs
//   ```
//   a → kbVl6
//     c → V8csS
//   b → 5Jjyo
//   ```
//
// Each non-fence line inside the code block is `<indent><binding> → <id>`.
// IDs are 5-char alphanumeric strings (Pencil's scheme), so we can't require
// long IDs. We match per-line (multiline anchors) to avoid capturing the
// heading "binding → node" as a false pair.
function parseBindingMap(result: unknown, expected: readonly string[]): Record<string, string> {
  const text = resultText(result)
  const out: Record<string, string> = {}

  const lineRe = /^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*→\s*([a-zA-Z0-9_-]{3,})\s*$/gm
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(text)) !== null) {
    if (!out[m[1]]) out[m[1]] = m[2]
  }

  const missing = expected.filter((b) => !out[b])
  if (missing.length > 0) {
    console.warn('[pencil] missing bindings in response:', missing, '\nraw:', text.slice(0, 1200))
  }
  return out
}

// ── Batch execution helpers ─────────────────────────────────────────────────

interface PencilClient {
  client: Client
  filePath: string
}

async function runBatch(
  pc: PencilClient,
  lines: string[],
  expected: readonly string[]
): Promise<Record<string, string>> {
  if (lines.length === 0) return {}
  if (lines.length > 25) {
    throw new Error(`Batch exceeds 25 ops (${lines.length})`)
  }
  const operations = lines.join('\n')
  const result = await withTimeout(
    pc.client.callTool({
      name: 'batch_design',
      arguments: { filePath: pc.filePath, operations }
    }),
    60000,
    'batch_design'
  )
  return parseBindingMap(result, expected)
}

// ── Section rendering ───────────────────────────────────────────────────────

// Render a section's elements into one or more batches. Each top-level element
// subtree goes in the same batch as its children (because bindings only span
// one batch). If a top-level subtree alone exceeds MAX_OPS_PER_BATCH, we log a
// warning and skip it — our DSL subtrees are shallow enough that this should
// be rare.
//
// Image G() ops are deferred: Pencil's stock service returns 404 for some
// keywords and the error rolls back the entire batch. We flush insert-only
// batches first to get real node IDs, then apply G() fills in separate
// batches (bulk-first, per-image fallback) so one bad keyword doesn't erase
// the surrounding layout.
async function renderSectionElements(
  pc: PencilClient,
  sectionId: string,
  elements: VisualElement[],
  direction: DirectionSpec,
  onProgress: (msg: string) => void
): Promise<void> {
  let pendingLines: string[] = []
  let pendingImages: PendingImage[] = []

  const flush = async (): Promise<void> => {
    if (pendingLines.length === 0) return
    const expected = pendingImages.map((i) => i.binding)
    const ids = await runBatch(pc, pendingLines, expected)

    const resolved: PendingImage[] = []
    for (const img of pendingImages) {
      const nodeId = ids[img.binding]
      if (nodeId) resolved.push({ binding: nodeId, keywords: img.keywords })
      else console.warn('[pencil] image binding missing from response:', img.binding)
    }

    pendingLines = []
    pendingImages = []

    if (resolved.length > 0) {
      await applyImageFills(pc, resolved, onProgress)
    }
  }

  for (const el of elements) {
    const size = countOpsInSubtree(el)
    if (size > MAX_OPS_PER_BATCH) {
      console.warn('[pencil] element subtree too large, skipping:', el.kind, size, 'ops')
      continue
    }
    if (pendingLines.length + size > MAX_OPS_PER_BATCH) {
      await flush()
    }
    const counter = { value: pendingLines.length }
    const sub = buildElementSubtree(sectionId, false, el, direction, counter, pendingImages)
    pendingLines.push(...sub.lines)
  }
  await flush()
}

// G() failures (e.g. Pencil stock service 404) roll back the whole batch, so
// we try a bulk batch first for throughput, then retry one-per-batch on
// failure so a single bad keyword only drops that one image.
async function applyImageFills(
  pc: PencilClient,
  images: PendingImage[],
  onProgress: (msg: string) => void
): Promise<void> {
  for (let i = 0; i < images.length; i += MAX_OPS_PER_BATCH) {
    const chunk = images.slice(i, i + MAX_OPS_PER_BATCH)
    const lines = chunk.map(
      (img) => `G(${JSON.stringify(img.binding)},"stock",${JSON.stringify(img.keywords)})`
    )
    try {
      await runBatch(pc, lines, [])
      onProgress(`Rakendasin ${chunk.length} pilti`)
    } catch (err) {
      console.warn('[pencil] bulk image batch failed, retrying one-by-one:', (err as Error).message)
      for (const img of chunk) {
        try {
          await runBatch(
            pc,
            [`G(${JSON.stringify(img.binding)},"stock",${JSON.stringify(img.keywords)})`],
            []
          )
        } catch (ie) {
          console.warn('[pencil] image skipped:', img.keywords, '—', (ie as Error).message)
        }
      }
    }
  }
}

// ── Moodboard execution ─────────────────────────────────────────────────────

export async function executePencilMoodboard(
  data: MoodboardData,
  onProgress: (msg: string) => void
): Promise<string | null> {
  if (!isPencilRunning()) {
    onProgress('Käivitan Pencil rakenduse...')
    launchPencil()
    let ready = false
    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 500))
      if (isPencilRunning()) { ready = true; break }
    }
    if (!ready) throw new Error('Pencil ei käivitu. Ava rakendus käsitsi: /Applications/Pencil.app')
    await new Promise((r) => setTimeout(r, 2000))
  }

  onProgress('Ühendan Pencil rakendusega...')
  const client = await connectPencil()

  try {
    const specs = (data.synthesis.directionSpecs || []).slice(0, 3)
    if (specs.length === 0) {
      throw new Error('Suundade spetsifikatsioone pole — Claude sünteesi tulemus puudub.')
    }

    onProgress('Avan uut Pencil dokumenti...')
    const openResult = await withTimeout(
      client.callTool({ name: 'open_document', arguments: { filePathOrTemplate: 'new' } }),
      15000,
      'open_document'
    )
    console.log('[pencil] open_document result:', resultText(openResult).slice(0, 600))

    const stateResult = await withTimeout(
      client.callTool({ name: 'get_editor_state', arguments: { include_schema: false } }),
      8000,
      'get_editor_state'
    )
    console.log('[pencil] get_editor_state result:', resultText(stateResult).slice(0, 600))

    // Pencil's untitled new document reports its path as "/new" which isn't
    // a real .pen file, so extractFilePath returns null. The tool description
    // marks filePath as "optional" despite JSONSchema listing it as required —
    // passing an empty string lets the server target whatever document is
    // active (verified via scripts/probe-pencil-batch.ts).
    const filePath =
      extractFilePath(stateResult) || extractFilePath(openResult) || ''
    if (!filePath) {
      console.log('[pencil] no saved path — operating on active editor (filePath="")')
    }
    const pc: PencilClient = { client, filePath }

    // open_document("new") reopens the same untitled canvas rather than
    // clearing it, so top-level nodes from prior runs linger. Sweep them.
    const staleIds = extractTopLevelNodeIds(stateResult)
    if (staleIds.length > 0) {
      onProgress(`Puhastan ${staleIds.length} vana sõlme...`)
      for (let i = 0; i < staleIds.length; i += MAX_OPS_PER_BATCH) {
        const chunk = staleIds.slice(i, i + MAX_OPS_PER_BATCH)
        await runBatch(pc, chunk.map((id) => `D(${JSON.stringify(id)})`), [])
      }
    }

    // Column frames — one per direction, positioned side by side
    onProgress('Loon suundade veerud...')
    const columnHeight = Math.max(
      ...specs.map((s) => s.sections.reduce((acc, sec) => acc + (sec.height || 300), 0))
    )
    const columnOps: string[] = []
    const expectedColumnBindings: string[] = []
    for (let i = 0; i < specs.length; i++) {
      const binding = `col${i}`
      expectedColumnBindings.push(binding)
      columnOps.push(
        `${binding}=I("document",${JSON.stringify(columnFrameData(specs[i], i, columnHeight))})`
      )
    }
    const columnIds = await runBatch(pc, columnOps, expectedColumnBindings)

    // Per-direction section frames + elements
    for (let di = 0; di < specs.length; di++) {
      const spec = specs[di]
      const colId = columnIds[`col${di}`]
      if (!colId) {
        console.warn('[pencil] no node ID for column', di, '- skipping direction')
        continue
      }

      onProgress(`Suund ${di + 1}: loon sektsioonid...`)

      // Section frames — chunk into ≤24 per batch. Each batch has its own
      // binding-space, so we name bindings sec0..secN per batch and track IDs
      // by their logical section index.
      const sectionFrameIds: (string | null)[] = []
      let sectionIndex = 0
      while (sectionIndex < spec.sections.length) {
        const batchStart = sectionIndex
        const batchLines: string[] = []
        const batchBindings: string[] = []
        let yCursor = spec.sections.slice(0, batchStart).reduce((a, s) => a + (s.height || 300), 0)
        while (
          sectionIndex < spec.sections.length &&
          batchLines.length < MAX_OPS_PER_BATCH
        ) {
          const sec = spec.sections[sectionIndex]
          const bindingName = `s${sectionIndex}`
          batchLines.push(
            `${bindingName}=I(${JSON.stringify(colId)},${JSON.stringify(sectionFrameData(sec.type, yCursor, sec.height || 300))})`
          )
          batchBindings.push(bindingName)
          yCursor += sec.height || 300
          sectionIndex++
        }
        const ids = await runBatch(pc, batchLines, batchBindings)
        for (let k = 0; k < batchBindings.length; k++) {
          sectionFrameIds[batchStart + k] = ids[batchBindings[k]] || null
        }
      }

      // Elements per section
      for (let si = 0; si < spec.sections.length; si++) {
        const sec: SectionSpec = spec.sections[si]
        const secId = sectionFrameIds[si]
        if (!secId) continue
        const elements = sec.elements || []
        if (elements.length === 0) continue
        onProgress(`Suund ${di + 1} — ${sec.type}: ${elements.length} elementi`)
        try {
          await renderSectionElements(pc, secId, elements, spec, onProgress)
        } catch (err) {
          console.warn('[pencil] section render failed:', sec.type, (err as Error).message)
        }
      }
    }

    // Screenshot the first column so the user sees the result. Grabbing all
    // three via a single export would need export_nodes + an output dir; for
    // the interactive preview one column is enough.
    onProgress('Teen ekraanipilti...')
    const firstColId = columnIds.col0
    if (!firstColId) return null
    const shotResult = await withTimeout(
      client.callTool({ name: 'get_screenshot', arguments: { filePath, nodeId: firstColId } }),
      20000,
      'get_screenshot'
    )
    return resultImage(shotResult)
  } finally {
    try { await (client as Client & { close?: () => Promise<void> }).close?.() } catch {}
  }
}
