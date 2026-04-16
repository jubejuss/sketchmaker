import React from 'react'
import { usePipelineStore } from '../store/pipeline.store.js'
import type { StepId, StepStatus } from '../../shared/types.js'

const STEP_LABELS: Record<StepId, { label: string; description: string }> = {
  scrape: { label: 'Veebisaidi analüüs', description: 'Ekraanipildid, värvid, fondid' },
  research: { label: 'SEO konkurendid', description: 'Ahrefs andmed' },
  discover: { label: 'Kujunduskonkurendid', description: 'Visuaalsed inspiratsiooniallikad' },
  synthesize: { label: 'Brändi süntees', description: 'Claude AI analüüs' },
  report: { label: 'Raport', description: 'PDF + HTML dokument' },
  moodboard: { label: 'Moodboard', description: 'Figma või Pencil' }
}

const STEP_ORDER: StepId[] = ['scrape', 'research', 'discover', 'synthesize', 'report', 'moodboard']

export default function PipelineView(): React.ReactElement {
  const { steps, synthesisStream, scrapedSite } = usePipelineStore()

  const runningStep = STEP_ORDER.find((s) => steps[s].status === 'running')
  const doneCount = STEP_ORDER.filter((s) =>
    steps[s].status === 'done' || steps[s].status === 'skipped'
  ).length

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      padding: '48px 64px',
      gap: 48,
      overflow: 'hidden'
    }}>
      {/* Steps panel */}
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginBottom: 24
        }}>
          Pipeline
        </div>

        {/* Progress bar */}
        <div style={{
          height: 2,
          background: 'var(--border)',
          borderRadius: 1,
          marginBottom: 32,
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${(doneCount / STEP_ORDER.length) * 100}%`,
            background: 'var(--accent)',
            borderRadius: 1,
            transition: 'width 0.4s ease'
          }} />
        </div>

        {STEP_ORDER.map((stepId, i) => (
          <StepRow
            key={stepId}
            stepId={stepId}
            index={i}
            status={steps[stepId].status}
            message={steps[stepId].message}
            isLast={i === STEP_ORDER.length - 1}
          />
        ))}
      </div>

      {/* Live output panel */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)'
        }}>
          {runningStep === 'scrape' ? 'Kraabimise logi' :
           runningStep === 'synthesize' ? 'AI väljund' : 'Logi'}
        </div>

        {runningStep === 'synthesize' || synthesisStream ? (
          <SynthesisStream text={synthesisStream} />
        ) : runningStep === 'scrape' ? (
          <ScraperPreview />
        ) : (
          <WaitingState />
        )}
      </div>
    </div>
  )
}

function StepRow({
  stepId, index, status, message, isLast
}: {
  stepId: StepId
  index: number
  status: StepStatus
  message?: string
  isLast: boolean
}): React.ReactElement {
  const info = STEP_LABELS[stepId]

  const color =
    status === 'done' ? 'var(--success)' :
    status === 'running' ? 'var(--accent)' :
    status === 'error' ? 'var(--error)' :
    status === 'skipped' ? 'var(--text-muted)' :
    'var(--border-active)'

  return (
    <div style={{ display: 'flex', gap: 16, paddingBottom: isLast ? 0 : 24 }}>
      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: `1.5px solid ${color}`,
          background: status === 'done' ? color :
                      status === 'running' ? 'var(--accent-dim)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          flexShrink: 0
        }}>
          {status === 'done' && <CheckIcon />}
          {status === 'running' && <SpinnerDot />}
          {status === 'error' && <XIcon />}
          {status === 'skipped' && <SkipIcon />}
          {status === 'idle' && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-muted)' }}>
              {index + 1}
            </span>
          )}
        </div>
        {!isLast && (
          <div style={{
            width: 1,
            flex: 1,
            marginTop: 4,
            background: status === 'done' ? 'var(--success)' : 'var(--border)',
            minHeight: 16,
            transition: 'background 0.3s ease'
          }} />
        )}
      </div>

      {/* Label */}
      <div style={{ paddingTop: 4 }}>
        <div style={{
          fontFamily: 'var(--display)',
          fontSize: 13,
          fontWeight: 600,
          color: status === 'idle' ? 'var(--text-muted)' : 'var(--text-primary)',
          transition: 'color 0.3s ease'
        }}>
          {info.label}
        </div>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: 10,
          color: 'var(--text-muted)',
          marginTop: 2
        }}>
          {message || info.description}
        </div>
      </div>
    </div>
  )
}

function SynthesisStream({ text }: { text: string }): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [text])

  return (
    <div
      ref={ref}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: '20px 24px',
        background: 'var(--bg-card)',
        borderRadius: 10,
        border: '1px solid var(--border)'
      }}
    >
      <pre style={{
        fontFamily: 'var(--mono)',
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--text-secondary)',
        whiteSpace: 'pre-wrap',
        margin: 0
      }}>
        {text}
        {text && <span className="cursor-blink" />}
      </pre>
    </div>
  )
}

function ScraperPreview(): React.ReactElement {
  return (
    <div style={{
      flex: 1,
      padding: '20px 24px',
      background: 'var(--bg-card)',
      borderRadius: 10,
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }}>
      <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
      <div className="skeleton" style={{ height: 16, width: '60%', borderRadius: 4 }} />
      <div className="skeleton" style={{ height: 12, width: '40%', borderRadius: 4 }} />
    </div>
  )
}

function WaitingState(): React.ReactElement {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      fontFamily: 'var(--mono)',
      fontSize: 12
    }}>
      Ootab...
    </div>
  )
}

function CheckIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2">
      <path d="M2 6l3 3 5-5" />
    </svg>
  )
}

function SpinnerDot(): React.ReactElement {
  return (
    <div style={{
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--accent)',
      animation: 'pulse 1s ease infinite'
    }} />
  )
}

function XIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
      <path d="M2 2l6 6M8 2l-6 6" />
    </svg>
  )
}

function SkipIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 5h5M6 3l2 2-2 2" />
    </svg>
  )
}
