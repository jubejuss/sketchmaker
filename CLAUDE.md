# Stiilileidja — CLAUDE.md

## Project Overview

Desktop tool for designers. Given a client website URL or creative brief, it:
1. Scrapes the website (screenshots, colors, fonts)
2. Researches SEO competitors via Ahrefs REST API
3. Discovers design-focused competitors via Claude (geographic scope: local/regional/global)
4. Synthesizes brand strategy + element-level visual DSL (3 directions) via Claude
5. Generates moodboard imagery via Pexels (default) or OpenAI Images API (`gpt-image-1`) — user-selectable
6. Generates a PDF/HTML report
7. Renders the DSL as a live moodboard in Figma or Pencil (Paper) via MCP

## Tech Stack

- **Electron 33** + `electron-vite` (ESM, `"type": "module"` in package.json)
- **React 19** + TypeScript + Tailwind CSS 3 (ref-as-prop, no forwardRef)
- **Zustand** for state
- **Playwright-core** for website scraping (Chromium auto-installs on first run to userData)
- **node-vibrant** for color extraction from screenshots
- **Anthropic SDK** (`claude-sonnet-4-6`, streaming, `maxRetries: 0`)
- **Pexels REST API v1** — default image source; 200 req/hr free tier. Images downloaded to a temp file before handoff to Figma (see Image Fetching).
- **OpenAI Images API** (`gpt-image-1`, `quality: medium`) — alternative when user needs AI-generated scenes. Returns base64 PNG → written to a temp file before handoff to Figma.
- **jsonrepair** — fallback for malformed synthesis JSON (unescaped quotes/newlines in long outputs)
- **figma-console-mcp** (local, StdioClientTransport) for Figma integration
- **Paper MCP binary** for Pencil/Paper integration
- **electron-store** for settings persistence

## Key Paths (Machine-Specific)

These are hardcoded to the dev machine — do not change without verifying:

- figma-console-mcp: `/Users/juhokalberg/.nvm/versions/node/v20.19.2/lib/node_modules/figma-console-mcp/dist/local.js`
- Node binary: `/Users/juhokalberg/.nvm/versions/node/v20.19.2/bin/node`
- Paper MCP binary: `/Users/juhokalberg/.pencil/mcp/cursor/out/mcp-server-darwin-arm64`

## Project Structure

```
src/
  main/
    index.ts                  # BrowserWindow, IPC registration
    store.ts                  # electron-store instance
    ipc/
      scraper.ipc.ts
      research.ipc.ts         # Ahrefs + analyze-seo-wcag (legacy)
      synthesis.ipc.ts        # Claude synthesis + rate-limit IPC events
      report.ipc.ts
      moodboard.ipc.ts        # MCP availability check + execution
      settings.ipc.ts
      auth.ipc.ts             # API key detection
      projects.ipc.ts         # Save/load/list/delete recent projects
    services/
      scraper.ts              # Playwright: screenshots, CSS, palette
      ahrefs.ts               # Ahrefs REST v3 client (in-memory cache)
      claude.ts               # Synthesis (SEO/WCAG + competitor discovery + DSL). Parses via jsonrepair fallback.
      seo-wcag.ts             # Standalone SEO/WCAG (legacy, mostly unused)
      image-gen.ts            # Image fetch dispatcher — Pexels search or OpenAI generation based on `imageSource` setting
      pexels.ts               # Pexels /v1/search wrapper — orientation + deterministic photo pick (hash of prompt → index)
      report-builder.ts       # HTML template → PDF (playwright)
      mcp-figma.ts            # StdioClientTransport → figma-console-mcp
      mcp-paper.ts            # StdioClientTransport → Paper binary
      prompt-builder.ts       # Serialize results → copy-pasteable prompts + Figma script
      figma-script.ts         # Figma execute() code generator — generic DSL interpreter
    templates/
      report.html.ts          # Report HTML template (string → Playwright PDF)
  preload/
    index.ts                  # contextBridge: window.stiilileidja API
  renderer/
    App.tsx                   # View router (input/pipeline/results/settings)
    views/
      InputView.tsx           # URL/brief input, scope selector, recent projects
      PipelineView.tsx        # Live step progress
      ResultsView.tsx         # All results + moodboard/report actions
      SettingsView.tsx        # API keys, MCP test button, setup guide
    store/
      pipeline.store.ts       # Zustand: all pipeline state
  shared/
    types.ts                  # All shared TypeScript interfaces
```

