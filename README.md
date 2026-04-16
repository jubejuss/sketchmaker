# Stiilileidja

**Repo:** https://github.com/jubejuss/sketchmaker

Desktop moodboard generator for designers. Point it at a client URL (or paste a brief), it scrapes the site, analyses competitors, runs a single Claude call that outputs three radically different visual directions as a bespoke element-level DSL, fills the image placeholders from either **Pexels** (stock photos, default) or **OpenAI `gpt-image-1`** (AI-generated), then renders everything live into Figma or Pencil (Paper) via MCP.

No layout templates — every pixel spec is authored by Claude per brand.

## Stack

- **Electron 33** (`electron-vite`, ESM) + **React 19** + TypeScript + Zustand
- **Playwright-core** — scraping (Chromium auto-installs to userData on first run)
- **node-vibrant** — colour extraction
- **Anthropic SDK** (`claude-sonnet-4-6`, streaming) + **jsonrepair** fallback for malformed synthesis JSON
- **Pexels API v1** — default image source, stock photography, 200 req/hr free
- **OpenAI Images API** (`gpt-image-1`, `quality: medium`) — optional AI-generated imagery
- **MCP**: `figma-console-mcp` (Figma Desktop Bridge plugin, CDP :9222 + WS :9225) and Paper MCP binary
- **electron-store** — encrypted settings persistence

## Quick start

```bash
git clone https://github.com/jubejuss/sketchmaker.git
cd sketchmaker
npm install
npm run dev        # hot-reload Electron + Vite
```

Production build:

```bash
npm run build      # type-check + bundle
npm run dist       # + electron-builder installer
npx tsc --noEmit   # standalone type check
```

## Required setup

All keys are configured in the app's **Seaded** (Settings) view — not in env vars.

| Key | Source | Required for |
|-----|--------|--------------|
| `anthropicApiKey` | platform.claude.com → API Keys (`sk-ant-api03-…`) | **Mandatory** — synthesis, SEO/WCAG, competitor discovery |
| `pexelsApiKey` | pexels.com/api/new | Required if **Image source = Pexels** (default). 200 req/hr free. |
| `openaiApiKey` | platform.openai.com → API keys (`sk-proj-…` or `sk-…`) | Required if **Image source = OpenAI** (`gpt-image-1`). Your OpenAI **org** must be verified AND your **project** must list `gpt-image-1` under Settings → Project → Limits → Allowed models |
| `ahrefsApiKey` | app.ahrefs.com → Account → API | Optional — organic SEO competitors. Without it that step is skipped |
| `figmaAccessToken` | figma.com → Settings → Security → Personal access tokens | Moodboard rendering in Figma |

Pick the image source in **Seaded → Image source** (Pexels or OpenAI). Without a key for the selected source, image placeholders render as tinted rects with the prompt as a caption.

> Anthropic OAuth tokens (`sk-ant-oat…`) are blocked for third-party apps since Jan 2026. Use API keys from platform.claude.com.

### Figma MCP

1. Install Figma Desktop
2. In Figma: `Plugins → Development → Import plugin from manifest` → `~/.figma-console-mcp/plugin/manifest.json`
3. Open the plugin (`Plugins → Development → Figma Desktop Bridge`) and set it to **Local Mode**
4. Keep the plugin window open while running a moodboard — it bridges Figma's plugin runtime to the app

### Pencil (Paper) MCP

Just run Pencil/Paper. The MCP binary is spawned automatically.

## How the full pipeline works — from input to sketches

`input → scrape → research → discover → synthesize → images → report → moodboard`

### 1. Input (`src/renderer/views/InputView.tsx`)

The user is in the renderer process and chooses one of two paths:

- **URL mode** — enter a client website. Scraping runs.
- **Brief mode** — paste a freeform description of the project. Scraping is skipped.

They also pick:
- **Competitor scope** — `local` · `regional` · `global`. This feeds into the Claude prompt so discovered design-competitors match the right geography.
- **Page sections** — which parts the moodboard should lay out (`header`, `hero`, `events`, `news`, `team`, `services`, `gallery`, `testimonials`, `cta`, `contact`, `footer`). Default is `['header', 'hero', 'events', 'news', 'footer']`.

On "Alusta" the renderer invokes IPC handlers in sequence and streams each step's status via `step:update` events into the Zustand store, which `PipelineView.tsx` renders as a live timeline.

### 2. Scrape (`src/main/services/scraper.ts`)

Runs only in URL mode. Main process launches Chromium via `playwright-core` (downloaded once to `userData/browsers/` on first run).

What it captures:
- `aboveFold` screenshot (viewport, base64 PNG)
- `fullPage` screenshot (entire scroll, base64 PNG)
- CSS-declared `font-family` values from the page, classified as `google` / `system` / `custom`
- Dominant colour palette: `node-vibrant` runs over the full-page screenshot → `Vibrant`, `Muted`, `DarkVibrant`, `LightVibrant`, `DarkMuted`, `LightMuted` colour swatches with hex + RGB + population score
- `<title>`, `<meta description>`, and any `og:image`

