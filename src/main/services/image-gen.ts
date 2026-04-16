import type { DirectionSpec, ImageSource, VisualElement } from '../../shared/types.js'
import { pickOrientation, searchPexelsImage } from './pexels.js'

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
  return searchPexelsImage(apiKey, ref.prompt, orientation, hashString(ref.prompt))
}

async function fetchOpenAI(apiKey: string, ref: ImagePromptRef): Promise<string | null> {
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
    })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI image ${res.status}: ${body.slice(0, 200)}`)
  }

  const json = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const item = json.data?.[0]
  if (!item) throw new Error('OpenAI returned no image data')
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
  if (item.url) return item.url
  throw new Error('OpenAI response missing image')
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
