import React from 'react'
import { usePipelineStore } from '../store/pipeline.store.js'

interface NavItem {
  id: 'input' | 'pipeline' | 'results' | 'settings'
  icon: React.ReactElement
  label: string
  disabled?: boolean
}

export default function Sidebar(): React.ReactElement {
  const { activeView, setActiveView, steps, synthesis } = usePipelineStore()

  const navItems: NavItem[] = [
    {
      id: 'input',
      label: 'Brief',
      icon: <IconBrief />
    },
    {
      id: 'pipeline',
      label: 'Pipeline',
      icon: <IconPipeline />,
      disabled: Object.values(steps).every((s) => s.status === 'idle')
    },
    {
      id: 'results',
      label: 'Tulemused',
      icon: <IconResults />,
      disabled: !synthesis
    },
    {
      id: 'settings',
      label: 'Seaded',
      icon: <IconSettings />
    }
  ]

  return (
    <aside
      style={{
        width: 56,
        background: 'var(--bg-elevated)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 48, // space for macOS traffic lights
        paddingBottom: 16,
        gap: 4,
        flexShrink: 0,
        WebkitAppRegion: 'drag' as never
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          width: 28,
          height: 28,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="var(--accent)" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="3" fill="var(--accent)" />
          <line x1="10" y1="1" x2="10" y2="4" stroke="var(--accent)" strokeWidth="1.5" />
          <line x1="10" y1="16" x2="10" y2="19" stroke="var(--accent)" strokeWidth="1.5" />
          <line x1="1" y1="10" x2="4" y2="10" stroke="var(--accent)" strokeWidth="1.5" />
          <line x1="16" y1="10" x2="19" y2="10" stroke="var(--accent)" strokeWidth="1.5" />
        </svg>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, WebkitAppRegion: 'no-drag' as never }}>
        {navItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activeView === item.id}
            onClick={() => !item.disabled && setActiveView(item.id)}
          />
        ))}
      </div>
    </aside>
  )
}

function NavButton({
  item,
  active,
  onClick
}: {
  item: NavItem
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      disabled={item.disabled}
      title={item.label}
      style={{
        width: 40,
        height: 40,
        border: 'none',
        borderRadius: 8,
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent)' : item.disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
        cursor: item.disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
        outline: 'none'
      }}
      onMouseEnter={(e) => {
        if (!item.disabled && !active) {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = item.disabled ? 'var(--text-muted)' : 'var(--text-secondary)'
        }
      }}
    >
      {item.icon}
    </button>
  )
}

function IconBrief(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="2" width="12" height="14" rx="2" />
      <line x1="6" y1="6" x2="12" y2="6" />
      <line x1="6" y1="9" x2="12" y2="9" />
      <line x1="6" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function IconPipeline(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="9" cy="9" r="3" />
      <circle cx="9" cy="3" r="1.5" />
      <circle cx="9" cy="15" r="1.5" />
      <line x1="9" y1="4.5" x2="9" y2="6" />
      <line x1="9" y1="12" x2="9" y2="13.5" />
    </svg>
  )
}

function IconResults(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="6" height="6" rx="1.5" />
      <rect x="10" y="2" width="6" height="6" rx="1.5" />
      <rect x="2" y="10" width="6" height="6" rx="1.5" />
      <rect x="10" y="10" width="6" height="6" rx="1.5" />
    </svg>
  )
}

function IconSettings(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="9" cy="9" r="2.5" />
      <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.05 3.05l1.41 1.41M13.54 13.54l1.41 1.41M3.05 14.95l1.41-1.41M13.54 4.46l1.41-1.41" />
    </svg>
  )
}
