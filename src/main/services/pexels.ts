// Pexels API v1 — free stock photos, 200 req/hr per key.
// Docs: https://www.pexels.com/api/documentation/

type Orientation = 'landscape' | 'portrait' | 'square'

interface PexelsPhoto {
  id: number
  src: {
    original: string
    large2x: string
    large: string
    medium: string
    landscape: string
    portrait: string
  }
  alt?: string
}

interface PexelsSearchResponse {
  photos?: PexelsPhoto[]
  error?: string
}

export function pickOrientation(w?: number, h?: number): Orientation {
  if (!w || !h) return 'square'
  const ratio = w / h
  if (ratio > 1.3) return 'landscape'
  if (ratio < 0.77) return 'portrait'
  return 'square'
}

export async function searchPexelsImage(
  apiKey: string,
  query: string,
  orientation: Orientation,
  pickSeed: number
): Promise<string | null> {
  const params = new URLSearchParams({
    query: query.slice(0, 120),
    per_page: '15',
    orientation,
    size: 'large'
  })

  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: apiKey }
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Pexels ${res.status}: ${body.slice(0, 200)}`)
  }

  const json = (await res.json()) as PexelsSearchResponse
  const photos = json.photos ?? []
  if (photos.length === 0) return null

  // Deterministic pick based on prompt hash so reruns stay stable
  const photo = photos[Math.abs(pickSeed) % photos.length]
  // `large` is ~940px on the long edge — plenty for moodboard, small enough
  // to keep the figma_execute script under a few hundred KB even with 15 images
  return photo.src.large
}
