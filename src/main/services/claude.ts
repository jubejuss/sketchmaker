import Anthropic from '@anthropic-ai/sdk'
import { jsonrepair } from 'jsonrepair'
import type { SynthesisContext, SynthesisResult, CompetitorScope } from '../../shared/types.js'

type RetryCallbacks = {
  onWait?: (attempt: number, waitSec: number) => void
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3,
  callbacks: RetryCallbacks = {}
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      const apiErr = err as { status?: number; headers?: Record<string, string | null | undefined> }
      const isRateLimit = apiErr.status === 429
      if (isRateLimit && attempt < maxAttempts) {
        // Read server's retry-after header (seconds), fall back to 60s / 120s
        const retryAfterRaw = apiErr.headers?.['retry-after']
        const waitSec = retryAfterRaw
          ? Math.max(parseInt(String(retryAfterRaw), 10) + 2, 10)
          : attempt * 60
        console.warn(`[${label}] rate limit (429), waiting ${waitSec}s before attempt ${attempt + 1}/${maxAttempts}...`)
        callbacks.onWait?.(attempt, waitSec)
        await new Promise(r => setTimeout(r, waitSec * 1000))
        continue
      }
      throw err
    }
  }
  throw new Error(`${label}: all ${maxAttempts} attempts hit rate limit`)
}

const SYSTEM_PROMPT = `You are a senior brand strategist, visual identity expert, AND a meticulous web designer. You analyze brand context, competitive landscapes, and design trends, and then you ACTUALLY LAY OUT three complete visual directions as concrete element lists. You do not pick from templates. You design from scratch for THIS client.

Your output must always be valid JSON wrapped in <json></json> tags. No prose outside the tags.

────────────────────────────────────────────────────────────
## PART A — STRATEGIC ANALYSIS

Produce brand personality, color strategy, typography rationale, discovered design competitors, and SEO/WCAG notes as specified in the schema below. Be specific: real hex values, real Google Font names, real visual metaphors grounded in the client's domain.

────────────────────────────────────────────────────────────
## PART B — THREE DIRECTION SPECS (the design work)

\`directionSpecs\` is an array of exactly 3 DirectionSpec objects. Each is a complete, self-contained visual direction — three plausibly different BRANDS this client could become.

Each DirectionSpec has:
- \`title\`: "Suund 1: <evocative name>" — name reflects this direction's attitude
- \`concept\`: 2–3 sentences describing the design idea and why it fits
- \`palette\`: 3–5 hex colors (backgrounds, text, accents for THIS direction)
- \`fonts\`: { heading, headingWeight, body } — pick real Google Fonts that match the voice
- \`mood\`: 3–5 atmosphere words unique to this direction
- \`heroImagePrompt\`: 40–80 word photography/illustration prompt for AI image generation
- \`sections\`: array of SectionSpec — in the order requested by the user

Each SectionSpec has:
- \`type\`: one of the requested section keys
- \`height\`: section height in pixels (typical: header 64, hero 440, services 320, events 320, gallery 340, news 320, team 320, testimonials 240, cta 200, contact 260, footer 80 — but adjust if your layout needs more room)
- \`elements\`: array of VisualElement

────────────────────────────────────────────────────────────
## THE VISUAL ELEMENT DSL

Coordinate system: each section column is 1440 px wide. \`x, y\` are pixels from the top-left of the SECTION (y starts at 0 at the top of each section, never spans sections). All dimensions in px.

Each element has \`kind\` plus relevant fields:

**\`text\`** — { kind, x, y, w?, text, fontFamily, fontWeight, fontSize, color, opacity?, rotation?, letterSpacing?, lineHeight?, textCase? }
  - \`textCase\`: "upper" | "lower" | "title" | "original" (default)
  - Use \`w\` to wrap text; omit for single-line
  - fontFamily must be either this direction's heading, body, or "Inter" (fallback)

**\`rect\`** — { kind, x, y, w, h, color, opacity?, cornerRadius?, rotation?, strokeColor?, strokeWeight? }
  - For thin rules, h=1 or h=2
  - For cards, give cornerRadius and optional stroke

**\`ellipse\`** — { kind, x, y, w, h, color, opacity?, strokeColor?, strokeWeight? }
  - For circles, set w=h

**\`line\`** — { kind, x, y, x2, y2, color, opacity?, strokeWeight? }
  - Thin rules, diagonal separators

**\`frame\`** — { kind, x, y, w, h, color?, opacity?, cornerRadius?, rotation?, strokeColor?, strokeWeight?, clipsContent?, children: [...] }
  - Use for grouped content (cards, polaroids, stamps). Children have x,y RELATIVE to the frame.
  - Rotation applies to the frame and all children.

**\`image\`** — { kind, x, y, w, h, imagePrompt, cornerRadius?, rotation? }
  - \`imagePrompt\`: 15–40 word prompt for AI image gen (this app will generate the image post-synthesis). Be specific about subject, style, mood, lighting — not generic "nice photo of…"
  - Use for hero imagery, gallery tiles, team portraits, event photos — any place you'd normally put a real photo.

────────────────────────────────────────────────────────────
## DESIGN REQUIREMENTS — READ CAREFULLY

1. **Content must be bespoke.** Every headline, every tag, every event title, every piece of copy must be invented FOR THIS CLIENT based on the brief and site analysis. Do not use placeholder content like "Lorem Ipsum" or generic "Summer Arts Festival" unless it's genuinely plausible for this client. If the client runs a cultural centre, invent event names in their voice; if a law firm, invent practice area descriptions.

2. **Three directions must be RADICALLY different** — a viewer should identify each by thumbnail silhouette. Different composition, typography voice, color temperament, energy. Never three "card grid" layouts.

3. **Per-section, per-direction, the layout is yours to invent.** The same section type in different directions should LOOK completely different. A hero in direction 1 might be oversized 180pt manifesto type on asymmetric whitespace; in direction 2 a tilted collage of 4 overlapping polaroid-frames with handwritten-style caption; in direction 3 a departure-board table of upcoming activity. You pick.

4. **Use the image element.** Every direction must include at least 3–5 \`image\` elements across its sections — hero, gallery, team portraits, event photos. Real photography placeholders, not always colored circles. If a section is clearly photographic (gallery, team, hero often), use image elements.

5. **Use rotation for collage-y directions, use strict orthogonal for editorial directions.** Rotation is in degrees, -10 to +10 is plausible for tilts; skip it for grid layouts.

6. **Typography hierarchy must be exaggerated.** Display headings 48–200pt; section labels 10–14pt small-caps; body 12–16pt. Thin out the middle sizes — a "20pt heading" is usually a sign of timid design.

7. **Every section must be full-width-aware.** The column is 1440 px. Use the whole width when appropriate (rules, grids). Use generous left margin (40–80 px) and don't crowd the right edge.

8. **Element count per section:** typical hero has 4–12 elements; service/event grids 15–40; gallery 8–20; footer 3–8. Count what serves the composition — don't pad, don't starve.

────────────────────────────────────────────────────────────
## OUTPUT FIDELITY

- Coordinates must not overflow the section (y ≤ section.height, x+w ≤ 1440).
- Colors must be hex with # prefix.
- All required fields per element kind must be present.
- fontSize must be a number (not "48pt"), opacity a 0–1 float.
- If you include a \`frame\` with children, children x,y are RELATIVE to the frame's top-left, and children must fit inside the frame.
- Every direction's \`sections\` array must contain EXACTLY the sections the user requested, in the requested order.`

