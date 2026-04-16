# Stiilileidja

**Repo:** https://github.com/jubejuss/sketchmaker

Desktop moodboard generator for designers. Point it at a client URL (or paste a brief), it scrapes the site, analyses competitors, runs a single Claude call that outputs three radically different visual directions as a bespoke element-level DSL, generates images with DALL·E 3, then renders everything live into Figma or Pencil (Paper) via MCP.

No layout templates — every pixel spec is authored by Claude per brand.

## Stack

- **Electron 33** (`electron-vite`, ESM) + **React 19** + TypeScript + Zustand
- **Playwright-core** — scraping (Chromium auto-installs to userData on first run)
- **node-vibrant** — colour extraction
- **Anthropic SDK** (`claude-sonnet-4-6`, streaming)
- **OpenAI Images API** (`dall-e-3`) — in-scene moodboard imagery
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
| `openaiApiKey` | platform.openai.com → API keys (`sk-proj-…` or `sk-…`) | Optional — DALL·E 3 image generation. Without it, moodboards render with tinted placeholder rects instead of photos |
| `ahrefsApiKey` | app.ahrefs.com → Account → API | Optional — organic SEO competitors. Without it that step is skipped |
| `figmaAccessToken` | figma.com → Settings → Security → Personal access tokens | Moodboard rendering in Figma |

> Anthropic OAuth tokens (`sk-ant-oat…`) are blocked for third-party apps since Jan 2026. Use API keys from platform.claude.com.

### Figma MCP

1. Install Figma Desktop
2. In Figma: `Plugins → Development → Import plugin from manifest` → `~/.figma-console-mcp/plugin/manifest.json`
3. Open the plugin (`Plugins → Development → Figma Desktop Bridge`) and set it to **Local Mode**
4. Keep the plugin window open while running a moodboard — it bridges Figma's plugin runtime to the app

### Pencil (Paper) MCP

Just run Pencil/Paper. The MCP binary is spawned automatically.

## Pipeline steps

`scrape → research → discover → synthesize → (images) → report → moodboard`

1. **scrape** — Playwright screenshots + CSS fonts + palette
2. **research** — Ahrefs organic competitors (skipped w/o key or in brief-only mode)
3. **discover** — design-focused competitors (runs inside synthesis)
4. **synthesize** — single streaming Claude call, returns `SynthesisResult` including `directionSpecs[]` with full element-level DSL per section
5. **image generation** — walks the DSL, calls DALL·E 3 per `image` element, writes `data:` URLs back
6. **report** — PDF + HTML written to `~/Desktop/stiilileidja-output` (default)
7. **moodboard** — Figma (`figma-execute`) renders the DSL live, or outputs a copy-pasteable prompt (`figma-prompt` / `paper-prompt`)

## Project layout

```
src/
  main/              Electron main process
    ipc/             IPC handlers (scraper, research, synthesis, report, moodboard, settings, auth, projects)
    services/        Business logic
      claude.ts      Synthesis prompt + streaming
      scraper.ts     Playwright
      image-gen.ts   DALL·E 3 batch generator
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
- `gpt-image-1` is cheaper and sharper than `dall-e-3` but requires OpenAI org verification. Switch the model in `src/main/services/image-gen.ts` once your org is verified.
- Add an image cache by prompt hash so repeated runs on the same brief reuse images.
- Try a faster local model (SDXL Turbo, Flux.1-schnell) via Replicate for cost control.

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
