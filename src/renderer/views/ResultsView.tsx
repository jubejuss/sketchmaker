import React, { useState } from 'react'
import { usePipelineStore } from '../store/pipeline.store.js'
import type { OutputMode, SeoWcagResult, DirectionSpec } from '../../shared/types.js'

export default function ResultsView(): React.ReactElement {
  const {
    synthesis, scrapedSite, competitors, brief, projectName,
    seoWcagResult,
    outputMode, setOutputMode,
    selectedSections,
    setStep, setReportPaths, setMoodboardResult, setActiveView
  } = usePipelineStore()

  const [reportLoading, setReportLoading] = useState(false)
  const [moodboardLoading, setMoodboardLoading] = useState(false)
  const [moodboardMsg, setMoodboardMsg] = useState<string | null>(null)
  const [reportDone, setReportDone] = useState(false)

  if (!synthesis) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Tulemused puuduvad.</div>

  async function generateReport(): Promise<void> {
    if (!synthesis) return
    setReportLoading(true)
    setStep('report', { status: 'running' })
    try {
      const result = await window.stiilileidja.generateReport({
        brief,
        scrapedSite: scrapedSite ?? undefined,
        competitors,
        synthesis,
        seoWcag: seoWcagResult ?? undefined,
        outputDir: ''
      })
      setReportPaths(result)
      setStep('report', { status: 'done' })
      setReportDone(true)
    } catch (err) {
      setStep('report', { status: 'error', message: String(err) })
    } finally {
      setReportLoading(false)
    }
  }

  async function generateMoodboard(): Promise<void> {
    if (!synthesis) return
    setMoodboardLoading(true)
    setMoodboardMsg(null)
    setStep('moodboard', { status: 'running' })

    const unsubProgress = window.stiilileidja.onMoodboardProgress((msg) => {
      setMoodboardMsg(msg)
    })

    try {
      const result = await window.stiilileidja.generateMoodboard(
        {
          synthesis,
          scrapedSite: scrapedSite ?? undefined,
          projectName,
          sections: selectedSections.length > 0 ? selectedSections : undefined
        },
        outputMode
      )
      setMoodboardResult(result)
      setStep('moodboard', { status: 'done' })

      if (result && typeof result === 'object') {
        const r = result as { success?: boolean; message?: string; fallback?: string }
        if (r.success === false) {
          setMoodboardMsg(r.message ?? 'Viga moodboardi loomisel')
        } else if (r.message) {
          setMoodboardMsg(r.message)
        } else {
          setMoodboardMsg(null)
        }
      }
    } catch (err) {
      setStep('moodboard', { status: 'error', message: String(err) })
      setMoodboardMsg(String(err))
    } finally {
      unsubProgress()
      setMoodboardLoading(false)
    }
  }

  return (
    <div style={{
      height: '100%',
      overflow: 'auto',
      padding: '48px 64px 64px'
    }}>
      {/* Header */}
      <div className="anim-fade-up" style={{ marginBottom: 40 }}>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          marginBottom: 8
        }}>
          Analüüsi tulemused
        </div>
        <h2 style={{
          fontFamily: 'var(--serif)',
          fontSize: 36,
          fontWeight: 400,
          color: 'var(--text-primary)',
          margin: 0
        }}>
          {projectName || 'Projekt'}
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

        {/* Color strategy */}
        <Section label="Värvistrateegia" index={1}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { role: 'Põhivärv', hex: synthesis.colorStrategy.primary },
              { role: 'Aktsent', hex: synthesis.colorStrategy.accent },
              { role: 'Neutraalne', hex: synthesis.colorStrategy.neutral },
              { role: 'Taust', hex: synthesis.colorStrategy.background }
            ].map((s) => (
              <ColorCard key={s.role} hex={s.hex} role={s.role} />
            ))}
          </div>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
            {synthesis.colorStrategy.rationale}
          </p>
        </Section>

        {/* Typography */}
        <Section label="Tüpograafia" index={2}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <FontCard label="Pealkirjafont" name={synthesis.suggestedFonts.heading} />
            <FontCard label="Tekstifont" name={synthesis.suggestedFonts.body} />
          </div>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
            {synthesis.typographyRationale}
          </p>
        </Section>

        {/* Moodboard keywords */}
        <Section label="Moodboard märksõnad" index={3}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {synthesis.moodboardKeywords.map((kw, i) => (
              <span
                key={kw}
                className="anim-slide-in"
                style={{
                  animationDelay: `${i * 0.04}s`,
                  padding: '6px 14px',
                  border: '1px solid var(--border-active)',
                  borderRadius: 100,
                  fontFamily: 'var(--display)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)'
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </Section>

        {/* Brand personality + visual direction */}
        <Section label="Brändi suund" index={4}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {synthesis.brandPersonality.map((p) => (
              <span key={p} style={{
                padding: '5px 12px',
                background: 'var(--accent-dim)',
                border: '1px solid rgba(200,169,110,0.3)',
                borderRadius: 6,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--accent)'
              }}>
                {p}
              </span>
            ))}
          </div>
          <p style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.8, margin: 0 }}>
            {synthesis.visualDirection}
          </p>
        </Section>

        {/* Screenshots */}
        {scrapedSite && (
          <Section label="Veebisaidi ekraanipildid" index={5}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <ScreenshotCard
                src={scrapedSite.screenshots.aboveFold}
                label="Esimene vaade"
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scrapedSite.colors.slice(0, 6).map((c) => (
                  <div key={c.hex} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: c.hex,
                      flexShrink: 0,
                      border: '1px solid var(--border)'
                    }} />
                    <div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-primary)' }}>{c.hex}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>{c.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* Competitors */}
        {competitors.length > 0 && (
          <Section label="Konkurendid" index={6}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {competitors.map((c, i) => (
                <div
                  key={c.domain}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 120px 80px',
                    gap: 16,
                    padding: '12px 16px',
                    borderBottom: i < competitors.length - 1 ? '1px solid var(--border)' : 'none',
                    background: c.isLocal ? 'var(--accent-dim)' : 'transparent',
                    alignItems: 'center'
                  }}
                >
                  <div style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: c.isLocal ? 'var(--accent)' : 'var(--text-primary)'
                  }}>
                    {c.domain}
                    {c.isLocal && (
                      <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--accent)', opacity: 0.7 }}>klient</span>
                    )}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                    DR {c.domainRating ?? '—'}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                    {c.organicTraffic != null ? `${c.organicTraffic.toLocaleString()}/kuu` : '—'}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Discovered design competitors */}
        {synthesis.discoveredCompetitors && synthesis.discoveredCompetitors.length > 0 && (
          <Section label="Kujunduskonkurendid" index={7}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {synthesis.discoveredCompetitors.map((dc) => (
                <div
                  key={dc.domain}
                  style={{
                    padding: '14px 16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {dc.name}
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>
                        {dc.domain} · {dc.country}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(dc.keyColors ?? []).map((hex) => (
                        <div
                          key={hex}
                          title={hex}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            background: hex,
                            border: '1px solid var(--border)',
                            flexShrink: 0
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <p style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 6px' }}>
                    {dc.visualStyle}
                  </p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                      Tüpograafia: {dc.typography}
                    </span>
                  </div>
                  <div style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    background: 'var(--accent-dim)',
                    borderRadius: 5,
                    fontFamily: 'var(--sans)',
                    fontSize: 11,
                    color: 'var(--accent)',
                    lineHeight: 1.5
                  }}>
                    {dc.reason}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Direction specs (full DSL from Claude) */}
        {synthesis.directionSpecs && synthesis.directionSpecs.length > 0 && (
          <Section label="Suunad" index={8}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {synthesis.directionSpecs.map((spec, i) => (
                <DirectionSpecCard key={i} spec={spec} />
              ))}
            </div>
          </Section>
        )}

        {/* SEO/WCAG results */}
        {seoWcagResult && (
          <SeoWcagSection result={seoWcagResult} index={9} />
        )}

        {/* Actions */}
        <div style={{
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          {/* Moodboard error/status — shown above buttons so it's always visible */}
          {moodboardMsg && !moodboardLoading && (
            <div style={{
              padding: '14px 16px',
              background: moodboardMsg.includes('OK') ? 'rgba(90,158,122,0.08)' : 'rgba(192,80,74,0.08)',
              border: `1px solid ${moodboardMsg.includes('OK') ? 'rgba(90,158,122,0.35)' : 'rgba(192,80,74,0.3)'}`,
              borderRadius: 8,
              fontFamily: 'var(--sans)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap'
            }}>
              {moodboardMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Output mode */}
            <div style={{
              display: 'flex',
              gap: 4,
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 3,
              marginRight: 8
            }}>
              {(['paper-execute', 'figma-execute', 'paper-prompt', 'figma-prompt'] as OutputMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setOutputMode(m)}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderRadius: 5,
                    background: outputMode === m ? 'var(--bg-hover)' : 'transparent',
                    color: outputMode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    cursor: 'pointer',
                    outline: 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {m.replace('-', ' ')}
                </button>
              ))}
            </div>

            <ActionButton
              label={reportDone ? 'Raport loodud' : 'Genereeri raport'}
              loading={reportLoading}
              done={reportDone}
              onClick={generateReport}
              icon="📄"
            />

            <ActionButton
              label={moodboardLoading ? (moodboardMsg ?? 'Loon moodboard...') : 'Loo moodboard'}
              loading={moodboardLoading}
              onClick={generateMoodboard}
              icon="✦"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function DirectionSpecCard({ spec }: { spec: DirectionSpec }): React.ReactElement {
  const elementCount = spec.sections.reduce((a, s) => a + (s.elements?.length ?? 0), 0)
  const imageCount = spec.sections.reduce(
    (a, s) => a + (s.elements?.filter((e) => e.kind === 'image').length ?? 0),
    0
  )

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden'
    }}>
      {/* Color palette strip */}
      <div style={{ display: 'flex', height: 6 }}>
        {(spec.palette ?? []).map((hex, i) => (
          <div key={i} style={{ flex: 1, background: hex }} />
        ))}
      </div>

      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              {spec.title}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(spec.mood ?? []).map((m) => (
                <span key={m} style={{
                  padding: '2px 8px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  fontFamily: 'var(--mono)', fontSize: 10,
                  color: 'var(--text-muted)'
                }}>{m}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            {(spec.palette ?? []).map((hex) => (
              <div key={hex} title={hex} style={{
                width: 22, height: 22, borderRadius: 5,
                background: hex, border: '1px solid var(--border)', flexShrink: 0
              }} />
            ))}
          </div>
        </div>

        <p style={{
          fontFamily: 'var(--sans)', fontSize: 13,
          color: 'var(--text-secondary)', lineHeight: 1.65,
          margin: '0 0 10px'
        }}>
          {spec.concept}
        </p>

        <div style={{ marginBottom: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            Fondid: {spec.fonts.heading}{spec.fonts.headingWeight ? ` ${spec.fonts.headingWeight}` : ''} + {spec.fonts.body}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
            {spec.sections.length} sektsiooni · {elementCount} elementi · {imageCount} pilti
          </span>
        </div>

        {spec.heroImagePrompt && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '10px 12px'
          }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--text-muted)', marginBottom: 6
            }}>
              Hero image prompt
            </div>
            <p style={{
              fontFamily: 'var(--mono)', fontSize: 11,
              color: 'var(--text-secondary)', lineHeight: 1.7,
              margin: 0, userSelect: 'text' as never
            }}>
              {spec.heroImagePrompt}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({
  label, index, children
}: {
  label: string
  index: number
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div
      className="anim-fade-up"
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: 12
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function ColorCard({ hex, role }: { hex: string; role: string }): React.ReactElement {
  const [copied, setCopied] = useState(false)

  function copy(): void {
    navigator.clipboard.writeText(hex)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      onClick={copy}
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1px solid var(--border)'
      }}
    >
      <div style={{ height: 64, background: hex }} />
      <div style={{ padding: '8px 10px', background: 'var(--bg-card)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-primary)' }}>
          {copied ? 'Kopeeritud!' : hex}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>{role}</div>
      </div>
    </div>
  )
}

function FontCard({ label, name }: { label: string; name: string }): React.ReactElement {
  return (
    <div style={{
      padding: '16px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8
    }}>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: 8
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: `'${name}', serif`,
        fontSize: 28,
        color: 'var(--text-primary)',
        lineHeight: 1.2
      }}>
        Aa
      </div>
      <div style={{
        fontFamily: 'var(--mono)',
        fontSize: 11,
        color: 'var(--text-secondary)',
        marginTop: 6
      }}>
        {name}
      </div>
    </div>
  )
}

function ScreenshotCard({ src, label }: { src: string; label: string }): React.ReactElement {
  return (
    <div style={{
      borderRadius: 8,
      overflow: 'hidden',
      border: '1px solid var(--border)',
      background: 'var(--bg-card)'
    }}>
      <img
        src={`data:image/png;base64,${src}`}
        alt={label}
        style={{ width: '100%', display: 'block' }}
      />
      <div style={{
        padding: '8px 12px',
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'var(--text-muted)'
      }}>
        {label}
      </div>
    </div>
  )
}

function SeoWcagSection({ result, index }: { result: SeoWcagResult; index: number }): React.ReactElement {
  const scoreColor = (score: number): string => score >= 80 ? '#4ade80' : score >= 50 ? 'var(--accent)' : '#f87171'

  return (
    <Section label="SEO & WCAG analüüs" index={index}>
      {/* Scores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>SEO skoor</div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 40, color: scoreColor(result.seo.score), lineHeight: 1 }}>{result.seo.score}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>/ 100</div>
        </div>
        <div style={{ padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>WCAG skoor</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 40, color: scoreColor(result.wcag.score), lineHeight: 1 }}>{result.wcag.score}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>/ 100 · {result.wcag.level}</div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <p style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
        {result.summary}
      </p>

      {/* SEO issues */}
      {result.seo.technicalIssues.length > 0 && (
        <IssueList label="SEO probleemid" items={result.seo.technicalIssues} color="var(--error)" />
      )}
      {result.seo.opportunities.length > 0 && (
        <IssueList label="SEO võimalused" items={result.seo.opportunities} color="var(--accent)" />
      )}

      {/* WCAG issues */}
      {result.wcag.issues.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>WCAG probleemid</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {result.wcag.issues.map((issue, i) => (
              <div key={i} style={{
                padding: '10px 14px',
                background: 'var(--bg-card)',
                border: `1px solid ${issue.severity === 'critical' ? 'rgba(248,113,113,0.3)' : issue.severity === 'major' ? 'rgba(200,169,110,0.3)' : 'var(--border)'}`,
                borderRadius: 6
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 9, padding: '2px 6px', borderRadius: 4,
                    background: issue.severity === 'critical' ? 'rgba(248,113,113,0.15)' : issue.severity === 'major' ? 'var(--accent-dim)' : 'var(--bg-hover)',
                    color: issue.severity === 'critical' ? '#f87171' : issue.severity === 'major' ? 'var(--accent)' : 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.1em'
                  }}>{issue.severity}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>{issue.criterion}</span>
                </div>
                <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{issue.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keywords */}
      {result.seo.keywords.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Märksõnad</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {result.seo.keywords.map((kw) => (
              <span key={kw} style={{
                padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 100,
                fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-secondary)'
              }}>{kw}</span>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

function IssueList({ label, items, color }: { label: string; items: string[]; color: string }): React.ReactElement {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ marginTop: 5, flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: color }} />
            <span style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ActionButton({
  label, loading, done, onClick, icon
}: {
  label: string
  loading: boolean
  done?: boolean
  onClick: () => void
  icon: string
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={loading || done}
      style={{
        padding: '10px 20px',
        background: done ? 'var(--bg-card)' : 'var(--accent)',
        border: 'none',
        borderRadius: 8,
        color: done ? 'var(--text-muted)' : '#0a0a0a',
        fontFamily: 'var(--display)',
        fontSize: 13,
        fontWeight: 700,
        cursor: loading || done ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        outline: 'none',
        transition: 'all 0.15s ease',
        opacity: done ? 0.5 : 1
      }}
    >
      <span>{icon}</span>
      {label}
    </button>
  )
}
