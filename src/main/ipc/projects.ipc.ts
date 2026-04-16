import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import store from '../store.js'
import type { SavedProject, SavedProjectData } from '../../shared/types.js'

function getOutputDir(): string {
  return store.get('outputDir') || path.join(app.getPath('desktop'), 'stiilileidja-output')
}

function getProjectsDir(): string {
  return path.join(getOutputDir(), 'projects')
}

function listFromStore(): SavedProject[] {
  return (store.get('savedProjects' as never) as SavedProject[] | undefined) ?? []
}

function saveToStore(projects: SavedProject[]): void {
  store.set('savedProjects' as never, projects as never)
}

export function registerProjectsIpc(): void {
  ipcMain.handle('save-project', async (_event, data: SavedProjectData) => {
    try {
      const dir = getProjectsDir()
      fs.mkdirSync(dir, { recursive: true })
      const filePath = path.join(dir, `${data.id}.json`)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')

      const entry: SavedProject = {
        id: data.id,
        name: data.name,
        url: data.url,
        brief: data.brief,
        createdAt: data.createdAt,
        filePath
      }

      // Keep last 20 projects, most recent first
      const existing = listFromStore().filter(p => p.id !== data.id)
      saveToStore([entry, ...existing].slice(0, 20))

      return { ok: true }
    } catch (err) {
      console.error('[projects] save error:', err)
      return { ok: false }
    }
  })

  ipcMain.handle('list-projects', () => {
    // Prune entries whose files no longer exist
    const projects = listFromStore().filter(p => {
      try { return fs.existsSync(p.filePath) } catch { return false }
    })
    saveToStore(projects)
    return projects
  })

  ipcMain.handle('load-project', (_event, id: string) => {
    const entry = listFromStore().find(p => p.id === id)
    if (!entry) throw new Error(`Project ${id} not found`)
    const raw = fs.readFileSync(entry.filePath, 'utf-8')
    return JSON.parse(raw) as SavedProjectData
  })

  ipcMain.handle('delete-project', (_event, id: string) => {
    const projects = listFromStore()
    const entry = projects.find(p => p.id === id)
    if (entry) {
      try { fs.unlinkSync(entry.filePath) } catch {}
    }
    saveToStore(projects.filter(p => p.id !== id))
    return { ok: true }
  })
}
