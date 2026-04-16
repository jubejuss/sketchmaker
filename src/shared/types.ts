export interface ScrapedSite {
  url: string
  title: string
  description: string
  screenshots: {
    fullPage: string   // base64 PNG
    aboveFold: string  // base64 PNG
  }
  colors: ColorSwatch[]
  fonts: FontInfo[]
  ogImage?: string
}

export interface ColorSwatch {
  hex: string
  rgb: [number, number, number]
  population: number
  name: string  // 'Vibrant', 'Muted', 'DarkVibrant', etc.
}

export interface FontInfo {
  family: string
  source: 'google' | 'system' | 'custom'
  weights: string[]
  usedOn: string[]  // 'body', 'h1', 'nav', etc.
}

export interface CompetitorData {
  domain: string
  url: string
  domainRating?: number
  organicTraffic?: number
  topKeywords?: string[]
  isLocal: boolean
}

export interface CompetitorVisualProfile {
  domain: string
  visualStyle: string        // e.g. "Minimalist editorial, lots of white space"
  keyColors: string[]        // hex codes inferred from known brand
  typography: string         // e.g. "Serif heading + humanist sans body"
  differentiator: string     // what makes them visually distinct
}

export type CompetitorScope = 'local' | 'regional' | 'global'

export type PageSection =
  | 'header'
  | 'hero'
  | 'events'
  | 'news'
  | 'team'
  | 'services'
  | 'gallery'
  | 'testimonials'
  | 'cta'
  | 'contact'
  | 'footer'

export const DEFAULT_SECTIONS: PageSection[] = ['header', 'hero', 'events', 'news', 'footer']

export interface DiscoveredCompetitor {
  domain: string
  url: string
  name: string
  country: string
  visualStyle: string
  keyColors: string[]
  typography: string
  reason: string  // why they're a relevant design inspiration
}

export interface SynthesisContext {
  brief: string
  scrapedSite?: ScrapedSite
  competitors: CompetitorData[]
  competitorScope?: CompetitorScope
  sections?: PageSection[]           // ordered list of sections Claude should emit per direction
}

export interface StyleRecommendation {
  type: 'color' | 'typography' | 'imagery' | 'texture' | 'layout'
  value: string
  rationale: string
}

export interface DirectionTypography {
  heading: string
  headingWeight?: 'Regular' | 'Medium' | 'SemiBold' | 'Bold' | 'Black'
  body: string
}

// ── Visual DSL: Claude specifies every element per section per direction ──

export type VisualKind = 'text' | 'rect' | 'ellipse' | 'line' | 'frame' | 'image'
export type FontWeight = 'Regular' | 'Medium' | 'SemiBold' | 'Bold' | 'Black'

export interface VisualElement {
  kind: VisualKind
  x: number
  y: number
  w?: number
  h?: number
  rotation?: number                    // degrees
  color?: string                       // hex; for text this is text color, for shapes it's fill
  opacity?: number                     // 0-1
  cornerRadius?: number
  strokeColor?: string
  strokeWeight?: number

  // text
  text?: string
  fontFamily?: string
  fontWeight?: FontWeight
  fontSize?: number
  letterSpacing?: number               // percent
  lineHeight?: number                  // multiplier
  textCase?: 'upper' | 'lower' | 'title' | 'original'

  // line (in addition to x,y)
  x2?: number
  y2?: number

  // image
  imagePrompt?: string                 // Claude-authored prompt; image is generated post-synthesis
  imageHash?: string                   // set after generation/upload to Figma
  imageUrl?: string                    // set after image service returns

  // frame
  clipsContent?: boolean
  children?: VisualElement[]
}

export interface SectionSpec {
  type: PageSection
  height: number                       // px total height of this section in the 1440-wide column
  elements: VisualElement[]
}

export interface DirectionSpec {
  title: string                        // e.g. "Suund 1: [name]"
  concept: string                      // 2-3 sentence description
  palette: string[]                    // 3-5 hex colors
  fonts: DirectionTypography
  mood: string[]
  sections: SectionSpec[]
  heroImagePrompt?: string             // optional top-level prompt used for preview/report
}

export interface SynthesisResult {
  brandPersonality: string[]
  visualDirection: string
  colorStrategy: {
    primary: string
    accent: string
    neutral: string
    background: string
    rationale: string
  }
  typographyRationale: string
  suggestedFonts: { heading: string; body: string }
  moodboardKeywords: string[]
  competitorGaps: string[]
  competitorVisualProfiles?: CompetitorVisualProfile[]
  discoveredCompetitors?: DiscoveredCompetitor[]
  styleRecommendations: StyleRecommendation[]
  directionSpecs?: DirectionSpec[]                  // Claude-authored per-brand visual DSL (primary)
  targetAudience: string
  brandVoice: string
  seoWcag?: SeoWcagResult
}

export interface ReportData {
  brief: string
  scrapedSite?: ScrapedSite
  competitors: CompetitorData[]
  synthesis: SynthesisResult
  seoWcag?: SeoWcagResult
  outputDir: string
}

export type OutputMode = 'figma-execute' | 'paper-execute' | 'figma-prompt' | 'paper-prompt'

export interface MoodboardData {
  synthesis: SynthesisResult
  scrapedSite?: ScrapedSite
  projectName: string
  sections?: PageSection[]
}

export type StepId = 'scrape' | 'research' | 'discover' | 'synthesize' | 'report' | 'moodboard'
export type StepStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped'

export interface StepUpdate {
  step: StepId
  status: StepStatus
  message?: string
}

export type AuthMode = 'api-key' | 'claude-login'
export type ResearchMode = 'ahrefs' | 'claude' | 'both'

export interface SeoWcagResult {
  seo: {
    score: number          // 0–100
    title: { value: string; issues: string[] }
    metaDescription: { value: string; issues: string[] }
    headings: { structure: string; issues: string[] }
    keywords: string[]
    opportunities: string[]
    technicalIssues: string[]
  }
  wcag: {
    level: 'A' | 'AA' | 'AAA' | 'fail'
    score: number          // 0–100
    issues: Array<{ severity: 'critical' | 'major' | 'minor'; criterion: string; description: string }>
    passes: string[]
    recommendations: string[]
  }
  summary: string
}

export interface SavedProject {
  id: string
  name: string
  url: string
  brief: string
  createdAt: string
  filePath: string
}

export interface SavedProjectData {
  id: string
  name: string
  url: string
  brief: string
  createdAt: string
  synthesis: SynthesisResult
  scrapedSite?: ScrapedSite
  competitors: CompetitorData[]
  seoWcagResult?: SeoWcagResult
}

export interface AppSettings {
  authMode: AuthMode
  researchMode: ResearchMode
  anthropicApiKey: string
  ahrefsApiKey: string
  figmaAccessToken: string
  openaiApiKey: string
  outputDir: string
}