## Development

```bash
npm run dev    # electron-vite HMR dev server
npm run build  # production build
npx tsc --noEmit  # type check
```

## API Keys Required

All stored via `electron-store` (Settings view):

| Key | Where to get |
|-----|-------------|
| `anthropicApiKey` | platform.claude.com → API Keys (must be `sk-ant-api03-...`, NOT `sk-ant-oat...` OAuth tokens) |
| `pexelsApiKey` | pexels.com/api/new (free, instant, 200 req/hr) — required when `imageSource: 'pexels'` (default) |
| `openaiApiKey` | platform.openai.com → API keys — required when `imageSource: 'openai'` |
| `ahrefsApiKey` | app.ahrefs.com → API (optional, without it competitor data is empty) |
| `figmaAccessToken` | figma.com → Settings → Security → Personal access tokens |

The active image source is chosen via the `imageSource` setting (`'pexels' | 'openai'`, default `pexels`). Without the active source's key, the image step is skipped and `figma-script.ts` renders tinted placeholder rectangles with the prompt as a caption.

**Important**: Anthropic OAuth tokens (`sk-ant-oat01-...`) are blocked for third-party apps since Jan 2026. Only API keys from platform.claude.com work.

**OpenAI model permissions**: `gpt-image-1` requires the OpenAI **organisation** to be verified AND the **project** to allow the model. If all 17 image requests return `403 model_not_found`, go to platform.openai.com → Settings → Project → Limits → **Allowed models** and add `gpt-image-1` (and/or `dall-e-3`). Billing/credits alone is not enough — org-level verification + project-level allow-list both gate image models.

## Figma MCP Requirements

`figma-console-mcp` connects to Figma Desktop via Chrome DevTools Protocol at `localhost:9222`. For this to work:

1. Figma Desktop must be open
2. The **Figma Desktop Bridge** plugin must be actively open (Plugins → Development → Figma Desktop Bridge)
3. Plugin must show "MCP ready" (green indicator)

This is the same plugin used by Claude Desktop's figma-console-mcp. When the plugin is open, both Claude Desktop and this app can use it.

If Figma plugin shows "Connect" button + pairing code = Cloud Mode. The local MCP (port 9222) works regardless of Cloud/Local mode setting, as long as the plugin is OPEN.

## Claude Synthesis Call

Single Claude call does everything (`src/main/services/claude.ts`):
- SEO/WCAG analysis (when URL mode)
- Competitor visual profiles (for Ahrefs competitors)
- Design competitor discovery (5-8 competitors based on geographic scope)
- Full brand synthesis + element-level `directionSpecs` DSL (3 directions)

`maxRetries: 0` on Anthropic client — our own `withRetry()` handles 429s by reading `retry-after` header.

**JSON parse resilience**: long DSL outputs occasionally contain unescaped quotes or newlines in string values. `parseResult` tries strict `JSON.parse` first, then falls back to `jsonrepair`. On strict failure it logs ±120 chars around the error position via `dumpParseContext` to aid debugging. Do not silently swallow the fallback — if jsonrepair also fails, throw with full context.

## Image Fetching

`src/main/services/image-gen.ts` walks every `directionSpec.sections[].elements` tree (recursing into `frame` children), collects elements where `kind === 'image' && imagePrompt && !imageUrl`, and dispatches to one of two providers based on the `imageSource` setting. Both providers write the bytes to `$TMPDIR/stiilileidja-images/<sha1(prompt).slice(0,16)>.<ext>` and stash the **absolute file path** on `element.imageUrl` — Figma rendering consumes file paths, not https URLs or data URLs (see "Figma image fill handoff" below).

