import type { DirectionSpec, VisualElement } from '../../shared/types.js'

// OpenAI Images API — model `gpt-image-1`. Returns b64 PNG by default.
// We upload to a data URL so figma.createImageAsync() can fetch it, but the
// Figma plugin supports data URLs directly.

export interface GeneratedImage {
  imagePrompt: string
  imageUrl: string  // data URL or https URL
  imageHash?: string
}

type DalleSize = '1024x1024' | '1792x1024' | '1024x1792'

interface ImagePromptRef {
  element: VisualElement
  prompt: string
  size: DalleSize
}

export async function generateImagesForDirections(
  openaiApiKey: string,
  directions: DirectionSpec[],
  onProgress?: (done: number, total: number, label?: string) => void
): Promise<{ generated: number; failed: number }> {
  if (!openaiApiKey) return { generated: 0, failed: 0 }

  const refs: ImagePromptRef[] = []
  for (const dir of directions) {
    for (const section of dir.sections ?? []) {
      walkElements(section.elements, (el) => {
        if (el.kind === 'image' && el.imagePrompt && !el.imageUrl) {
          refs.push({ element: el, prompt: enrichPrompt(el.imagePrompt, dir), size: pickSize(el.w, el.h) })
        }
      })
    }
  }

  const total = refs.length
  if (total === 0) return { generated: 0, failed: 0 }

  let done = 0
  let failed = 0
  onProgress?.(0, total, 'Alustan piltide genereerimist')

  // DALL-E 3 tier-1 limit is ~5 images/min. Keep concurrency low.
  const CONCURRENCY = 2
  const queue = [...refs]
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const ref = queue.shift()!
        try {
          const dataUrl = await generateImage(openaiApiKey, ref.prompt, ref.size)
          ref.element.imageUrl = dataUrl
          ref.element.imageHash = hashString(ref.prompt)
        } catch (err) {
          failed++
          console.error('[image-gen] failed:', (err as Error).message, 'prompt:', ref.prompt.slice(0, 80))
        }
        done++
        onProgress?.(done, total, `${done}/${total}`)
      }
    })
  )

  return { generated: total - failed, failed }
}

function walkElements(elements: VisualElement[] | undefined, visit: (el: VisualElement) => void): void {
  if (!elements) return
  for (const el of elements) {
    visit(el)
    if (el.children) walkElements(el.children, visit)
  }
}

function pickSize(w?: number, h?: number): DalleSize {
  if (!w || !h) return '1024x1024'
  const ratio = w / h
  if (ratio > 1.3) return '1792x1024'
  if (ratio < 0.77) return '1024x1792'
  return '1024x1024'
}

function enrichPrompt(raw: string, dir: DirectionSpec): string {
  const palette = dir.palette.slice(0, 3).join(', ')
  const mood = dir.mood.slice(0, 3).join(', ')
  return `${raw}\n\nArt direction: ${dir.concept}\nPalette cues: ${palette}\nMood: ${mood}\nStyle: editorial, high quality, no text overlays, no watermarks.`
}

async function generateImage(
  apiKey: string,
  prompt: string,
  size: DalleSize
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: prompt.slice(0, 4000),
      size,
      quality: 'standard',
      response_format: 'b64_json',
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

function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}