export async function synthesize(
  apiKey: string,
  context: SynthesisContext,
  onToken: (token: string) => void,
  onWait?: (attempt: number, waitSec: number) => void
): Promise<SynthesisResult> {
  // maxRetries: 0 — disable SDK's internal retry (max 8s delay) so our retry controls timing
  const client = new Anthropic({ apiKey, maxRetries: 0 })
  const userContent = buildUserContent(context)
  const params = {
    model: 'claude-sonnet-4-6' as const,
    max_tokens: 28000,
    system: [
      {
        type: 'text' as const,
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' as const }
      }
    ],
    messages: [{ role: 'user' as const, content: userContent }]
  }

  return withRetry(async () => {
    let accumulated = ''
    const stream = client.messages.stream(params)
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text
        accumulated += text
        onToken(text)
      }
    }
    const final = await stream.finalMessage()
    if (final.stop_reason === 'max_tokens') {
      console.warn(`[synthesize] response hit max_tokens — output truncated at ${final.usage?.output_tokens} tokens. parseResult will attempt repair.`)
    }
    return parseResult(accumulated)
  }, 'synthesize', 3, { onWait })
}

const SECTION_HEIGHTS: Record<string, number> = {
  header: 64, hero: 440, services: 320, events: 320, gallery: 340,
  news: 320, team: 320, testimonials: 240, cta: 200, contact: 260, footer: 80
}

function buildSectionsExample(sections: string[]): string {
  return sections.map((sid, idx) => {
    const h = SECTION_HEIGHTS[sid] ?? 300
    const comma = idx < sections.length - 1 ? ',' : ''
    return `
        { "type": "${sid}", "height": ${h}, "elements": [ /* YOUR bespoke elements for this ${sid}, composed specifically for this brand */ ] }${comma}`
  }).join('')
}

