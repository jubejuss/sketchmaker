import type { CompetitorData } from '../../shared/types.js'

const BASE_URL = 'https://api.ahrefs.com/v3'
const cache = new Map<string, unknown>()

async function ahrefsGet(apiKey: string, endpoint: string, params: Record<string, string>): Promise<unknown> {
  const cacheKey = `${endpoint}:${JSON.stringify(params)}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const url = new URL(`${BASE_URL}${endpoint}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ahrefs API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  cache.set(cacheKey, data)
  return data
}

export function clearCache(): void {
  cache.clear()
}

export async function researchCompetitors(apiKey: string, domain: string): Promise<CompetitorData[]> {
  if (!apiKey) {
    console.warn('No Ahrefs API key — skipping competitor research')
    return []
  }

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

  try {
    const [metricsData, competitorsData] = await Promise.all([
      ahrefsGet(apiKey, '/site-explorer/metrics', {
        target: cleanDomain,
        mode: 'subdomains'
      }),
      ahrefsGet(apiKey, '/site-explorer/organic-competitors', {
        target: cleanDomain,
        mode: 'subdomains',
        limit: '8'
      })
    ])

    const competitors: CompetitorData[] = []

    // Add the target site itself
    const metrics = (metricsData as { metrics?: { domain_rating?: number; org_traffic?: number } }).metrics
    if (metrics) {
      competitors.push({
        domain: cleanDomain,
        url: `https://${cleanDomain}`,
        domainRating: metrics.domain_rating,
        organicTraffic: metrics.org_traffic,
        topKeywords: [],
        isLocal: true
      })
    }

    // Add organic competitors
    const competitorList = (competitorsData as { competitors?: Array<{
      competitor: string
      common_keywords: number
      org_traffic?: number
      domain_rating?: number
    }> }).competitors ?? []

    for (const c of competitorList.slice(0, 7)) {
      competitors.push({
        domain: c.competitor,
        url: `https://${c.competitor}`,
        domainRating: c.domain_rating,
        organicTraffic: c.org_traffic,
        topKeywords: [],
        isLocal: false
      })
    }

    // Fetch top keywords for target domain
    try {
      const kwData = await ahrefsGet(apiKey, '/site-explorer/organic-keywords', {
        target: cleanDomain,
        mode: 'subdomains',
        limit: '5',
        order_by: 'traffic:desc'
      }) as { keywords?: Array<{ keyword: string }> }

      const targetEntry = competitors.find((c) => c.domain === cleanDomain)
      if (targetEntry && kwData.keywords) {
        targetEntry.topKeywords = kwData.keywords.map((k) => k.keyword)
      }
    } catch {
      // Non-fatal — keywords are optional
    }

    return competitors
  } catch (err) {
    console.error('Ahrefs research failed:', err)
    return []
  }
}