**Pexels** (`source: 'pexels'`, default):
- `GET https://api.pexels.com/v1/search?query=X&per_page=15&orientation=landscape|portrait|square&size=large` with `Authorization: <key>` header
- Orientation picked from element aspect ratio: `>1.3` landscape, `<0.77` portrait, else square
- Photo index picked deterministically via `hashString(prompt) % 15` so reruns with the same prompt stay stable
- Resolved `src.large` URL (~940px long edge) is downloaded and cached to a temp file; absolute path stored on `element.imageUrl`
- Prompts are passed raw (no enrichment) because Pexels search responds better to concrete keywords than stylistic phrasing

**OpenAI** (`source: 'openai'`):
- `POST /v1/images/generations` with `model: 'gpt-image-1'`, `quality: 'medium'`, `n: 1`
- Size from aspect ratio: `1024×1024`, `1536×1024`, or `1024×1536`
- Prompt enriched with direction's concept + palette + mood for on-brand results
- Returned `b64_json` PNG is written directly to a temp file; if the response returns `url` instead, that URL is downloaded. Absolute path stored on `element.imageUrl`
- Requires OpenAI **organisation** verification AND **project** Allowed models to include `gpt-image-1`. If all requests return `403 model_not_found`, go to platform.openai.com → Settings → Project → Limits → Allowed models and add `gpt-image-1`.

Both paths: concurrency capped at 3, per-image progress reported via `synthesis:image-progress`. The temp dir is wiped after the moodboard finishes by `cleanupImageTempFiles()`.

## Figma image fill handoff

Image fills **cannot** be applied from inside `figma_execute`'s eval sandbox — `figma.createImage(bytes)` returns a hash but the bytes never reach Figma's document-level image store, so the rectangle renders solid grey. `figma.createImageAsync(httpsUrl)` is blocked by the Desktop Bridge plugin's `manifest.json` allowedDomains. `atob` is undefined in the sandbox.

The working flow:
1. `figma-script.ts` creates rectangles with a grey placeholder fill and collects `{ nodeId, url }` into `__SL_IMG_REQUESTS` (where `url` is the absolute temp file path).
2. Script returns the list to the main process.
3. `mcp-figma.ts` groups requests by source (same image → one MCP call, multiple nodeIds), then calls `figma_set_image_fill` with the file path as `imageData`. The MCP server reads the file from disk in its own handler — running in the persistent plugin context where images persist — and applies the fill.

`figma_set_image_fill`'s `imageData` parameter accepts absolute paths starting with `/` OR raw base64 (no `data:` prefix). File paths are preferred because MCP stdio truncates large base64 params silently (fails above ~100 KB).

**Note on `element.imageHash`**: this field is a legacy app-side cache key (32-bit → base36), NOT a Figma SHA1 hash. It is no longer used anywhere but kept in the type for backward compatibility with saved projects. The real Figma hash comes from `figma_set_image_fill` in the server, not from the eval sandbox.

## Pipeline Steps

`StepId = 'scrape' | 'research' | 'discover' | 'synthesize' | 'report' | 'moodboard'`

- `scrape`: Playwright screenshots + colors + fonts
- `research`: Ahrefs organic competitors (skipped if no API key or brief-only mode)
- `discover`: Design competitor discovery (runs inside synthesize step, marked done after synthesis)
- `synthesize`: Single Claude call returning full `SynthesisResult` (DSL + `discoveredCompetitors` + `seoWcag`). After Claude finishes, `image-gen.ts` runs in-line and reports per-image progress via `synthesis:image-progress` events that update the step message (e.g. "Genereerin pilte 3/13…"). There is no separate `images` StepId.
- `report`: Playwright PDF + HTML saved to outputDir
- `moodboard`: Figma or Pencil via MCP (or prompt output mode)