Everything is bundled into a `ScrapedSite` and returned to the renderer.

### 3. Research (`src/main/services/ahrefs.ts`)

Runs only if an Ahrefs API key is set in settings. Calls `site-explorer-organic-competitors` on the client domain, pulls the top N competitors with domain rating + organic traffic + top keywords. Returns `CompetitorData[]`. Skipped entirely in brief-only mode, or if the key is missing — the pipeline continues with empty competitor data.

### 4. Discover + Synthesize (`src/main/services/claude.ts`)

**One** streaming call to `claude-sonnet-4-6` does everything: SEO/WCAG analysis, design-competitor discovery, and the full visual synthesis. The system prompt has two parts:

**PART A — strategic analysis.** Claude reads the brief + scraped data + Ahrefs competitors and produces:
- `brandPersonality` (adjectives), `brandVoice`, `targetAudience`
- `colorStrategy` with primary/accent/neutral/background hexes + a `rationale`
- `suggestedFonts` (heading + body) + `typographyRationale`
- `moodboardKeywords`
- `competitorGaps` — visual space where no competitor is playing
- `competitorVisualProfiles` — per-Ahrefs-competitor interpretation
- `discoveredCompetitors` — 5–8 design-focused reference brands matching the scope, each with `visualStyle`, `keyColors`, `typography`, `reason`
- `seoWcag` (if URL mode) — title/meta/headings analysis, SEO opportunities, WCAG AA issues + pass list

**PART B — visual DSL.** Claude then emits three radically different `directionSpecs`. Each is:
```ts
{
  title: 'Suund 1: Editorial Minimalism',
  concept: '...',
  palette: ['#0A0A0A', '#FFFCF5', '#C8A96E', ...],
  fonts: { heading: 'Playfair Display', headingWeight: 'Regular', body: 'Inter' },
  mood: ['quiet', 'confident', 'slow'],
  heroImagePrompt: '...',
  sections: [
    {
      type: 'hero',
      height: 900,
      elements: [
        { kind: 'rect', x: 0, y: 0, w: 1440, h: 900, color: '#FFFCF5' },
        { kind: 'text', x: 96, y: 240, w: 1000, text: 'Community is built here.',
          fontFamily: 'Playfair Display', fontWeight: 'Regular', fontSize: 88, color: '#0A0A0A' },
        { kind: 'image', x: 760, y: 120, w: 600, h: 700,
          imagePrompt: 'Warm golden-hour light on a Kalamaja courtyard, documentary editorial style' },
        ...
      ]
    },
    ...
  ]
}
```

Every element is bespoke — there are no layout templates anywhere in the codebase. Claude is the designer; the renderer is a dumb interpreter.

Streaming: tokens are emitted to the renderer via `synthesis:token` as they arrive, so `PipelineView` shows the JSON being authored live. `maxRetries: 0` on the SDK — our own `withRetry()` reads the `retry-after` header on 429s and forwards a `synthesis:rate-limit-wait` event so the UI can display the countdown.

