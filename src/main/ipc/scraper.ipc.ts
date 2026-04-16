import { ipcMain } from 'electron'
import { scrapeWebsite } from '../services/scraper.js'

export function registerScraperIpc(): void {
  ipcMain.handle('scrape-website', async (_event, url: string) => {
    return await scrapeWebsite(url)
  })
}
