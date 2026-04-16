import { ipcMain, shell } from 'electron'
import { generateReport } from '../services/report-builder.js'
import store from '../store.js'
import type { ReportData } from '../../shared/types.js'

export function registerReportIpc(): void {
  ipcMain.handle('generate-report', async (_event, data: ReportData) => {
    const outputDir = store.get('outputDir') || undefined
    const result = await generateReport({ ...data, outputDir: outputDir ?? data.outputDir })

    // Auto-open PDF
    shell.openPath(result.pdfPath)

    return result
  })
}
