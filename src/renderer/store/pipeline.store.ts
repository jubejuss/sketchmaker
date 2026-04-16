import { create } from 'zustand'
import type {
  ScrapedSite,
  CompetitorData,
  SynthesisResult,
  SeoWcagResult,
  StepId,
  StepStatus,
  OutputMode,
  CompetitorScope,
  PageSection
} from '../../shared/types.js'
import { DEFAULT_SECTIONS } from '../../shared/types.js'

interface StepState {
  status: StepStatus
  message?: string
}

interface PipelineStore {
  // Input
  mode: 'brief' | 'url'
  brief: string
  url: string

  // Steps
  steps: Record<StepId, StepState>

  // Results
  scrapedSite: ScrapedSite | null
  competitors: CompetitorData[]
  synthesis: SynthesisResult | null
  synthesisStream: string
  seoWcagResult: SeoWcagResult | null
  reportPaths: { htmlPath: string; pdfPath: string } | null
  moodboardResult: unknown | null

  // Output config
  outputMode: OutputMode
  competitorScope: CompetitorScope
  selectedSections: PageSection[]

  // UI
  activeView: 'input' | 'pipeline' | 'results' | 'settings'
  projectName: string

  // Actions
  setMode: (mode: 'brief' | 'url') => void
  setBrief: (brief: string) => void
  setUrl: (url: string) => void
  setOutputMode: (mode: OutputMode) => void
  setCompetitorScope: (scope: CompetitorScope) => void
  setSelectedSections: (sections: PageSection[]) => void
  toggleSection: (section: PageSection) => void
  moveSection: (section: PageSection, delta: -1 | 1) => void
  setActiveView: (view: 'input' | 'pipeline' | 'results' | 'settings') => void
  setProjectName: (name: string) => void
  setStep: (step: StepId, state: StepState) => void
  setScrapedSite: (site: ScrapedSite | null) => void
  setCompetitors: (competitors: CompetitorData[]) => void
  setSynthesis: (result: SynthesisResult | null) => void
  appendSynthesisToken: (token: string) => void
  clearSynthesisStream: () => void
  setSeoWcagResult: (result: SeoWcagResult | null) => void
  setReportPaths: (paths: { htmlPath: string; pdfPath: string } | null) => void
  setMoodboardResult: (result: unknown) => void
  reset: () => void
}

const initialSteps: Record<StepId, StepState> = {
  scrape: { status: 'idle' },
  research: { status: 'idle' },
  discover: { status: 'idle' },
  synthesize: { status: 'idle' },
  report: { status: 'idle' },
  moodboard: { status: 'idle' }
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  mode: 'url',
  brief: '',
  url: '',
  steps: { ...initialSteps },
  scrapedSite: null,
  competitors: [],
  synthesis: null,
  synthesisStream: '',
  seoWcagResult: null,
  reportPaths: null,
  moodboardResult: null,
  outputMode: 'paper-prompt',
  competitorScope: 'regional',
  selectedSections: [...DEFAULT_SECTIONS],
  activeView: 'input',
  projectName: '',

  setMode: (mode) => set({ mode }),
  setBrief: (brief) => set({ brief }),
  setUrl: (url) => set({ url }),
  setOutputMode: (outputMode) => set({ outputMode }),
  setCompetitorScope: (competitorScope) => set({ competitorScope }),
  setSelectedSections: (selectedSections) => set({ selectedSections }),
  toggleSection: (section) =>
    set((s) => {
      const has = s.selectedSections.includes(section)
      return {
        selectedSections: has
          ? s.selectedSections.filter((x) => x !== section)
          : [...s.selectedSections, section]
      }
    }),
  moveSection: (section, delta) =>
    set((s) => {
      const idx = s.selectedSections.indexOf(section)
      const next = idx + delta
      if (idx === -1 || next < 0 || next >= s.selectedSections.length) return s
      const arr = [...s.selectedSections]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return { selectedSections: arr }
    }),
  setActiveView: (activeView) => set({ activeView }),
  setProjectName: (projectName) => set({ projectName }),

  setStep: (step, state) =>
    set((s) => ({ steps: { ...s.steps, [step]: state } })),

  setScrapedSite: (scrapedSite) => set({ scrapedSite }),
  setCompetitors: (competitors) => set({ competitors }),
  setSynthesis: (synthesis) => set({ synthesis }),

  appendSynthesisToken: (token) =>
    set((s) => ({ synthesisStream: s.synthesisStream + token })),

  clearSynthesisStream: () => set({ synthesisStream: '' }),

  setSeoWcagResult: (seoWcagResult) => set({ seoWcagResult }),
  setReportPaths: (reportPaths) => set({ reportPaths }),
  setMoodboardResult: (moodboardResult) => set({ moodboardResult }),

  reset: () =>
    set({
      steps: { ...initialSteps },
      scrapedSite: null,
      competitors: [],
      synthesis: null,
      synthesisStream: '',
      seoWcagResult: null,
      reportPaths: null,
      moodboardResult: null,
      activeView: 'input'
    })
}))
