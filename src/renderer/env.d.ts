/// <reference types="vite/client" />

// Allow -webkit-app-region in React inline styles (Electron drag regions)
declare module 'react' {
  interface CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
  }
}

import type {
  SynthesisContext,
  ReportData,
  MoodboardData,
  OutputMode,
  StepUpdate,
  ScrapedSite,
  CompetitorData,
  SeoWcagResult,
  SavedProject,
  SavedProjectData
} from '../shared/types.js'

interface StiilileidjaAPI {
  scrapeWebsite: (url: string) => Promise<ScrapedSite>
  researchCompetitors: (domain: string) => Promise<CompetitorData[]>
  analyzeSeoWcag: (site: ScrapedSite) => Promise<SeoWcagResult>
  synthesize: (context: SynthesisContext) => Promise<import('../shared/types.js').SynthesisResult>
  generateReport: (data: ReportData) => Promise<{ htmlPath: string; pdfPath: string }>
  generateMoodboard: (data: MoodboardData, mode: OutputMode) => Promise<unknown>
  checkMcpStatus: () => Promise<{
    figma: boolean; paper: boolean;
    figmaError?: string; paperError?: string;
    figmaPort?: number | null; figmaClients?: number; figmaDaemonRunning?: boolean
  }>
  getSettings: () => Promise<import('../shared/types.js').AppSettings>
  saveSettings: (settings: Record<string, string>) => Promise<{ ok: boolean }>
  onSynthesisToken: (cb: (token: string) => void) => () => void
  onMoodboardProgress: (cb: (msg: string) => void) => () => void
  onStepUpdate: (cb: (step: StepUpdate) => void) => () => void
  openExternal: (url: string) => Promise<void>
  detectApiKey: () => Promise<{ found: boolean; preview?: string }>
  loginWithClaudeCode: () => Promise<{ ok: boolean; preview?: string; reason?: string }>
  openLoginWindow: () => Promise<void>
  authStatus: () => Promise<{ loggedIn: boolean; method?: string }>
  onAuthKeyCaptured: (cb: (preview: string) => void) => () => void
  onAuthWindowClosed: (cb: () => void) => () => void
  onSeoWcagToken: (cb: (token: string) => void) => () => void
  onRateLimitWait: (cb: (info: { attempt: number; waitSec: number }) => void) => () => void
  onImageProgress: (cb: (info: { done: number; total: number; label?: string }) => void) => () => void
  saveProject: (data: SavedProjectData) => Promise<{ ok: boolean }>
  listProjects: () => Promise<SavedProject[]>
  loadProject: (id: string) => Promise<SavedProjectData>
  deleteProject: (id: string) => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    stiilileidja: StiilileidjaAPI
  }
}
