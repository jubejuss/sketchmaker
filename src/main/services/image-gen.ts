import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import type { DirectionSpec, ImageSource, VisualElement } from '../../shared/types.js'
import { pickOrientation, searchPexelsImage } from './pexels.js'

const TEMP_DIR = path.join(os.tmpdir(), 'stiilileidja-images')

function ensureTempDir(): void {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
}

function tempFilePath(prompt: string, ext: string): string {
  const hash = crypto.createHash('sha1').update(prompt).digest('hex').slice(0, 16)
  return path.join(TEMP_DIR, `${hash}.${ext}`)
}

function extensionFromMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  return 'jpg'
}

export function cleanupImageTempFiles(): void {
  try {
    if (!fs.existsSync(TEMP_DIR)) return
    for (const f of fs.readdirSync(TEMP_DIR)) {
      try { fs.unlinkSync(path.join(TEMP_DIR, f)) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export interface ImageProviderKeys {
  openaiApiKey: string
  pexelsApiKey: string
}

type ImageSize = '1024x1024' | '1536x1024' | '1024x1536'

interface ImagePromptRef {
  element: VisualElement
  prompt: string
  size: ImageSize
}

export async function generateImagesForDirections(
  source: ImageSource,
  keys: ImageProviderKeys,
  directions: DirectionSpec[],
  onProgress?: (done: number, total: number, label?: string) => void
): Promise<{ generated: number; failed: number; source: ImageSource }> {
  const refs: ImagePromptRef[] = []
  for (const dir of directions) {
    for (const section of dir.sections ?? []) {
      walkElements(section.elements, (el) => {
        if (el.kind === 'image' && el.imagePrompt && !el.imageUrl) {
          refs.push({ element: el, prompt: enrichPrompt(el.imagePrompt, dir, source), size: pickSize(el.w, el.h) })
        }
      })
    }
  }

  const total = refs.length
  if (total === 0) return { generated: 0, failed: 0, source }

  const activeKey = source === 'pexels' ? keys.pexelsApiKey : keys.openaiApiKey
  if (!activeKey) return { generated: 0, failed: 0, source }

  let done = 0
  let failed = 0
  onProgress?.(0, total, `Alustan piltide otsingut (${source})`)

  // Pexels has a higher rate budget (200/hr), OpenAI is cost-sensitive — both can handle 3 parallel.
  const CONCURRENCY = 3
  const queue = [...refs]
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const ref = queue.shift()!
        try {
          const url = source === 'pexels'
            ? await fetchPexels(keys.pexelsApiKey, ref)
            : await fetchOpenAI(keys.openaiApiKey, ref)
          if (url) {
            ref.element.imageUrl = url
          } else {
            failed++
          }
        } catch (err) {
          failed++
          console.error(`[image-gen:${source}] failed:`, (err as Error).message, 'prompt:', ref.prompt.slice(0, 80))
        }
        done++
        onProgress?.(done, total, `${done}/${total}`)
      }
    })
  )

  return { generated: total - failed, failed, source }
}

async function fetchPexels(apiKey: string, ref: ImagePromptRef): Promise<string | null> {
  const orientation = pickOrientation(ref.element.w, ref.element.h)
  const url = await searchPexelsImage(apiKey, ref.prompt, orientation, hashString(ref.prompt))
  if (!url) return null
  // Download to a temp file and return the absolute path. figma_set_image_fill
  // accepts absolute file paths (starting with '/') and reads them from disk —
  // this avoids MCP stdio param truncation that silently breaks base64 payloads
  // above ~100 KB, and keeps the figma_execute script small.
  return downloadToTempFile(url, ref.prompt)
}

async function downloadToTempFile(url: string, keySeed: string): Promise<string | null> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Image download ${res.status} for ${url.slice(0, 80)}`)
  const mime = res.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  ensureTempDir()
  const filePath = tempFilePath(keySeed, extensionFromMime(mime))
  fs.writeFileSync(filePath, buf)
  return filePath
}

async function fetchOpenAI(apiKey: string, ref: ImagePromptRef): Promise<string | null> {
  // gpt-image-1 at quality=medium is rate-limited (tier-1 orgs get ~3 images/min).
  // With concurrency 3 and 10-15 total images per run we routinely hit 429 on the
  // later requests, so retry transient failures instead of dropping the image.
  const res = await openAIImageRequestWithRetry(apiKey, ref)

  const json = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const item = json.data?.[0]
  if (!item) throw new Error('OpenAI returned no image data')
  if (item.b64_json) {
    ensureTempDir()
    const filePath = tempFilePath(ref.prompt, 'png')
    fs.writeFileSync(filePath, Buffer.from(item.b64_json, 'base64'))
    return filePath
  }
  if (item.url) return downloadToTempFile(item.url, ref.prompt)
  throw new Error('OpenAI response missing image')
}

async function openAIImageRequestWithRetry(apiKey: string, ref: ImagePromptRef): Promise<Response> {
  const MAX_ATTEMPTS = 5
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: ref.prompt.slice(0, 4000),
        size: ref.size,
        quality: 'medium',
        n: 1
      }),
      signal: AbortSignal.timeout(180_000)
    })

    if (res.ok) return res

    const transient = res.status === 429 || res.status >= 500
    if (!transient || attempt === MAX_ATTEMPTS) {
      const body = await res.text()
      throw new Error(`OpenAI image ${res.status}: ${body.slice(0, 200)}`)
    }

    // Respect server's Retry-After when present, else exponential backoff (2s, 4s, 8s, 16s…)
    const retryAfterHeader = res.headers.get('retry-after')
    const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? retryAfterSec * 1000
      : Math.min(2000 * 2 ** (attempt - 1), 30_000)
    console.warn(`[image-gen:openai] ${res.status} on attempt ${attempt}/${MAX_ATTEMPTS}, waiting ${waitMs}ms`)
    await new Promise(r => setTimeout(r, waitMs))
  }
  throw new Error('OpenAI image: unreachable (retry loop exited without return)')
}

function walkElements(elements: VisualElement[] | undefined, visit: (el: VisualElement) => void): void {
  if (!elements) return
  for (const el of elements) {
    visit(el)
    if (el.children) walkElements(el.children, visit)
  }
}

function pickSize(w?: number, h?: number): ImageSize {
  if (!w || !h) return '1024x1024'
  const ratio = w / h
  if (ratio > 1.3) return '1536x1024'
  if (ratio < 0.77) return '1024x1536'
  return '1024x1024'
}

// For OpenAI we add rich art-direction context; for Pexels we keep the query
// short because the search engine responds better to concrete keywords than
// stylistic phrasing.
function enrichPrompt(raw: string, dir: DirectionSpec, source: ImageSource): string {
  if (source === 'pexels') return raw
  const palette = dir.palette.slice(0, 3).join(', ')
  const mood = dir.mood.slice(0, 3).join(', ')
  return `${raw}\n\nArt direction: ${dir.concept}\nPalette cues: ${palette}\nMood: ${mood}\nStyle: editorial, high quality, no text overlays, no watermarks.`
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return h
}
