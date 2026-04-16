import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { ScrapedSite, ColorSwatch, FontInfo } from '../../shared/types.js'

let chromiumInstalled = false

async function ensureChromium(): Promise<void> {
  if (chromiumInstalled) return

  const browsersPath = path.join(app.getPath('userData'), 'browsers')
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath

  if (!fs.existsSync(browsersPath)) {
    fs.mkdirSync(browsersPath, { recursive: true })
  }

  // Dynamically import after setting env var
  const { chromium } = await import('playwright-core')
  try {
    // Try launching — if it fails, install
    const execPath = chromium.executablePath()
    if (!fs.existsSync(execPath)) {
      throw new Error('Browser not found')
    }
  } catch {
    console.log('Installing Chromium browser...')
    const { execSync } = await import('child_process')
    execSync(`PLAYWRIGHT_BROWSERS_PATH="${browsersPath}" npx playwright-core install chromium`, {
      stdio: 'inherit'
    })
  }

  chromiumInstalled = true
}

export async function scrapeWebsite(url: string): Promise<ScrapedSite> {
  await ensureChromium()

  const { chromium } = await import('playwright-core')
  // node-vibrant v4 requires explicit node entry to work outside browser
  const { Vibrant } = await import('node-vibrant/node')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

    // Extract meta info
    const title = await page.title()
    const description = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="description"]') as HTMLMetaElement
      return meta?.content ?? ''
    })
    const ogImage = await page.evaluate(() => {
      const meta = document.querySelector('meta[property="og:image"]') as HTMLMetaElement
      return meta?.content ?? ''
    })

    // Above-fold screenshot
    const aboveFoldBuffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1440, height: 900 } })
    const aboveFoldBase64 = aboveFoldBuffer.toString('base64')

    // Full-page screenshot
    const fullPageBuffer = await page.screenshot({ type: 'png', fullPage: true })
    const fullPageBase64 = fullPageBuffer.toString('base64')

    // Extract fonts
    const fontData = await page.evaluate(() => {
      const selectors = ['body', 'h1', 'h2', 'nav', 'button', 'p']
      const result: Array<{ selector: string; fontFamily: string }> = []
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (el) {
          const style = window.getComputedStyle(el)
          result.push({ selector: sel, fontFamily: style.fontFamily })
        }
      }
      return result
    })

    // Extract Google Fonts links
    const googleFontLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('link[href*="fonts.googleapis.com"]'))
        .map((el) => (el as HTMLLinkElement).href)
    })

    const fonts = buildFontInfo(fontData, googleFontLinks)

    // Extract colors via node-vibrant
    const palette = await Vibrant.from(aboveFoldBuffer).getPalette()
    const colors: ColorSwatch[] = Object.entries(palette)
      .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== null)
      .map(([name, swatch]) => ({
        hex: swatch.hex,
        rgb: swatch.rgb as [number, number, number],
        population: swatch.population,
        name
      }))
      .sort((a, b) => b.population - a.population)

    return {
      url,
      title,
      description,
      screenshots: {
        fullPage: fullPageBase64,
        aboveFold: aboveFoldBase64
      },
      colors,
      fonts,
      ogImage: ogImage || undefined
    }
  } finally {
    await browser.close()
  }
}

function buildFontInfo(
  fontData: Array<{ selector: string; fontFamily: string }>,
  googleFontLinks: string[]
): FontInfo[] {
  const fontMap = new Map<string, FontInfo>()

  for (const { selector, fontFamily } of fontData) {
    // Parse first font in stack
    const primary = fontFamily.split(',')[0].trim().replace(/['"]/g, '')
    if (!primary || primary === 'inherit') continue

    if (!fontMap.has(primary)) {
      const isGoogle = googleFontLinks.some((link) =>
        link.toLowerCase().includes(primary.toLowerCase().replace(/\s+/g, '+'))
      )
      fontMap.set(primary, {
        family: primary,
        source: isGoogle ? 'google' : 'system',
        weights: [],
        usedOn: []
      })
    }

    fontMap.get(primary)!.usedOn.push(selector)
  }

  return Array.from(fontMap.values())
}