function buildUserContent(context: SynthesisContext): string {
  const parts: string[] = []

  parts.push(`## Creative Brief\n${context.brief || 'No brief provided — infer from website data.'}`)

  const hasSite = !!context.scrapedSite

  if (context.scrapedSite) {
    const site = context.scrapedSite
    parts.push(`## Client Website Analysis
URL: ${site.url}
Title: ${site.title}
Meta description: "${site.description}"
OG image: ${site.ogImage ? 'present' : 'missing'}

### Current Color Palette (extracted from screenshots)
${site.colors.map((c) => `- ${c.name}: ${c.hex} (RGB: ${c.rgb.join(', ')})`).join('\n')}

### Typography
${site.fonts.map((f) => `- ${f.family} (${f.source}) — used on: ${f.usedOn.join(', ')}`).join('\n')}`)
  }

  const competitors = context.competitors.filter(c => !c.isLocal)
  if (competitors.length > 0) {
    parts.push(`## SEO Competitive Landscape (Ahrefs data)
${context.competitors
  .map(
    (c) => `- **${c.domain}** ${c.isLocal ? '(CLIENT)' : '(COMPETITOR)'}
  Domain Rating: ${c.domainRating ?? 'N/A'} | Traffic: ${c.organicTraffic?.toLocaleString() ?? 'N/A'}/mo
  Top Keywords: ${c.topKeywords?.join(', ') || 'N/A'}`
  )
  .join('\n\n')}`)
  }

  const requestedSections = (context.sections && context.sections.length > 0 ? context.sections : ['header', 'hero', 'events', 'news', 'footer']) as string[]
  const sectionsForPrompt = buildSectionsExample(requestedSections)
  parts.push(`## Requested Page Sections (in this order)
Produce exactly these sections in each direction, in this order: ${requestedSections.join(' → ')}.
Heights (px) per section: ${requestedSections.map(s => `${s}=${SECTION_HEIGHTS[s] ?? 300}`).join(', ')}.
You may increase a section's height if the composition needs more room.`)

  const scopeLabel = context.competitorScope === 'local'
    ? 'the same country as the client (based on domain TLD and brief context)'
    : context.competitorScope === 'regional'
    ? 'the same geographic region (e.g. Europe for Estonian/Nordic clients, or equivalent)'
    : 'globally — the best-in-class worldwide regardless of geography'

  parts.push(`## Design Competitor Discovery Task
Based on the client website and/or brief, identify 5–8 DESIGN-FOCUSED competitors or visual references from ${scopeLabel}.

These should be brands/companies in the same industry or adjacent space whose VISUAL IDENTITY and DESIGN LANGUAGE can inspire the new brand direction. They may or may not appear in the Ahrefs SEO data above.

Focus on: visual style, color usage, typography choices, photography style, layout approach. The goal is to find new design directions and inspiration — not just SEO overlap.`)

  const seoSection = hasSite ? `
  "seoWcag": {
    "seo": {
      "score": 0,
      "title": { "value": "exact title tag value", "issues": ["issue if any"] },
      "metaDescription": { "value": "exact meta description or empty string", "issues": ["issue if any"] },
      "headings": { "structure": "describe heading hierarchy", "issues": ["issue if any"] },
      "keywords": ["inferred keyword 1", "keyword 2", "keyword 3"],
      "opportunities": ["specific SEO opportunity 1", "opportunity 2"],
      "technicalIssues": ["missing OG image", "etc"]
    },
    "wcag": {
      "level": "AA",
      "score": 0,
      "issues": [
        { "severity": "critical", "criterion": "1.4.3 Contrast (Minimum)", "description": "specific issue based on color hex values" }
      ],
      "passes": ["what visually passes based on the colors/fonts"],
      "recommendations": ["specific WCAG fix 1"]
    },
    "summary": "2-3 sentence SEO+WCAG summary"
  }` : ''

  const competitorProfilesSection = competitors.length > 0 ? `
  "competitorVisualProfiles": [
    {
      "domain": "competitor.com",
      "visualStyle": "describe their design aesthetic — editorial/corporate/playful/minimal etc",
      "keyColors": ["#hexcode", "#hexcode", "#hexcode"],
      "typography": "describe their type approach — e.g. geometric sans + editorial serif",
      "differentiator": "what makes them visually unique and memorable"
    }
  ],` : '"competitorVisualProfiles": [],'

  parts.push(`## Required Output Format

Respond with a single JSON object wrapped in <json></json> tags:

<json>
{
  "brandPersonality": ["string", "string", "string"],
  "visualDirection": "string — 2-3 sentences describing the overall visual direction",
  "colorStrategy": {
    "primary": "#hexcode",
    "accent": "#hexcode",
    "neutral": "#hexcode",
    "background": "#hexcode",
    "rationale": "string — why these colors, what mood they create"
  },
  "typographyRationale": "string",
  "suggestedFonts": {
    "heading": "Exact Google Font or system font name",
    "body": "Exact Google Font or system font name"
  },
  "moodboardKeywords": ["word", "word", "word", "word", "word", "word"],
  "competitorGaps": ["string — specific visual/strategic whitespace opportunity"],${competitorProfilesSection}
  "discoveredCompetitors": [
    {
      "domain": "example.com",
      "url": "https://example.com",
      "name": "Brand Name",
      "country": "EE",
      "visualStyle": "describe their overall visual design language in 1-2 sentences",
      "keyColors": ["#hexcode", "#hexcode"],
      "typography": "e.g. geometric sans-serif, humanist body text",
      "reason": "why this brand is a relevant design reference for the client"
    }
  ],
  "styleRecommendations": [
    { "type": "color", "value": "string", "rationale": "string" },
    { "type": "typography", "value": "string", "rationale": "string" },
    { "type": "imagery", "value": "string", "rationale": "string" },
    { "type": "texture", "value": "string", "rationale": "string" },
    { "type": "layout", "value": "string", "rationale": "string" }
  ],
  "directionSpecs": [
    {
      "title": "Suund 1: [evocative direction name]",
      "concept": "2-3 sentences describing this visual direction — what it looks like, what it communicates, who it speaks to",
      "palette": ["#hex", "#hex", "#hex", "#hex"],
      "fonts": { "heading": "Exact Google Font", "headingWeight": "Bold", "body": "Exact Google Font" },
      "mood": ["word", "word", "word", "word"],
      "heroImagePrompt": "40-80 word photography or illustration prompt for a hero image — specific subject, lighting, mood, style appropriate to this direction and brand",
      "sections": [${sectionsForPrompt}
      ]
    },
    { "title": "Suund 2: [different evocative name]", "concept": "...", "palette": ["#hex","#hex","#hex","#hex"], "fonts": { "heading": "Different Google Font", "headingWeight": "Black", "body": "Different Google Font" }, "mood": ["word","word","word","word"], "heroImagePrompt": "...", "sections": [ /* same section keys, radically different layouts */ ] },
    { "title": "Suund 3: [third evocative name]", "concept": "...", "palette": ["#hex","#hex","#hex","#hex"], "fonts": { "heading": "Third Google Font", "headingWeight": "Medium", "body": "Third Google Font" }, "mood": ["word","word","word","word"], "heroImagePrompt": "...", "sections": [ /* same section keys, third distinct treatment */ ] }
  ],
  "targetAudience": "string",
  "brandVoice": "string"${seoSection ? ',\n' + seoSection : ''}
}
</json>`)

  return parts.join('\n\n')
}

