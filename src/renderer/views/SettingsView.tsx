import React, { useState, useEffect } from 'react'
import type { ImageSource, OutputLanguage, ResearchMode } from '../../shared/types.js'

interface Settings {
  researchMode: ResearchMode
  imageSource: ImageSource
  outputLanguage: OutputLanguage
  anthropicApiKey: string
  ahrefsApiKey: string
  figmaAccessToken: string
  openaiApiKey: string
  pexelsApiKey: string
  outputDir: string
}

export default function SettingsView(): React.ReactElement {
  const [settings, setSettings] = useState<Settings>({
    researchMode: 'ahrefs',
    imageSource: 'pexels',
    outputLanguage: 'et',
    anthropicApiKey: '',
    ahrefsApiKey: '',
    figmaAccessToken: '',
    openaiApiKey: '',
    pexelsApiKey: '',
    outputDir: ''
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mcpStatus, setMcpStatus] = useState<{
    figma?: boolean; pencil?: boolean;
    figmaError?: string; pencilError?: string;
    figmaPort?: number | null; figmaClients?: number; figmaDaemonRunning?: boolean
  } | null>(null)
  const [mcpTesting, setMcpTesting] = useState(false)
  const [probeRunning, setProbeRunning] = useState(false)
  const [probeResult, setProbeResult] = useState<{ ok: boolean; result?: unknown; error?: string } | null>(null)

  useEffect(() => {
    if (!window.stiilileidja) { setLoading(false); return }
    window.stiilileidja.getSettings().then((s) => {
      const raw = s as unknown as Partial<Settings>
      setSettings({
        researchMode: raw.researchMode || 'ahrefs',
        imageSource: raw.imageSource || 'pexels',
        outputLanguage: raw.outputLanguage || 'et',
        anthropicApiKey: s.anthropicApiKey || '',
        ahrefsApiKey: s.ahrefsApiKey || '',
        figmaAccessToken: s.figmaAccessToken || '',
        openaiApiKey: raw.openaiApiKey || '',
        pexelsApiKey: raw.pexelsApiKey || '',
        outputDir: s.outputDir || ''
      })
      setLoading(false)
    })
  }, [])

  async function testMcp(): Promise<void> {
    if (!window.stiilileidja) return
    setMcpTesting(true)
    setMcpStatus(null)
    try {
      const result = await window.stiilileidja.checkMcpStatus()
      setMcpStatus(result)
    } finally {
      setMcpTesting(false)
    }
  }

  async function runImageProbe(): Promise<void> {
    if (!window.stiilileidja) return
    setProbeRunning(true)
    setProbeResult(null)
    try {
      const result = await window.stiilileidja.probeFigmaImages()
      setProbeResult(result)
    } catch (err) {
      setProbeResult({ ok: false, error: (err as Error).message })
    } finally {
      setProbeRunning(false)
    }
  }

  async function save(): Promise<void> {
    if (!window.stiilileidja) return
    await window.stiilileidja.saveSettings(settings as unknown as Record<string, string>)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) {
    return <div style={{ padding: 48, color: 'var(--text-muted)', fontFamily: 'var(--mono)', fontSize: 12 }}>Laadin...</div>
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '48px 64px' }}>
      <div className="anim-fade-up" style={{ marginBottom: 40 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8
        }}>
          Konfiguratsioon
        </div>
        <h2 style={{
          fontFamily: 'var(--serif)', fontSize: 36, fontWeight: 400,
          color: 'var(--text-primary)', margin: 0
        }}>
          Seaded
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 560 }}>

        {/* Anthropic API key */}
        <div>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', marginBottom: 4
          }}>
            Anthropic API võti
          </div>
          <div style={{
            fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.6
          }}>
            Brändisüntees ja SEO/WCAG analüüs kasutavad Anthropic Messages API-t.
            See nõuab eraldi API võtit — Claude.ai tellimus (Pro/Max) ei kehti siin.
          </div>
          <button
            onClick={() => window.stiilileidja?.openExternal('https://platform.claude.com/dashboard')}
            style={{
              marginBottom: 12,
              padding: '4px 10px',
              background: 'transparent',
              border: '1px solid var(--border-active)',
              borderRadius: 5,
              fontFamily: 'var(--mono)', fontSize: 10,
              color: 'var(--accent)',
              cursor: 'pointer', outline: 'none'
            }}
          >
            Hangi API võti platform.claude.com ↗
          </button>
          <SettingField
            label=""
            description=""
            value={settings.anthropicApiKey}
            onChange={(v) => setSettings(s => ({ ...s, anthropicApiKey: v }))}
            type="password"
            placeholder="sk-ant-api03-..."
          />
          {settings.anthropicApiKey && !settings.anthropicApiKey.startsWith('sk-ant-api') && (
            <div style={{
              marginTop: 8, padding: '10px 14px',
              background: 'rgba(192,80,74,0.08)', border: '1px solid rgba(192,80,74,0.3)',
              borderRadius: 6, fontFamily: 'var(--sans)', fontSize: 12,
              color: 'var(--error)', lineHeight: 1.5
            }}>
              See token ei ole API võti. OAuth tokenid (sk-ant-oat...) on Anthropic poolt kolmandate osapoolte rakendustes blokeeritud alates 2026. Vaja on sk-ant-api... formaadis võtit.
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', marginBottom: 4
          }}>
            SEO &amp; WCAG analüüs
          </div>
          <div style={{
            fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12
          }}>
            Vali, milliseid andmeid kasutatakse konkurentide ja ligipääsetavuse analüüsiks
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {([
              { id: 'ahrefs', label: 'Ahrefs', sub: 'REST API andmed' },
              { id: 'claude', label: 'Claude', sub: 'AI analüüs (SEO + WCAG)' },
              { id: 'both', label: 'Mõlemad', sub: 'Ahrefs + Claude' }
            ] as { id: ResearchMode; label: string; sub: string }[]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSettings(s => ({ ...s, researchMode: opt.id }))}
                style={{
                  padding: '12px 10px',
                  background: settings.researchMode === opt.id ? 'var(--accent-dim)' : 'var(--bg-card)',
                  border: `1px solid ${settings.researchMode === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8,
                  textAlign: 'left',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600,
                  color: settings.researchMode === opt.id ? 'var(--accent)' : 'var(--text-primary)',
                  marginBottom: 3
                }}>
                  {opt.label}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                  {opt.sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        <SettingField
          label="Ahrefs API võti"
          description="app.ahrefs.com → API → Genereeri võti (erineb MCP ühendusest)"
          value={settings.ahrefsApiKey}
          onChange={(v) => setSettings(s => ({ ...s, ahrefsApiKey: v }))}
          type="password"
          placeholder="ahrefs_..."
        />

        <SettingField
          label="Figma Access Token"
          description="figma.com → Settings → Security → Personal access tokens"
          value={settings.figmaAccessToken}
          onChange={(v) => setSettings(s => ({ ...s, figmaAccessToken: v }))}
          type="password"
          placeholder="figd_..."
        />

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', marginBottom: 4
          }}>
            Piltide allikas
          </div>
          <div style={{
            fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12
          }}>
            Pexels on tasuta ja kiire (päris fotod, https URL-id). OpenAI genereerib AI pildid — täpsem, kuid aeglasem ja tasuline.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              { id: 'pexels', label: 'Pexels', sub: 'Stock fotod · tasuta' },
              { id: 'openai', label: 'OpenAI', sub: 'AI genereeritud · $' }
            ] as { id: ImageSource; label: string; sub: string }[]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSettings(s => ({ ...s, imageSource: opt.id }))}
                style={{
                  padding: '12px 10px',
                  background: settings.imageSource === opt.id ? 'var(--accent-dim)' : 'var(--bg-card)',
                  border: `1px solid ${settings.imageSource === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8,
                  textAlign: 'left',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600,
                  color: settings.imageSource === opt.id ? 'var(--accent)' : 'var(--text-primary)',
                  marginBottom: 3
                }}>
                  {opt.label}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                  {opt.sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', marginBottom: 4
          }}>
            Väljundi keel
          </div>
          <div style={{
            fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12
          }}>
            Mõjutab raporti PDF-i, moodboardi silte ja Claude&apos;i genereeritud teksti. UI jääb alati eesti keelde.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {([
              { id: 'et', label: 'Eesti', sub: 'Vaikimisi' },
              { id: 'en', label: 'English', sub: 'Export · klient välismaal' }
            ] as { id: OutputLanguage; label: string; sub: string }[]).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSettings(s => ({ ...s, outputLanguage: opt.id }))}
                style={{
                  padding: '12px 10px',
                  background: settings.outputLanguage === opt.id ? 'var(--accent-dim)' : 'var(--bg-card)',
                  border: `1px solid ${settings.outputLanguage === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8,
                  textAlign: 'left',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600,
                  color: settings.outputLanguage === opt.id ? 'var(--accent)' : 'var(--text-primary)',
                  marginBottom: 3
                }}>
                  {opt.label}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                  {opt.sub}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', marginBottom: 4
          }}>
            Pexels API võti
          </div>
          <div style={{
            fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.6
          }}>
            Tasuta 200 päringut tunnis. Vaja ainult siis, kui piltide allikaks on valitud Pexels.
          </div>
          <button
            onClick={() => window.stiilileidja?.openExternal('https://www.pexels.com/api/new/')}
            style={{
              marginBottom: 12,
              padding: '4px 10px',
              background: 'transparent',
              border: '1px solid var(--border-active)',
              borderRadius: 5,
              fontFamily: 'var(--mono)', fontSize: 10,
              color: 'var(--accent)',
              cursor: 'pointer', outline: 'none'
            }}
          >
            Hangi API võti pexels.com ↗
          </button>
          <SettingField
            label=""
            description=""
            value={settings.pexelsApiKey}
            onChange={(v) => setSettings(s => ({ ...s, pexelsApiKey: v }))}
            type="password"
            placeholder="563492ad..."
          />
        </div>

        <SettingField
          label="OpenAI API võti (piltide genereerimiseks)"
          description="platform.openai.com → API keys. Vaja ainult siis, kui piltide allikaks on valitud OpenAI."
          value={settings.openaiApiKey}
          onChange={(v) => setSettings(s => ({ ...s, openaiApiKey: v }))}
          type="password"
          placeholder="sk-..."
        />

        {/* MCP connection test */}
        <div>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', marginBottom: 4
          }}>
            MCP ühenduse test
          </div>
          <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Testi, kas Figma ja Pencil MCP on saadaval. Salvesta seaded enne testimist.
          </div>
          <button
            onClick={testMcp}
            disabled={mcpTesting}
            style={{
              padding: '8px 18px',
              background: 'transparent',
              border: '1px solid var(--border-active)',
              borderRadius: 7,
              fontFamily: 'var(--mono)', fontSize: 11,
              color: 'var(--accent)',
              cursor: mcpTesting ? 'not-allowed' : 'pointer',
              outline: 'none', opacity: mcpTesting ? 0.6 : 1
            }}
          >
            {mcpTesting ? 'Kontrollin...' : 'Testi MCP ühendust'}
          </button>
          {mcpStatus && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Figma status */}
              <div style={{
                padding: '12px 14px',
                background: mcpStatus.figma ? 'rgba(90,158,122,0.08)' : mcpStatus.figmaDaemonRunning ? 'rgba(200,169,110,0.08)' : 'rgba(192,80,74,0.08)',
                border: `1px solid ${mcpStatus.figma ? 'rgba(90,158,122,0.35)' : mcpStatus.figmaDaemonRunning ? 'rgba(200,169,110,0.35)' : 'rgba(192,80,74,0.3)'}`,
                borderRadius: 7
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: mcpStatus.figma ? 'var(--success)' : mcpStatus.figmaDaemonRunning ? '#c8a96e' : 'var(--error)'
                  }} />
                  <span style={{
                    fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600,
                    color: mcpStatus.figma ? 'var(--success)' : mcpStatus.figmaDaemonRunning ? '#c8a96e' : 'var(--error)'
                  }}>
                    Figma: {mcpStatus.figma ? 'Ühendatud ✓' : mcpStatus.figmaDaemonRunning ? 'Server töötab, plugin oodatab' : 'Ei vasta'}
                  </span>
                </div>
                {mcpStatus.figmaDaemonRunning && mcpStatus.figmaPort && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)', marginLeft: 15, marginBottom: 4 }}>
                    Server aktiivne pordil {mcpStatus.figmaPort} · Plugin ühendusi: {mcpStatus.figmaClients ?? 0}
                  </div>
                )}
                {mcpStatus.figmaError && (
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
                    lineHeight: 1.6, marginLeft: 15, whiteSpace: 'pre-wrap'
                  }}>
                    {mcpStatus.figmaError}
                  </div>
                )}
              </div>

              {/* Pencil status */}
              <div style={{
                padding: '10px 14px',
                background: mcpStatus.pencil ? 'rgba(90,158,122,0.08)' : 'rgba(192,80,74,0.08)',
                border: `1px solid ${mcpStatus.pencil ? 'rgba(90,158,122,0.35)' : 'rgba(192,80,74,0.3)'}`,
                borderRadius: 7
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: mcpStatus.pencilError ? 6 : 0 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                    background: mcpStatus.pencil ? 'var(--success)' : 'var(--error)'
                  }} />
                  <span style={{
                    fontFamily: 'var(--display)', fontSize: 12, fontWeight: 600,
                    color: mcpStatus.pencil ? 'var(--success)' : 'var(--error)'
                  }}>
                    Pencil: {mcpStatus.pencil ? 'OK' : 'Ei vasta'}
                  </span>
                </div>
                {mcpStatus.pencilError && (
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)',
                    lineHeight: 1.5, marginLeft: 15
                  }}>
                    {mcpStatus.pencilError}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Figma image API probe (debug) */}
        <div>
          <div style={{
            fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600,
            color: 'var(--text-primary)', marginBottom: 4
          }}>
            Figma image API proov (debug)
          </div>
          <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Testib, milliseid Figma image API-sid Bridge plugin toetab. Nõuab, et MCP ühendus oleks aktiivne.
          </div>
          <button
            onClick={runImageProbe}
            disabled={probeRunning}
            style={{
              padding: '8px 18px',
              background: 'transparent',
              border: '1px solid var(--border-active)',
              borderRadius: 7,
              fontFamily: 'var(--mono)', fontSize: 11,
              color: 'var(--accent)',
              cursor: probeRunning ? 'not-allowed' : 'pointer',
              outline: 'none', opacity: probeRunning ? 0.6 : 1
            }}
          >
            {probeRunning ? 'Jooksutan...' : 'Proovi Figma image API-sid'}
          </button>
          {probeResult && (
            <pre style={{
              marginTop: 12,
              padding: '12px 14px',
              background: probeResult.ok ? 'rgba(90,158,122,0.06)' : 'rgba(192,80,74,0.06)',
              border: `1px solid ${probeResult.ok ? 'rgba(90,158,122,0.25)' : 'rgba(192,80,74,0.25)'}`,
              borderRadius: 7,
              fontFamily: 'var(--mono)', fontSize: 10,
              color: 'var(--text-primary)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 480,
              overflow: 'auto'
            }}>
              {JSON.stringify(probeResult, null, 2)}
            </pre>
          )}
        </div>

        <SettingField
          label="Väljundi kaust"
          description="Vaikimisi: ~/Desktop/stiilileidja-output"
          value={settings.outputDir}
          onChange={(v) => setSettings(s => ({ ...s, outputDir: v }))}
          type="text"
          placeholder="/Users/nimi/Desktop/stiilileidja-output"
        />

        <div>
          <button
            onClick={save}
            style={{
              padding: '12px 28px',
              background: saved ? 'var(--success)' : 'var(--accent)',
              border: 'none', borderRadius: 8,
              color: '#0a0a0a',
              fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', outline: 'none',
              transition: 'background 0.2s ease'
            }}
          >
            {saved ? 'Salvestatud!' : 'Salvesta'}
          </button>
        </div>

        <SetupGuide />

      </div>
    </div>
  )
}

function AuthModeCard({
  id, active, title, description, icon, onClick
}: {
  id: string
  active: boolean
  title: string
  description: string
  icon: string
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '16px',
        background: active ? 'var(--accent-dim)' : 'var(--bg-card)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 8,
        textAlign: 'left',
        cursor: 'pointer',
        outline: 'none',
        transition: 'all 0.15s ease'
      }}
    >
      <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
      <div style={{
        fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600,
        color: active ? 'var(--accent)' : 'var(--text-primary)', marginBottom: 4
      }}>
        {title}
      </div>
      <div style={{ fontFamily: 'var(--sans)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {description}
      </div>
    </button>
  )
}

function ClaudeLoginPanel({ existingKey, onKeyDetected, onLogout }: {
  existingKey: string
  onKeyDetected: (key: string) => void
  onLogout: () => void
}): React.ReactElement {
  const isLoggedIn = existingKey.startsWith('sk-ant-')
  const [status, setStatus] = React.useState<'checking' | 'idle' | 'waiting' | 'done'>('checking')
  const [error, setError] = React.useState('')

  // On mount: try to auto-detect key from env / Claude Code keychain
  React.useEffect(() => {
    if (isLoggedIn) { setStatus('idle'); return }
    window.stiilileidja?.detectApiKey().then((res) => {
      if (res.found) {
        // Sync saved key back to parent state so "Salvesta" won't wipe it
        window.stiilileidja?.getSettings().then((s) => {
          if (s.anthropicApiKey) onKeyDetected(s.anthropicApiKey)
        })
      }
      setStatus(res.found ? 'done' : 'idle')
    })
  }, [])

  async function loginWithClaudeCode(): Promise<void> {
    if (!window.stiilileidja) return
    setStatus('waiting')
    setError('')
    const res = await window.stiilileidja.loginWithClaudeCode()
    if (res.ok) {
      // Sync saved token back to parent state so "Salvesta" won't wipe it
      window.stiilileidja.getSettings().then((s) => {
        if (s.anthropicApiKey) onKeyDetected(s.anthropicApiKey)
      })
      setStatus('done')
    } else {
      setError(res.reason ?? 'Sisselogimine ebaõnnestus')
      setStatus('idle')
    }
  }

  if (status === 'checking') {
    return (
      <div style={{ padding: '14px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)' }}>
        Kontrollin olemasolevat sessiooni...
      </div>
    )
  }

  // Already have a key (stored or just captured)
  if (isLoggedIn || status === 'done') {
    return (
      <div style={{
        padding: '16px 20px',
        background: 'rgba(90,158,122,0.08)',
        border: '1px solid rgba(90,158,122,0.35)',
        borderRadius: 8,
        display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
              Sisselogitud
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {existingKey ? existingKey.slice(0, 16) + '...' : 'API võti salvestatud'}
            </div>
          </div>
        </div>
        <button
          onClick={() => { onLogout(); setStatus('idle') }}
          style={{
            padding: '8px 16px', background: 'transparent',
            border: '1px solid rgba(192,80,74,0.4)', borderRadius: 6,
            color: 'var(--error)', fontFamily: 'var(--mono)',
            fontSize: 11, cursor: 'pointer', outline: 'none',
            alignSelf: 'flex-start', transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(192,80,74,0.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          Logi välja / vaheta kontot
        </button>
      </div>
    )
  }

  // Not logged in — one-click login via Claude Code session
  return (
    <div style={{
      padding: '16px 20px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      display: 'flex', flexDirection: 'column', gap: 12
    }}>
      <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Kasutab Claude Code'i olemasolevat sessiooni — ei pea keyd käsitsi kopeerima.
      </div>

      {error && (
        <div style={{
          fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--error)',
          padding: '10px 14px', background: 'rgba(192,80,74,0.08)',
          border: '1px solid rgba(192,80,74,0.25)', borderRadius: 6, lineHeight: 1.5
        }}>
          {error}
        </div>
      )}

      <button
        onClick={loginWithClaudeCode}
        disabled={status === 'waiting'}
        style={{
          padding: '10px 18px',
          background: status === 'waiting' ? 'transparent' : 'var(--accent)',
          border: status === 'waiting' ? '1px solid var(--border)' : 'none',
          borderRadius: 7,
          color: status === 'waiting' ? 'var(--text-muted)' : '#0a0a0a',
          fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700,
          cursor: status === 'waiting' ? 'not-allowed' : 'pointer',
          outline: 'none',
          display: 'flex', alignItems: 'center', gap: 8,
          alignSelf: 'flex-start'
        }}
      >
        {status === 'waiting' ? (
          <>
            <span style={{ animation: 'pulse 1s ease infinite', display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
            Kontrollin...
          </>
        ) : '◉ Logi sisse Claude Code\'iga'}
      </button>
    </div>
  )
}

function link(url: string): void {
  window.stiilileidja?.openExternal(url)
}

interface SetupSection {
  id: string
  title: string
  badge: string
  badgeColor: string
  steps: Array<{
    text: string
    url?: string
    urlLabel?: string
    warning?: boolean
  }>
}

const SETUP_SECTIONS: SetupSection[] = [
  {
    id: 'figma',
    title: 'Figma (otse käivitus)',
    badge: 'Execute',
    badgeColor: '#5a7fc0',
    steps: [
      {
        text: 'Figma Desktop rakendus peab olema avatud',
        url: 'https://www.figma.com/downloads/',
        urlLabel: 'Laadi alla'
      },
      {
        text: 'Plugins → Development → Import plugin from manifest → ~/.figma-console-mcp/plugin/manifest.json'
      },
      {
        text: 'Ava plugin: Plugins → Development → Figma Desktop Bridge. Kui näed "Cloud Mode" — klõpsa ja vali LOCAL MODE.',
        warning: true
      },
      {
        text: 'Stiilileidja käivitab Figma MCP serveri automaatselt rakenduse avamisel. Plugin peab serveri leidmiseks tegema oma skänni — selleks sulge ja ava plugin uuesti KORDs pärast stiilileidja käivitamist.',
        warning: true
      },
      {
        text: 'Pärast ühekordset plugina taaslaadimist töötab Figma Execute normaalselt kogu sessiooni vältel. Seda ei pea tegema iga kord uuesti.'
      },
      {
        text: 'Vähemalt üks Figma fail peab olema avatud — moodboard luuakse sinna'
      },
      {
        text: 'Figma Access Token: figma.com → Settings → Security → Personal access tokens',
        url: 'https://www.figma.com/settings',
        urlLabel: 'Ava seaded'
      }
    ]
  },
  {
    id: 'pencil',
    title: 'Pencil (otse käivitus)',
    badge: 'Execute',
    badgeColor: '#5a7fc0',
    steps: [
      {
        text: 'Pencil rakendus peab olema avatud ja aktiivne (/Applications/Pencil.app)'
      },
      {
        text: 'MCP server käivitub automaatselt — eraldi seadistust pole vaja'
      }
    ]
  },
  {
    id: 'claude',
    title: 'Claude / Anthropic API',
    badge: 'AI süntees',
    badgeColor: '#c8a96e',
    steps: [
      {
        text: 'Loo konto platform.claude.com — see on ERALDI claude.ai tellimusest',
        url: 'https://platform.claude.com/dashboard',
        urlLabel: 'Ava Platform'
      },
      {
        text: 'Lisa vähemalt $5 krediiti → Settings → Billing (avab Tier 1: 50 req/min)',
        url: 'https://platform.claude.com/settings/billing',
        urlLabel: 'Billing'
      },
      {
        text: 'Genereeri API võti → Settings → API Keys → Create Key',
        url: 'https://platform.claude.com/settings/api-keys',
        urlLabel: 'API Keys'
      },
      {
        text: 'NB! Claude.ai Pro/Max OAuth tokenid (sk-ant-oat...) on kolmandate osapoolte rakendustes blokeeritud Anthropic poolt alates jaanuarist 2026.',
        warning: true
      },
      {
        text: 'Üks brändisüntees maksab ~$0.01–0.03 (Sonnet 4.6 hinnad)'
      }
    ]
  },
  {
    id: 'ahrefs',
    title: 'Ahrefs (konkurentide analüüs)',
    badge: 'Vabatahtlik',
    badgeColor: '#5a9e7a',
    steps: [
      {
        text: 'Nõuab Ahrefs tellimust (Standard või kõrgem)',
        url: 'https://ahrefs.com/pricing',
        urlLabel: 'Ahrefs hinnad'
      },
      {
        text: 'API võti: app.ahrefs.com → Account → API → Generate token',
        url: 'https://app.ahrefs.com/account/api',
        urlLabel: 'Ava API leht'
      },
      {
        text: 'NB! See on eraldi API võti, mitte sama mis Claude Code\'i MCP ühendus',
        warning: true
      },
      {
        text: 'Ilma Ahrefs võtmeta töötab rakendus — konkurentide andmed jäävad tühjaks'
      }
    ]
  },
  {
    id: 'playwright',
    title: 'Playwright (veebisaidi kraabimiseks)',
    badge: 'Automaatne',
    badgeColor: '#5a9e7a',
    steps: [
      {
        text: 'Chromium brauser installitakse automaatselt esimesel käivitusel (~170 MB)',
        url: 'https://playwright.dev/docs/browsers',
        urlLabel: 'Playwright docs'
      },
      {
        text: 'Asub: ~/Library/Application Support/Stiilileidja/browsers/'
      },
      {
        text: 'Kui installimine ebaõnnestub, käivita terminalis: PLAYWRIGHT_BROWSERS_PATH=~/.stiilileidja npx playwright install chromium',
        warning: true
      }
    ]
  }
]

function SetupGuide(): React.ReactElement {
  const [open, setOpen] = React.useState<string | null>(null)

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16
      }}>
        Seadistuse juhend
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SETUP_SECTIONS.map((section) => (
          <div key={section.id}>
            <button
              onClick={() => setOpen(open === section.id ? null : section.id)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: open === section.id ? 'var(--bg-hover)' : 'var(--bg-card)',
                border: `1px solid ${open === section.id ? 'var(--border-active)' : 'var(--border)'}`,
                borderRadius: open === section.id ? '8px 8px 0 0' : 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                outline: 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontFamily: 'var(--display)', fontSize: 13, fontWeight: 600,
                  color: 'var(--text-primary)'
                }}>
                  {section.title}
                </span>
                <span style={{
                  padding: '2px 8px',
                  background: section.badgeColor + '22',
                  border: `1px solid ${section.badgeColor}44`,
                  borderRadius: 4,
                  fontFamily: 'var(--mono)', fontSize: 10,
                  color: section.badgeColor
                }}>
                  {section.badge}
                </span>
              </div>
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none"
                stroke="var(--text-muted)" strokeWidth="1.5"
                style={{
                  transform: open === section.id ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                  flexShrink: 0
                }}
              >
                <path d="M2 4l4 4 4-4" />
              </svg>
            </button>

            {open === section.id && (
              <div style={{
                padding: '16px 16px 16px 16px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-active)',
                borderTop: 'none',
                borderRadius: '0 0 8px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                {section.steps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0,
                      marginTop: 2,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: step.warning ? 'rgba(192,80,74,0.15)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${step.warning ? 'rgba(192,80,74,0.4)' : 'var(--border)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: 'var(--mono)',
                      fontSize: 9,
                      color: step.warning ? 'var(--error)' : 'var(--text-muted)'
                    }}>
                      {step.warning ? '!' : i + 1}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{
                        fontFamily: 'var(--sans)', fontSize: 12,
                        color: step.warning ? 'var(--error)' : 'var(--text-secondary)',
                        lineHeight: 1.6
                      }}>
                        {step.text}
                      </span>
                      {step.url && (
                        <button
                          onClick={() => link(step.url!)}
                          style={{
                            marginLeft: 8,
                            padding: '1px 8px',
                            background: 'transparent',
                            border: '1px solid var(--border-active)',
                            borderRadius: 4,
                            fontFamily: 'var(--mono)',
                            fontSize: 10,
                            color: 'var(--accent)',
                            cursor: 'pointer',
                            outline: 'none',
                            verticalAlign: 'middle'
                          }}
                        >
                          {step.urlLabel ?? 'Ava'} ↗
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingField({
  label, description, value, onChange, type, placeholder
}: {
  label: string
  description: string
  value: string
  onChange: (v: string) => void
  type: 'text' | 'password'
  placeholder?: string
}): React.ReactElement {
  const [visible, setVisible] = React.useState(false)
  const isSecret = type === 'password'

  return (
    <div>
      <label style={{
        display: 'block', fontFamily: 'var(--display)', fontSize: 13,
        fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4
      }}>
        {label}
      </label>
      <div style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        {description}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          type={isSecret && !visible ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: isSecret ? '10px 40px 10px 14px' : '10px 14px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 8,
            color: 'var(--text-primary)',
            fontFamily: 'var(--mono)', fontSize: 13,
            outline: 'none', transition: 'border-color 0.15s ease',
            WebkitUserSelect: 'text' as never
          }}
          onFocus={(e) => (e.target.style.borderColor = 'var(--border-active)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            tabIndex={-1}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4, outline: 'none',
              display: 'flex', alignItems: 'center'
            }}
          >
            {visible ? (
              // Eye-off icon
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              // Eye icon
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
