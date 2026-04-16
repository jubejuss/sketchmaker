import React, { useState, useRef, useEffect } from 'react'
import { usePipelineStore } from '../store/pipeline.store.js'
import type { ScrapedSite, CompetitorData, SynthesisContext, ResearchMode, CompetitorScope, SavedProject, SavedProjectData, PageSection } from '../../shared/types.js'

export default function InputView(): React.ReactElement {
  const {
    mode, brief, url,
    setMode, setBrief, setUrl,
    setStep, setScrapedSite, setCompetitors, setSynthesis, setSeoWcagResult,
    clearSynthesisStream, appendSynthesisToken,
    setActiveView, setProjectName, outputMode, setOutputMode,
    competitorScope, setCompetitorScope,
    selectedSections, toggleSection, moveSection
  } = usePipelineStore()

  const [researchMode, setResearchMode] = useState<ResearchMode>('ahrefs')
  const [recentProjects, setRecentProjects] = useState<SavedProject[]>([])

  useEffect(() => {
    window.stiilileidja?.getSettings().then((s) => {
      setResearchMode((s as { researchMode?: ResearchMode }).researchMode || 'ahrefs')
    })
    window.stiilileidja?.listProjects().then(setRecentProjects).catch(() => {})
  }, [])

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canRun = mode === 'url' ? url.trim().length > 0 : brief.trim().length > 0

  async function loadProject(id: string): Promise<void> {
    try {
      const data = await window.stiilileidja.loadProject(id)
      setProjectName(data.name)
      if (data.url) { setMode('url'); setUrl(data.url) }
      if (data.brief) setBrief(data.brief)
      if (data.scrapedSite) setScrapedSite(data.scrapedSite)
      setCompetitors(data.competitors ?? [])
      setSynthesis(data.synthesis)
      if (data.seoWcagResult) setSeoWcagResult(data.seoWcagResult)
      setActiveView('results')
    } catch (err) {
      setError(`Projekti laadimine ebaõnnestus: ${String(err)}`)
    }
  }

  async function deleteProject(id: string): Promise<void> {
    await window.stiilileidja.deleteProject(id).catch(() => {})
    setRecentProjects(prev => prev.filter(p => p.id !== id))
  }

  async function run(): Promise<void> {
    if (!canRun || running) return
    setError(null)
    setRunning(true)
    setActiveView('pipeline')

    try {
      let scrapedSite: ScrapedSite | undefined
      let competitors: CompetitorData[] = []

      // Step 1: Scrape
      if (mode === 'url') {
        setStep('scrape', { status: 'running', message: 'Kraabin veebisaiti...' })
        try {
          scrapedSite = await window.stiilileidja.scrapeWebsite(url)
          setScrapedSite(scrapedSite)
          setProjectName(scrapedSite.title || new URL(url).hostname)
          setStep('scrape', { status: 'done' })
        } catch (err) {
          setStep('scrape', { status: 'error', message: String(err) })
          throw err
        }
      } else {
        setStep('scrape', { status: 'skipped' })
        setProjectName(brief.slice(0, 40))
      }

      // Step 2: Research SEO competitors (Ahrefs)
      const domain = mode === 'url' ? url : ''
      const runAhrefs = researchMode === 'ahrefs' || researchMode === 'both'

      if (domain && runAhrefs) {
        setStep('research', { status: 'running', message: 'Otsin SEO konkurente...' })
        try {
          competitors = await window.stiilileidja.researchCompetitors(domain)
          setCompetitors(competitors)
          setStep('research', { status: 'done' })
        } catch {
          setStep('research', { status: 'error', message: 'Ahrefs ei vasta — jätkan ilma SEO andmeteta' })
          setStep('research', { status: 'skipped' })
        }
      } else {
        setStep('research', { status: 'skipped' })
      }

      // Step 3: Discover design competitors (note: done inside synthesis call)
      const scopeLabel = competitorScope === 'local' ? 'kohalikud' : competitorScope === 'regional' ? 'piirkondlikud' : 'globaalsed'
      setStep('discover', { status: 'running', message: `Otsin ${scopeLabel} kujunduskonkurente...` })

      // Step 4: Synthesize (includes design competitor discovery + SEO/WCAG in one call)
      setStep('synthesize', { status: 'running', message: 'Analüüsin brändi ja konkurente...' })
      clearSynthesisStream()

      const context: SynthesisContext = {
        brief,
        scrapedSite,
        competitors,
        competitorScope,
        sections: selectedSections
      }

      const unsubRateLimit = window.stiilileidja.onRateLimitWait(({ attempt, waitSec }) => {
        setStep('synthesize', {
          status: 'running',
          message: `Rate limit — ootan ${waitSec}s (katse ${attempt + 1}/3)...`
        })
      })
      const unsubImageProgress = window.stiilileidja.onImageProgress(({ done, total, label }) => {
        const msg = total > 0 ? `Genereerin pilte ${done}/${total}...` : (label ?? 'Genereerin pilte...')
        setStep('synthesize', { status: 'running', message: msg })
      })

      try {
        const synthesis = await window.stiilileidja.synthesize(context)
        setSynthesis(synthesis)
        if (synthesis.seoWcag) setSeoWcagResult(synthesis.seoWcag)
        setStep('discover', { status: 'done', message: `Leitud ${synthesis.discoveredCompetitors?.length ?? 0} kujunduskonkurenti` })
        setStep('synthesize', { status: 'done' })

        // Auto-save project for later re-use
        const projectId = `${Date.now()}`
        const projectData: SavedProjectData = {
          id: projectId,
          name: scrapedSite?.title || brief.slice(0, 40) || 'Projekt',
          url: mode === 'url' ? url : '',
          brief,
          createdAt: new Date().toISOString(),
          synthesis,
          scrapedSite,
          competitors,
          seoWcagResult: synthesis.seoWcag
        }
        window.stiilileidja.saveProject(projectData).then(() => {
          window.stiilileidja.listProjects().then(setRecentProjects).catch(() => {})
        }).catch(() => {})
      } catch (err) {
        setStep('discover', { status: 'error' })
        setStep('synthesize', { status: 'error', message: String(err) })
        throw err
      } finally {
        unsubRateLimit()
        unsubImageProgress()
      }

      // Done — navigate to results
      setActiveView('results')
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '60px 80px',
        gap: 48,
        boxSizing: 'border-box'
      }}
    >
      {/* Header */}
      <div className="anim-fade-up" style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          marginBottom: 12
        }}>
          Stiilileidja v0.1
        </div>
        <h1 style={{
          fontFamily: 'var(--serif)',
          fontSize: 52,
          fontWeight: 400,
          color: 'var(--text-primary)',
          lineHeight: 1.05,
          margin: 0
        }}>
          Loo moodboard
        </h1>
        <p style={{
          fontFamily: 'var(--sans)',
          fontSize: 15,
          color: 'var(--text-secondary)',
          marginTop: 12,
          fontWeight: 300,
          lineHeight: 1.6
        }}>
          Sisesta lähteülesanne või kliendi veebisait — süsteem analüüsib,<br />
          uurib konkurente ja loob stiililehe Figmas või Pencilis.
        </p>
      </div>

      {/* Mode toggle */}
      <div
        className="anim-fade-up"
        style={{
          animationDelay: '0.05s',
          display: 'flex',
          gap: 0,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: 3
        }}
      >
        {(['url', 'brief'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '7px 20px',
              border: 'none',
              borderRadius: 7,
              background: mode === m ? 'var(--bg-hover)' : 'transparent',
              color: mode === m ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--display)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              outline: 'none'
            }}
          >
            {m === 'url' ? 'Veebisait' : 'Lähteülesanne'}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div
        className="anim-fade-up"
        style={{
          animationDelay: '0.1s',
          width: '100%',
          maxWidth: 640
        }}
      >
        {mode === 'url' ? (
          <UrlInput value={url} onChange={setUrl} onSubmit={run} disabled={running} />
        ) : (
          <BriefInput value={brief} onChange={setBrief} ref={textareaRef} />
        )}
      </div>

      {/* Brief (always show when URL mode) */}
      {mode === 'url' && (
        <div
          className="anim-fade-up"
          style={{ animationDelay: '0.15s', width: '100%', maxWidth: 640 }}
        >
          <label style={{
            display: 'block',
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 8
          }}>
            Lähteülesanne (vabatahtlik)
          </label>
          <BriefInput value={brief} onChange={setBrief} compact ref={textareaRef} />
        </div>
      )}

      {/* Competitor scope selector */}
      <div
        className="anim-fade-up"
        style={{ animationDelay: '0.18s', width: '100%', maxWidth: 640 }}
      >
        <CompetitorScopeSelector value={competitorScope} onChange={setCompetitorScope} />
      </div>

      {/* Output mode selector */}
      <div
        className="anim-fade-up"
        style={{ animationDelay: '0.2s', width: '100%', maxWidth: 640 }}
      >
        <OutputModeSelector value={outputMode} onChange={setOutputMode} />
      </div>

      {/* Sections selector */}
      <div
        className="anim-fade-up"
        style={{ animationDelay: '0.21s', width: '100%', maxWidth: 640 }}
      >
        <SectionsSelector value={selectedSections} onToggle={toggleSection} onMove={moveSection} />
      </div>

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <div
          className="anim-fade-up"
          style={{ animationDelay: '0.22s', width: '100%', maxWidth: 640 }}
        >
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.15em',
            textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8
          }}>
            Varasemad projektid
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentProjects.slice(0, 5).map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600,
                    color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {p.name}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                    {p.url || p.brief?.slice(0, 40) || '—'} · {new Date(p.createdAt).toLocaleDateString('et-EE')}
                  </div>
                </div>
                <button
                  onClick={() => loadProject(p.id)}
                  style={{
                    padding: '4px 12px', background: 'var(--accent-dim)',
                    border: '1px solid rgba(200,169,110,0.3)', borderRadius: 5,
                    fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)',
                    cursor: 'pointer', outline: 'none', flexShrink: 0
                  }}
                >
                  Ava
                </button>
                <button
                  onClick={() => deleteProject(p.id)}
                  style={{
                    padding: '4px 8px', background: 'transparent',
                    border: '1px solid var(--border)', borderRadius: 5,
                    fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
                    cursor: 'pointer', outline: 'none', flexShrink: 0
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Run button */}
      <div className="anim-fade-up" style={{ animationDelay: '0.25s' }}>
        {error && (
          <div style={{
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: 'var(--error)',
            marginBottom: 16,
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}
        <RunButton disabled={!canRun || running} loading={running} onClick={run} />
      </div>
    </div>
    </div>
  )
}

function UrlInput({
  value,
  onChange,
  onSubmit,
  disabled
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
}): React.ReactElement {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute',
        left: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--text-muted)',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center'
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="7" cy="7" r="5.5" />
          <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" />
        </svg>
      </div>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder="https://klient.ee"
        disabled={disabled}
        style={{
          width: '100%',
          padding: '14px 16px 14px 40px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          color: 'var(--text-primary)',
          fontFamily: 'var(--mono)',
          fontSize: 14,
          outline: 'none',
          transition: 'border-color 0.15s ease',
          WebkitUserSelect: 'text' as never
        }}
        onFocus={(e) => (e.target.style.borderColor = 'var(--border-active)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
      />
    </div>
  )
}

function BriefInput({ value, onChange, compact, ref }: {
  value: string
  onChange: (v: string) => void
  compact?: boolean
  ref?: React.Ref<HTMLTextAreaElement>
}): React.ReactElement {
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={compact
        ? 'Kirjelda projekti eesmärki, sihtrühma, soovitud tunnet...'
        : 'Kirjelda projekti: mis on kliendi tegevusala, kes on sihtgrupp, millist tunnet soovid edasi anda, milliseid märksõnu tuleks arvestada...'
      }
      rows={compact ? 3 : 7}
      style={{
        width: '100%',
        padding: '14px 16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        color: 'var(--text-primary)',
        fontFamily: 'var(--sans)',
        fontSize: 14,
        lineHeight: 1.6,
        outline: 'none',
        resize: 'vertical',
        transition: 'border-color 0.15s ease',
        WebkitUserSelect: 'text' as never
      }}
      onFocus={(e) => (e.target.style.borderColor = 'var(--border-active)')}
      onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
    />
  )
}

function CompetitorScopeSelector({
  value,
  onChange
}: {
  value: CompetitorScope
  onChange: (v: CompetitorScope) => void
}): React.ReactElement {
  const options: { id: CompetitorScope; label: string; sub: string }[] = [
    { id: 'local', label: 'Kohalik', sub: 'Sama riik' },
    { id: 'regional', label: 'Piirkondlik', sub: 'Euroopa / regioon' },
    { id: 'global', label: 'Globaalne', sub: 'Maailma parimad' }
  ]

  return (
    <div>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: 10
      }}>
        Kujunduskonkurentide ulatus
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: value === opt.id ? 'var(--accent-dim)' : 'var(--bg-card)',
              border: `1px solid ${value === opt.id ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              color: value === opt.id ? 'var(--accent)' : 'var(--text-secondary)',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              outline: 'none'
            }}
          >
            <div style={{ fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
              {opt.label}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
              {opt.sub}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function OutputModeSelector({
  value,
  onChange
}: {
  value: string
  onChange: (v: ReturnType<typeof value extends string ? () => never : never>) => void
}): React.ReactElement {
  const options = [
    { id: 'paper-execute', label: 'Pencil', sub: 'Käivita otse', icon: '✦' },
    { id: 'figma-execute', label: 'Figma', sub: 'Käivita otse', icon: '◈' },
    { id: 'paper-prompt', label: 'Pencil prompt', sub: 'Kopeeri käsitsi', icon: '✧' },
    { id: 'figma-prompt', label: 'Figma prompt', sub: 'Kopeeri käsitsi', icon: '◇' }
  ]

  return (
    <div>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: 10
      }}>
        Väljund
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => (onChange as (v: string) => void)(opt.id)}
            style={{
              padding: '12px 14px',
              background: value === opt.id ? 'var(--accent-dim)' : 'var(--bg-card)',
              border: `1px solid ${value === opt.id ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              color: value === opt.id ? 'var(--accent)' : 'var(--text-secondary)',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              outline: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 14 }}>{opt.icon}</span>
              <span style={{ fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600 }}>
                {opt.label}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
              {opt.sub}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

