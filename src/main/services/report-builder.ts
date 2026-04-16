import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { ReportData } from '../../shared/types.js'
import { buildReportHtml } from '../templates/report.html.js'

export async function generateReport(data: ReportData): Promise<{ htmlPath: string; pdfPath: string }> {
  const outputDir = data.outputDir || path.join(app.getPath('desktop'), 'stiilileidja-output')
  fs.mkdirSync(outputDir, { recursive: true })

  const slug = slugify(data.scrapedSite?.title || data.brief.slice(0, 30) || 'raport')
  const timestamp = new Date().toISOString().slice(0, 10)
  const baseName = `${timestamp}-${slug}`

  const htmlPath = path.join(outputDir, `${baseName}.html`)
  const pdfPath = path.join(outputDir, `${baseName}.pdf`)

  const html = buildReportHtml(data)
  fs.writeFileSync(htmlPath, html, 'utf-8')

  // Generate PDF via playwright
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    })
  } finally {
    await browser.close()
  }

  return { htmlPath, pdfPath }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, 'a')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[õÕ]/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}
