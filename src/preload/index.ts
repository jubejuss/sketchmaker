import { contextBridge, ipcRenderer } from 'electron'
import type {
  SynthesisContext,
  ReportData,
  MoodboardData,
  OutputMode,
  StepUpdate,
  ScrapedSite,
  SavedProjectData
} from '../shared/types.js'

contextBridge.exposeInMainWorld('stiilileidja', {
  scrapeWebsite: (url: string) =>
    ipcRenderer.invoke('scrape-website', url),

  researchCompetitors: (domain: string) =>
    ipcRenderer.invoke('research-competitors', domain),

  analyzeSeoWcag: (site: ScrapedSite) =>
    ipcRenderer.invoke('analyze-seo-wcag', site),

  synthesize: (context: SynthesisContext) =>
    ipcRenderer.invoke('synthesize-brief', context),

  generateReport: (data: ReportData) =>
    ipcRenderer.invoke('generate-report', data),

  generateMoodboard: (data: MoodboardData, mode: OutputMode) =>
    ipcRenderer.invoke('generate-moodboard', data, mode),

  checkMcpStatus: () =>
    ipcRenderer.invoke('check-mcp-status'),

  getSettings: () =>
    ipcRenderer.invoke('get-settings'),

  saveSettings: (settings: Record<string, string>) =>
    ipcRenderer.invoke('save-settings', settings),

  onSynthesisToken: (cb: (token: string) => void) => {
    const handler = (_: unknown, token: string) => cb(token)
    ipcRenderer.on('synthesis:token', handler)
    return () => ipcRenderer.off('synthesis:token', handler)
  },

  onMoodboardProgress: (cb: (msg: string) => void) => {
    const handler = (_: unknown, msg: string) => cb(msg)
    ipcRenderer.on('moodboard:progress', handler)
    return () => ipcRenderer.off('moodboard:progress', handler)
  },

  onStepUpdate: (cb: (step: StepUpdate) => void) => {
    const handler = (_: unknown, step: StepUpdate) => cb(step)
    ipcRenderer.on('step:update', handler)
    return () => ipcRenderer.off('step:update', handler)
  },

  openExternal: (url: string) =>
    ipcRenderer.invoke('open-external', url),

  detectApiKey: () =>
    ipcRenderer.invoke('detect-api-key'),

  loginWithClaudeCode: () =>
    ipcRenderer.invoke('login-with-claude-code'),

  openLoginWindow: () =>
    ipcRenderer.invoke('open-login-window'),

  authStatus: () =>
    ipcRenderer.invoke('auth-status'),

  onAuthKeyCaptured: (cb: (preview: string) => void) => {
    const handler = (_: unknown, preview: string) => cb(preview)
    ipcRenderer.on('auth:key-captured', handler)
    return () => ipcRenderer.off('auth:key-captured', handler)
  },

  onAuthWindowClosed: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('auth:window-closed', handler)
    return () => ipcRenderer.off('auth:window-closed', handler)
  },

  onSeoWcagToken: (cb: (token: string) => void) => {
    const handler = (_: unknown, token: string) => cb(token)
    ipcRenderer.on('seo-wcag:token', handler)
    return () => ipcRenderer.off('seo-wcag:token', handler)
  },

  onRateLimitWait: (cb: (info: { attempt: number; waitSec: number }) => void) => {
    const handler = (_: unknown, info: { attempt: number; waitSec: number }) => cb(info)
    ipcRenderer.on('synthesis:rate-limit-wait', handler)
    return () => ipcRenderer.off('synthesis:rate-limit-wait', handler)
  },

  onImageProgress: (cb: (info: { done: number; total: number; label?: string }) => void) => {
    const handler = (_: unknown, info: { done: number; total: number; label?: string }) => cb(info)
    ipcRenderer.on('synthesis:image-progress', handler)
    return () => ipcRenderer.off('synthesis:image-progress', handler)
  },

  saveProject: (data: SavedProjectData) =>
    ipcRenderer.invoke('save-project', data),

  listProjects: () =>
    ipcRenderer.invoke('list-projects'),

  loadProject: (id: string) =>
    ipcRenderer.invoke('load-project', id),

  deleteProject: (id: string) =>
    ipcRenderer.invoke('delete-project', id)
})