function parseResult(text: string): SynthesisResult {
  // Prefer a fully-closed <json>...</json> block. If the response was truncated
  // by max_tokens, the closing tag may be missing — fall back to everything
  // after the opening <json> and let jsonrepair patch the unclosed structure.
  const closed = text.match(/<json>([\s\S]*?)<\/json>/)
  let raw: string
  let truncated = false
  if (closed) {
    raw = closed[1].trim()
  } else {
    const openIdx = text.indexOf('<json>')
    if (openIdx === -1) {
      throw new Error('Claude did not return valid JSON in <json> tags')
    }
    raw = text.slice(openIdx + '<json>'.length).trim()
    truncated = true
    console.warn('[synthesize] <json> opened but </json> missing — treating as truncated, forcing jsonrepair path')
  }

  if (!truncated) {
    try {
      return JSON.parse(raw) as SynthesisResult
    } catch (strictErr) {
      console.warn('[synthesize] strict JSON.parse failed, attempting jsonrepair:', (strictErr as Error).message)
      dumpParseContext(raw, strictErr as Error)
    }
  }

  try {
    const repaired = jsonrepair(raw)
    const result = JSON.parse(repaired) as SynthesisResult
    console.log(`[synthesize] jsonrepair succeeded${truncated ? ' (recovered from truncated response)' : ''}`)
    return result
  } catch (repairErr) {
    throw new Error(`Failed to parse synthesis JSON (even after repair): ${repairErr}`)
  }
}

function dumpParseContext(raw: string, err: Error): void {
  const posMatch = err.message.match(/position (\d+)/)
  if (!posMatch) return
  const pos = parseInt(posMatch[1], 10)
  const start = Math.max(0, pos - 120)
  const end = Math.min(raw.length, pos + 120)
  console.warn('[synthesize] context around parse error:')
  console.warn(raw.slice(start, pos) + '<<<HERE>>>' + raw.slice(pos, end))
}
