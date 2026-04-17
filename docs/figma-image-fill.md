# Figma image fill — why it took three tries

Notes from the `debug/figma-image-probe` investigation. Read this before
touching image rendering in `figma-script.ts` or `mcp-figma.ts`.

## Symptom

Image elements in generated moodboards rendered as uniform gray rectangles
in Figma. All upstream steps reported success:

- Pexels download: OK
- data URL encoding: OK
- DSL rendering: OK, no errors logged
- `figma.createImageAsync(dataUrl)` inside `figma_execute`: returned a
  40-char SHA1 hash that looked entirely valid
- Setting `{ type: 'IMAGE', imageHash }` as a fill: no errors thrown

Yet every rectangle came out mid-gray.

## Investigation

Built a diagnostic probe (`probeFigmaImages` in `mcp-figma.ts`, triggered
by a button in `SettingsView.tsx`) that runs a minimal self-contained
script through the already-connected Bridge daemon and tests each image
API in isolation. Probe results:

| # | API | Result |
|---|-----|--------|
| 1 | sync `figma.createImage(bytes)` | Skipped — `atob` is **undefined** in Bridge eval sandbox, so base64 can't be decoded |
| 2 | `figma.createImageAsync(dataUrl)` | Returned hash `ea980b…` (40 chars, looks valid) |
| 3 | `figma.createImageAsync(httpsUrl)` | Rejected: `Image URL … does not satisfy the allowedDomains specified in the manifest.json` |
| 4 | Apply the hash from #2 as IMAGE fill on a live rect | `ok: true` — but rectangle rendered solid gray |

## Root cause

`figma.createImageAsync` called from Bridge's `figma_execute` eval
sandbox returns a hash that is **cosmetic only** — the image bytes never
reach Figma's document-level image store. The IMAGE fill references a
hash with no backing bytes, so the rendering pipeline falls back to gray.

Bridge's *native* `SET_IMAGE_FILL` handler works differently: it receives
raw bytes over the WebSocket, calls `figma.createImage(bytes)` from the
plugin's **main** context (not eval), and applies the resulting hash to
the target nodes. Because `createImage` runs in the real plugin context,
the bytes land in Figma's image store correctly.

## Second gotcha: MCP stdio truncation

Once we moved to `figma_set_image_fill`, the obvious approach was to
embed the bytes as a `data:image/png;base64,…` URL in `__SL_IMG_REQUESTS`
and hand them to the MCP tool verbatim. This still rendered gray for
anything larger than ~100 KB per image.

Reason: `StdioClientTransport` (both client and server sides of
`@modelcontextprotocol/sdk`) truncates large parameter strings silently.
A 200–500 KB base64 blob × 15 images overflows the stdio buffer; the
MCP server receives a corrupted param but still hashes whatever arrived
and reports success. No error is surfaced anywhere.

Workaround the MCP tool already documents: `figma_set_image_fill`
accepts an absolute file path starting with `/` as `imageData`. The
server reads the file from disk in its own handler, completely
bypassing the stdio pipe for the image payload.

## Fix

Split the pipeline into two phases, and never put image bytes on the
stdio pipe:

1. **Fetch phase** (`image-gen.ts`): for each `VisualElement` with
   `kind: 'image' && imagePrompt && !imageUrl`, resolve the image via
   Pexels or OpenAI, write the bytes to
   `$TMPDIR/stiilileidja-images/<sha1(prompt).slice(0,16)>.<ext>`,
   and store the **absolute file path** on `element.imageUrl`.

2. **Layout phase** (`figma_execute` in `figma-script.ts`): build the
   canvas, frames, text, and image rectangles. Image rectangles get a
   placeholder gray fill. For each image rect, push `{ nodeId, url }`
   onto `__SL_IMG_REQUESTS` (where `url` is the absolute file path from
   phase 1). Return that array from the script.

3. **Image-fill phase** (`executeFigmaMoodboard` in `mcp-figma.ts`):
   parse the `imgRequests` array out of the `figma_execute` result,
   group nodeIds by shared source (dedup so the same photo appearing in
   multiple directions uploads once), and call `figma_set_image_fill`
   with the file path as `imageData`. Per-source progress reported via
   `onProgress`. `cleanupImageTempFiles()` wipes the temp dir after
   the moodboard run returns.

## Invariants (do not break)

- **Never apply image fills from inside `figma_execute`.** Hashes
  returned by `createImageAsync` in eval context look right but never
  render — the bytes aren't persisted in the document's image store.
  Image fills MUST go through the native `figma_set_image_fill` MCP
  tool.
- **Never send image bytes on the stdio pipe.** `figma_set_image_fill`
  accepts a raw base64 string too, but MCP stdio silently truncates
  large params (> ~100 KB). Always hand the tool an **absolute file
  path** starting with `/`; the server reads the file from disk and
  streams the bytes through its own handler.
- **`atob` is not available in Bridge's eval sandbox.** The sync
  `createImage(bytes)` path is therefore dead from inside
  `figma_execute`, regardless of what the probe reports about
  `typeof figma.createImage`.
- **`createImageAsync(httpsUrl)` is blocked** by the plugin manifest's
  `allowedDomains`. Server-side download to a temp file (via Node
  `fetch` in `image-gen.ts`) is mandatory before images reach Figma.
- **`element.imageHash` is app-side only** (32-bit → base36 dedup key,
  legacy). Never pass it to `figma.set_fills` or
  `figma_set_image_fill` — the real Figma hash is produced by Bridge's
  handler, not by us.

## Fast-feedback harness

The probe lives at:

- `src/main/services/mcp-figma.ts` → `probeFigmaImages()`
- `src/main/ipc/moodboard.ipc.ts` → `ipcMain.handle('probe-figma-images')`
- `src/renderer/views/SettingsView.tsx` → "Proovi Figma image API-sid" button

The probe runs two tests in one round-trip:
1. The original eval-sandbox API matrix (`createImage`, `createImageAsync`
   with data URL, `createImageAsync` with https URL, `setFills` with the
   returned hash) — useful for spotting future regressions in Bridge's
   sandbox behavior.
2. The file-path flow: generates a 32×32 red PNG in Node, writes it to
   the same `$TMPDIR/stiilileidja-images/` dir the real pipeline uses,
   creates a rectangle via `figma_execute`, and calls
   `figma_set_image_fill` with the absolute path. The Figma canvas shows
   a solid red square when the flow is healthy — anything else means the
   pipeline is broken.

Round-trip is ~2 seconds vs. 2+ minutes for the full pipeline. Reach for
it whenever a Bridge-sandbox behavior question comes up — it's cheaper
to extend the probe than to instrument the real flow.

A standalone CLI version also exists at `scripts/probe-figma-images.ts`
(run via `npm run probe:images`), but it needs the Electron dev server
stopped first because it spawns its own daemon on the same port family.
The in-app button avoids that by piggybacking on the already-connected
daemon.

## Related: synthesis truncation

Unrelated to Figma but discovered during the same debugging session: if
Claude's synthesis response hits `max_tokens`, the `</json>` closing tag
never arrives and `parseResult` would fail hard. Fixed in `claude.ts`:
when a `<json>` opening tag is found without a matching close, the tail
is fed to `jsonrepair`, which patches the unclosed structure. Check
`stop_reason === 'max_tokens'` in the terminal log to confirm truncation
is the cause of any parse warnings.