## Recent Projects

Auto-saved after each synthesis to `{outputDir}/projects/{id}.json`. Max 20 kept in electron-store (`savedProjects` key). Listed in InputView with "Ava" and "×" buttons.

## Competitor Scope

`CompetitorScope = 'local' | 'regional' | 'global'`

Passed in `SynthesisContext.competitorScope`. The synthesis prompt instructs Claude to find design-focused competitors in the appropriate geographic scope. Has no effect on Ahrefs data (which returns global SEO competitors regardless).

## Key TypeScript Types

See `src/shared/types.ts` for:
- `ScrapedSite`, `ColorSwatch`, `FontInfo`
- `CompetitorData`, `CompetitorVisualProfile`, `DiscoveredCompetitor`
- `SynthesisContext`, `SynthesisResult`
- `SeoWcagResult`
- `SavedProject`, `SavedProjectData`
- `StepId`, `StepStatus`, `OutputMode`, `CompetitorScope`

## Electron IPC Channels

All defined in `src/preload/index.ts` and typed in `src/renderer/env.d.ts`.

Streaming events: `synthesis:token`, `synthesis:image-progress`, `synthesis:rate-limit-wait`, `moodboard:progress`, `step:update`, `seo-wcag:token`, `auth:key-captured`, `auth:window-closed`

## Visual DSL Rules (critical)

These invariants are enforced across `claude.ts`, `figma-script.ts`, and `image-gen.ts` — break them and moodboards fail silently:

- **No layout templates anywhere**. Every `VisualElement` is bespoke to the direction. Do not add hardcoded section layouts to `figma-script.ts` — it is a dumb interpreter by design.
- **Font loading order**: fonts must be loaded *after* `figma.currentPage = page`, never before. Fonts loaded before page-context change silently fail and text nodes render blank. This is hard to debug — respect the rule.
- **Fonts + layouts come from Claude**, not from direction index. `styleSketchPrompts[i].typography` and `layoutRecipe` drive rendering. The P/Z/D renderer libraries (if ever introduced) are neutral building blocks — Claude's recipe selects which to use per section.
- **Concept output must be rich mockups**, not simple brand cards — nav + hero + cards + footer per direction, each visually distinct enough to communicate the design attitude to a client.
- **Image fills go through `figma_set_image_fill`, not `figma_execute`**. Inside the eval sandbox, `figma.createImage(bytes)` returns a hash but the bytes don't persist to Figma's document image store — the fill renders grey. `renderImage` in `figma-script.ts` applies a grey placeholder and queues `{ nodeId, url }` into `__SL_IMG_REQUESTS`; the main process then applies real fills via the MCP tool.
- **Image sources are absolute file paths**, not https URLs or data URLs. `image-gen.ts` writes every fetched image to `$TMPDIR/stiilileidja-images/` and stores the absolute path on `element.imageUrl`. MCP stdio silently truncates large base64 params (> ~100 KB), so file paths are the only reliable path for pipeline images.
- **`element.imageHash` is dead**: app-side legacy cache key, never a Figma SHA1 hash. Do not pass it anywhere — the real Figma hash is produced by `figma_set_image_fill` in the MCP server, not in the sandbox.

## Figma MCP Daemon Lifecycle

`src/main/services/mcp-figma.ts` spawns `figma-console-mcp` via `StdioClientTransport` once per app launch. Before spawning, `cleanupOrphanDaemons()` scans `/tmp/figma-console-mcp-*.json`, reads each port file's `pid`, and:
- Removes the port file if the PID is dead
- `SIGKILL`s the process and removes the port file if PPID=1 (orphan from a crashed Electron run)

Without this cleanup, an orphan from a prior crash holds port 9223, the new daemon gets pushed to 9224+, and the port-file discovery polling times out → "pordi faili ei leita" error. The cleanup also catches Claude Desktop's figma-console-mcp orphans — acceptable trade-off because stale orphans block our own startup.
