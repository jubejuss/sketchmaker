/**
 * Rasterizes build/icon.svg → iconset PNGs + icon.icns + icon.png for Electron.
 *
 * Uses playwright-core (already a dependency) as the SVG renderer — it's the
 * only SVG→PNG tool reliably available on dev machines in this project
 * (no rsvg-convert, no ImageMagick).
 *
 * Outputs:
 *   build/icon.iconset/icon_{16,32,64,128,256,512}x{…}{,@2x}.png
 *   build/icon.icns          (macOS app icon)
 *   build/icon.png           (1024×1024, Linux/Windows fallback)
 */
import { chromium } from 'playwright-core'
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const svgPath = join(projectRoot, 'build/icon.svg')
const iconsetDir = join(projectRoot, 'build/icon.iconset')
const icnsPath = join(projectRoot, 'build/icon.icns')
const pngPath = join(projectRoot, 'build/icon.png')

// macOS .iconset required files (per Apple spec)
const sizes: Array<{ file: string; px: number }> = [
  { file: 'icon_16x16.png', px: 16 },
  { file: 'icon_16x16@2x.png', px: 32 },
  { file: 'icon_32x32.png', px: 32 },
  { file: 'icon_32x32@2x.png', px: 64 },
  { file: 'icon_128x128.png', px: 128 },
  { file: 'icon_128x128@2x.png', px: 256 },
  { file: 'icon_256x256.png', px: 256 },
  { file: 'icon_256x256@2x.png', px: 512 },
  { file: 'icon_512x512.png', px: 512 },
  { file: 'icon_512x512@2x.png', px: 1024 }
]

async function main(): Promise<void> {
  if (!existsSync(svgPath)) throw new Error(`SVG not found: ${svgPath}`)

  if (existsSync(iconsetDir)) rmSync(iconsetDir, { recursive: true, force: true })
  mkdirSync(iconsetDir, { recursive: true })

  const svg = readFileSync(svgPath, 'utf8')

  // Scripts run outside Electron, so Playwright's bundled Chromium isn't in the
  // default path. Prefer the project-installed Chromium (matches what the Electron
  // runtime uses); fall back to system Chrome which is present on all dev machines.
  const projectChromium = '/Users/juhokalberg/Library/Application Support/stiilileidja/browsers/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const executablePath = existsSync(projectChromium) ? projectChromium : systemChrome
  const browser = await chromium.launch({ headless: true, executablePath })
  const context = await browser.newContext({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
  const page = await context.newPage()

  // Render page: SVG scaled to full viewport, transparent background so we can
  // overlay a solid color later if we ever want a flat PNG for Windows/Linux.
  const html = `<!doctype html><html><head><style>
    html,body { margin:0; padding:0; background: transparent; }
    svg { display:block; width:100vw; height:100vh; }
  </style></head><body>${svg}</body></html>`

  const uniquePixelSizes = [...new Set(sizes.map(s => s.px))].sort((a, b) => a - b)
  const pngByPx = new Map<number, Buffer>()

  for (const px of uniquePixelSizes) {
    await page.setViewportSize({ width: px, height: px })
    await page.setContent(html, { waitUntil: 'load' })
    const buf = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } })
    pngByPx.set(px, buf)
    console.log(`[icon] rendered ${px}×${px} (${buf.length} bytes)`)
  }

  await browser.close()

  for (const { file, px } of sizes) {
    const buf = pngByPx.get(px)
    if (!buf) throw new Error(`missing render for ${px}×${px}`)
    writeFileSync(join(iconsetDir, file), buf)
  }
  console.log(`[icon] wrote iconset → ${iconsetDir}`)

  // 1024×1024 for Linux/Windows fallback + dev-mode BrowserWindow
  writeFileSync(pngPath, pngByPx.get(1024)!)
  console.log(`[icon] wrote ${pngPath}`)

  // macOS .icns
  execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' })
  console.log(`[icon] wrote ${icnsPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