**JSON parse resilience.** Long DSL outputs occasionally contain unescaped quotes or newlines inside string values. `parseResult()` tries strict `JSON.parse` first, then falls back to [`jsonrepair`](https://www.npmjs.com/package/jsonrepair). On strict failure it logs ±120 chars around the error position before attempting repair — helpful for debugging prompt regressions.

### 5. Image fetching (`src/main/services/image-gen.ts` + `pexels.ts`)

After Claude finishes, `generateImagesForDirections(source, keys, directions, onProgress)` walks every `directionSpec.sections[].elements` tree (`walkElements` recurses into `frame` children) and collects elements where `kind === 'image' && imagePrompt && !imageUrl` (re-runs skip already-filled slots).

Source is chosen in settings and defaults to **Pexels**. Dispatch happens per-image with concurrency capped at **3**.

**Pexels (`src/main/services/pexels.ts`).** Hits `GET https://api.pexels.com/v1/search?query=…&per_page=15&orientation=…&size=large` with `Authorization: <key>`. Orientation is picked from the element's aspect ratio (`landscape` / `portrait` / `square`). A deterministic hash of the prompt picks one photo from the returned set so reruns stay stable. The `large` src (~940px long edge) is used — plenty for moodboards and small enough to keep the Figma execute script under ~100 KB even with 15 images. Prompt is used raw (concrete keywords search better than stylistic phrasing). 200 req/hr per key on the free tier.

**OpenAI.** Enriches each prompt with direction context so images stay on-brand:
```
<original prompt>
Art direction: <concept>
Palette cues: <top 3 hexes>
Mood: <top 3 mood words>
Style: editorial, high quality, no text overlays, no watermarks.
```
Picks a size from the element's aspect ratio: `1024×1024`, `1536×1024` (landscape), or `1024×1536` (portrait). Calls `POST https://api.openai.com/v1/images/generations` with `model: 'gpt-image-1'`, `quality: 'medium'`, `n: 1`. Returned base64 is wrapped as `data:image/png;base64,…`.

In both cases the resulting URL is assigned to `element.imageUrl`. Progress events (`synthesis:image-progress`) stream to the renderer and update the `synthesize` step message (`"Genereerin pilte 3/13..."`).

**OpenAI model access gotcha.** `gpt-image-1` is gated at **two levels** and both must be open:
- Org must be verified (platform.openai.com → Settings → Organization → General → Verifications)
- Project must list `gpt-image-1` under Settings → Project → Limits → Allowed models

If every image returns `403 model_not_found`, it's almost always the project-level allow-list — that list is empty-with-one-chat-model by default on new projects, silently blocking every other model.

If the key for the selected source is missing, step 5 is skipped entirely and the renderer in step 7 falls back to a tinted placeholder rectangle with the prompt shown as a caption.

### 6. Report (`src/main/services/report-builder.ts`)

HTML template (`src/main/templates/report.html.ts`) interpolates the `SynthesisResult` + scraped data into an editorial PDF report. Playwright opens the HTML, renders it to PDF, and writes both files to `{outputDir}/{timestamp}-{projectName}/`. Default `outputDir` is `~/Desktop/stiilileidja-output`.

The synthesis is also auto-persisted to `{outputDir}/projects/{id}.json` (typed as `SavedProjectData`) and listed in `InputView` under "Hiljutised projektid" for later re-opening.

### 7. Moodboard (`src/main/services/figma-script.ts` + `mcp-figma.ts` / `mcp-paper.ts`)

User picks an `OutputMode`:

- **`figma-execute`** — renders live into Figma via MCP
- **`paper-execute`** — renders into Pencil/Paper via MCP
- **`figma-prompt`** / **`paper-prompt`** — outputs a copy-pasteable prompt + script for manual use

Figma-execute in detail:

1. `mcp-figma.ts` spawns `figma-console-mcp` (via `StdioClientTransport`). That MCP server advertises a WebSocket at `localhost:9225` and talks to Figma Desktop's Chrome DevTools Protocol on `localhost:9222`.
2. The **Figma Desktop Bridge** plugin (must be open in Figma) connects to the WebSocket and forwards commands into Figma's plugin runtime sandbox.
3. `figma-script.ts` serialises the entire `SynthesisResult` into a single JavaScript string that runs inside the plugin sandbox. The serialiser is a **generic DSL interpreter** — it does not contain any brand-specific logic.
4. At runtime the script:
   - Collects every `(fontFamily, fontWeight)` pair referenced across all directions, dedupes, then `await figma.loadFontAsync(...)` for each. **Critical rule**: fonts are loaded _after_ `figma.currentPage = page`, never before — fonts loaded before the page switch silently fail and text nodes render blank.
   - Creates a new page named "Moodboard — {project}".
   - Lays out 3 direction columns side-by-side at 1440px wide with an 80px gap.
   - For each direction → iterate sections. For each section, creates a 1440×{sectionHeight} frame and calls `renderElement()` on each `VisualElement`.
   - Dispatches by `kind`:
     - `text` → `figma.createText` + font + letter/line spacing + text case transform
     - `rect` → `figma.createRectangle` + fills + cornerRadius + stroke
     - `ellipse` → `figma.createEllipse`
     - `line` → `figma.createLine` from (x,y) to (x2,y2) with stroke
     - `frame` → `figma.createFrame` + recurse into `children`
     - `image` → resolve the image via `resolveImage(el)`:
       - If `imageUrl` starts with `data:`, decode the base64 in-plugin with `atob` → `Uint8Array` → `figma.createImage(bytes)`.
       - Otherwise `await figma.createImageAsync(imageUrl)`.
       - Apply the resulting hash as a fill on a rectangle sized to the element's w/h.
       - On failure (bad URL, rate-limit, etc.) draw a tinted placeholder rect with the prompt as a caption so the layout doesn't break.
   - Zooms the viewport to fit all three columns.

The Figma document now has three complete, unique, brand-specific page sketches. Designers can pick a direction, duplicate the frames, and iterate from there.

### Where to change what

| You want to change | Edit |
|---|---|
| What the AI decides (strategy, colours, copy) | `src/main/services/claude.ts` — the system prompt |
| What element types are renderable | `src/shared/types.ts` (add to `VisualKind`) + `src/main/services/figma-script.ts` (add a renderer) |
| Image quality / cost / model | `src/main/services/image-gen.ts` |
| Which scrape data is captured | `src/main/services/scraper.ts` |
| Progress UI / step wiring | `src/renderer/views/PipelineView.tsx` + `src/renderer/store/pipeline.store.ts` |
| Report template | `src/main/templates/report.html.ts` |

## Project layout

```
src/
  main/              Electron main process
    ipc/             IPC handlers (scraper, research, synthesis, report, moodboard, settings, auth, projects)
    services/        Business logic
      claude.ts      Synthesis prompt + streaming
      scraper.ts     Playwright
      image-gen.ts   Image dispatcher (Pexels | OpenAI) — fills element.imageUrl
      pexels.ts      Pexels API v1 search client
      figma-script.ts  Generic DSL → Figma plugin code
      mcp-figma.ts   StdioClientTransport → figma-console-mcp
      mcp-paper.ts   StdioClientTransport → Paper binary
  preload/           contextBridge → window.stiilileidja
  renderer/
    views/           InputView · PipelineView · ResultsView · SettingsView
    store/           Zustand pipeline store
  shared/types.ts    All TypeScript types (single source of truth)
```

## Visual DSL (`src/shared/types.ts`)

Each direction is an array of `SectionSpec`s; each section is an array of `VisualElement`s. Claude authors all of it:

```ts
type VisualKind = 'text' | 'rect' | 'ellipse' | 'line' | 'frame' | 'image'

interface VisualElement {
  kind: VisualKind
  x: number; y: number; w?: number; h?: number
  rotation?: number; color?: string; opacity?: number
  // text fields
  text?: string; fontFamily?: string; fontWeight?: FontWeight
  fontSize?: number; letterSpacing?: number; lineHeight?: number
  // image fields
  imagePrompt?: string    // Claude-authored
  imageUrl?: string       // populated by image-gen
  // frame fields
  children?: VisualElement[]
}
```

`figma-script.ts` is a dumb interpreter — it does not make design decisions. All creative output comes from Claude.

## How to improve it

### Model / synthesis
- **Prompt tuning** — the system prompt in `src/main/services/claude.ts` controls design quality. Most improvements happen here. Iterate on section requirements, element density, typography hierarchy rules, colour rationale format.
- **Structured outputs** — consider migrating from JSON-in-markdown parsing to Anthropic's native structured outputs for fewer parse failures.
- **Token budget** — `max_tokens: 32000`. Bigger DSL output = richer moodboards but slower/pricier runs.

### Image generation
- Currently on `gpt-image-1` at `quality: medium`. Bump to `high` for richer output at higher cost, or drop to `low` for cheap drafts. Edit `src/main/services/image-gen.ts`.
- Add a persistent image cache by prompt hash (currently only the in-memory `imageHash` on each element) so repeated runs on the same brief reuse images across sessions.
- Try a faster local model (SDXL Turbo, Flux.1-schnell) via Replicate for cost control.
- Fall back to `dall-e-3` automatically on `gpt-image-1` 403s to support projects where only the older model is allow-listed.

### Renderer
- `figma-script.ts` supports only the base DSL today. Adding `gradient` fills, `effects` (shadows, blurs), component instances, or Auto Layout would let Claude specify richer outputs.
- Pencil/Paper output currently just writes HTML. A true DSL interpreter for Paper would give parity with Figma.

### Pipeline
- Parallelise `scrape` and `research` — they don't depend on each other.
- Stream partial `directionSpecs` as soon as Claude emits them instead of waiting for full JSON.
- Persist raw Claude output alongside parsed results for debugging.

### UX
- Preview moodboards inline (React canvas/SVG renderer of the same DSL) before pushing to Figma — lets designers iterate on prompts without touching Figma.
- Diff view between directions.
- Migrate form submissions (`InputView`, `SettingsView`) to React 19 `<form action>` + `useActionState` for cleaner pending/error states.
- Use React 19's `use()` hook to read streaming synthesis tokens directly in render, replacing the manual `useState` + `onSynthesisToken` wiring.

## Contributing

- `npx tsc --noEmit` must pass.
- Keep the renderer dumb: never hardcode design decisions in `figma-script.ts`. If you need new visual capabilities, extend the DSL in `src/shared/types.ts` first, then implement interpretation, then instruct Claude in the synthesis prompt.
- Prompt rules that work live in the repo's auto-memory / CLAUDE.md. Update them when behaviour changes.

### React 19 conventions

- Use `ref` as a regular prop — do not wrap components in `React.forwardRef`.
- Prefer the `use()` hook for consuming promises/context in render paths.
- No `defaultProps` on function components (removed in 19). Use parameter defaults.
- No string refs, `PropTypes`, or legacy context — all removed in 19.
- `ReactDOM.createRoot` is already in `src/renderer/main.tsx` — don't introduce `ReactDOM.render`.

## Licence

Private / unreleased.
