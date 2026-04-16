import Anthropic from '@anthropic-ai/sdk'
import type { ScrapedSite, SeoWcagResult } from '../../shared/types.js'

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const apiErr = err as { status?: number; headers?: Record<string, string | null | undefined> }
      const isRateLimit = apiErr.status === 429
      if (isRateLimit && attempt < maxAttempts) {
        const retryAfterRaw = apiErr.headers?.['retry-after']
        const waitSec = retryAfterRaw
          ? Math.max(parseInt(String(retryAfterRaw), 10) + 2, 10)
          : attempt * 60
        console.warn(`[${label}] rate limit (429), waiting ${waitSec}s before attempt ${attempt + 1}/${maxAttempts}...`)
        await new Promise(r => setTimeout(r, waitSec * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error(`${label}: all ${maxAttempts} attempts hit rate limit`)
}

const SYSTEM_PROMPT = `You are an expert in SEO (Search Engine Optimization) and WCAG 2.1 accessibility standards. You analyze websites and provide precise, actionable audit results.

Always respond with valid JSON wrapped in <json></json> tags. Be specific — cite actual values from the provided data, not generic advice.`

export async function analyzeSeoWcag(
  apiKey: string,
  site: ScrapedSite,
  _onToken: (t: string) => void
): Promise<SeoWcagResult> {
  const client = new Anthropic({ apiKey, maxRetries: 0 })
  const userContent = buildPrompt(site)

  const response = await withRetry(() => client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        // @ts-ignore
        cache_control: { type: 'ephemeral' }
      }
    ],
    messages: [{ role: 'user', content: userContent }]
  }), 'seo-wcag')

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  return parseResult(text)
}

function buildPrompt(site: ScrapedSite): string {
  return `Analyze this website for SEO and WCAG 2.1 AA compliance.

## Website Data
URL: ${site.url}
Title tag: "${site.title}"
Meta description: "${site.description}"
OG image: ${site.ogImage ? 'present' : 'missing'}

## Detected Typography
${site.fonts.map(f => `- ${f.family} (${f.source}) on: ${f.usedOn.join(', ')}`).join('\n')}

## Color Palette (extracted from screenshot)
${site.colors.slice(0, 6).map(c => `- ${c.name}: ${c.hex} (RGB: ${c.rgb.join(',')})`).join('\n')}

## Instructions
Based on the URL, title, description, colors and fonts above, provide a thorough SEO and WCAG audit.

For WCAG: analyze color contrast ratios from the hex values, check if fonts suggest adequate sizing, look for missing patterns (no OG image = missing social meta, etc.)

For SEO: evaluate title length/quality, meta description, infer keyword opportunities from the domain/title, identify common technical SEO issues.

<json>
{
  "seo": {
    "score": 0,
    "title": {
      "value": "exact title tag value",
      "issues": ["issue 1", "issue 2"]
    },
    "metaDescription": {
      "value": "exact meta description value or empty string",
      "issues": ["issue 1"]
    },
    "headings": {
      "structure": "description of heading hierarchy",
      "issues": ["issue 1"]
    },
    "keywords": ["inferred keyword 1", "keyword 2", "keyword 3"],
    "opportunities": ["specific opportunity 1", "opportunity 2"],
    "technicalIssues": ["issue 1", "issue 2"]
  },
  "wcag": {
    "level": "AA",
    "score": 0,
    "issues": [
      { "severity": "critical", "criterion": "1.4.3 Contrast (Minimum)", "description": "specific issue" }
    ],
    "passes": ["what passes"],
    "recommendations": ["specific recommendation 1"]
  },
  "summary": "2-3 sentence overall summary"
}
</json>`
}

function parseResult(text: string): SeoWcagResult {
  const match = text.match(/<json>([\s\S]*?)<\/json>/)
  if (!match) throw new Error('Claude did not return valid JSON in <json> tags')
  return JSON.parse(match[1].trim()) as SeoWcagResult
}