const SECTION_OPTIONS: { id: PageSection; label: string; sub: string }[] = [
  { id: 'header',       label: 'Päis',              sub: 'Logo + menüü' },
  { id: 'hero',         label: 'Hero CTA-ga',       sub: 'Suur pealkiri + nupp' },
  { id: 'events',       label: 'Üritused',          sub: 'Kalender / tulemas' },
  { id: 'news',         label: 'Uudised',           sub: 'Blogi / artiklid' },
  { id: 'team',         label: 'Meeskond',          sub: 'Inimesed / soovitajad' },
  { id: 'services',     label: 'Teenused',          sub: 'Featured / kaardid' },
  { id: 'gallery',      label: 'Galerii',           sub: 'Pildid / portfoolio' },
  { id: 'testimonials', label: 'Iseloomustused',    sub: 'Tsitaadid / arvustused' },
  { id: 'cta',          label: 'CTA-bänner',        sub: 'Suur tegevuskutse' },
  { id: 'contact',      label: 'Kontakt',           sub: 'Vorm / info' },
  { id: 'footer',       label: 'Jalus',             sub: 'Lingid + © tekst' }
]

function SectionsSelector({
  value,
  onToggle,
  onMove
}: {
  value: PageSection[]
  onToggle: (id: PageSection) => void
  onMove: (id: PageSection, delta: -1 | 1) => void
}): React.ReactElement {
  const selectedSet = new Set(value)
  const available = SECTION_OPTIONS.filter((o) => !selectedSet.has(o.id))
  const optionById = Object.fromEntries(SECTION_OPTIONS.map((o) => [o.id, o])) as Record<PageSection, typeof SECTION_OPTIONS[number]>

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 10
      }}>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)'
        }}>
          Lehesektsioonid sketšidesse (järjekorras)
        </div>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--text-muted)'
        }}>
          {value.length} valitud
        </div>
      </div>

      {/* Ordered selected list */}
      {value.length > 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          marginBottom: 12
        }}>
          {value.map((id, i) => {
            const opt = optionById[id]
            const isFirst = i === 0
            const isLast = i === value.length - 1
            return (
              <div
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: 'var(--accent-dim)',
                  border: '1px solid var(--accent)',
                  borderRadius: 8
                }}
              >
                <div style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  color: 'var(--accent)',
                  width: 18,
                  flexShrink: 0
                }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: 'var(--display)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--accent)'
                  }}>
                    {opt.label}
                  </div>
                  <div style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--text-muted)'
                  }}>
                    {opt.sub}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <IconBtn disabled={isFirst} onClick={() => onMove(id, -1)} title="Liiguta üles">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M5 8V2M2 5l3-3 3 3" />
                    </svg>
                  </IconBtn>
                  <IconBtn disabled={isLast} onClick={() => onMove(id, 1)} title="Liiguta alla">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M5 2v6M2 5l3 3 3-3" />
                    </svg>
                  </IconBtn>
                  <IconBtn onClick={() => onToggle(id)} title="Eemalda">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  </IconBtn>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{
          padding: '14px 12px',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
          textAlign: 'center',
          marginBottom: 12
        }}>
          Vali allpool vähemalt üks sektsioon
        </div>
      )}

      {/* Available chips */}
      {available.length > 0 && (
        <>
          <div style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 8
          }}>
            Lisa veel
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {available.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onToggle(opt.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 100,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--display)',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  outline: 'none'
                }}
              >
                <span style={{ color: 'var(--accent)', fontSize: 13, lineHeight: 1 }}>+</span>
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function IconBtn({
  children,
  onClick,
  disabled,
  title
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid var(--border-active)',
        borderRadius: 5,
        color: disabled ? 'var(--text-muted)' : 'var(--accent)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        outline: 'none',
        opacity: disabled ? 0.35 : 1,
        padding: 0
      }}
    >
      {children}
    </button>
  )
}

function RunButton({
  disabled,
  loading,
  onClick
}: {
  disabled: boolean
  loading: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '14px 40px',
        background: disabled ? 'var(--bg-card)' : 'var(--accent)',
        border: 'none',
        borderRadius: 10,
        color: disabled ? 'var(--text-muted)' : '#0a0a0a',
        fontFamily: 'var(--display)',
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.08em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        outline: 'none'
      }}
    >
      {loading ? (
        <>
          <Spinner />
          Töötlen...
        </>
      ) : (
        <>
          Analüüsi
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 7h10M8 3l4 4-4 4" />
          </svg>
        </>
      )}
    </button>
  )
}

function Spinner(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <path d="M7 1a6 6 0 1 1-4.24 1.76" />
    </svg>
  )
}
