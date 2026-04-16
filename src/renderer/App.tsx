import React, { useEffect } from 'react'
import { usePipelineStore } from './store/pipeline.store.js'
import InputView from './views/InputView.js'
import PipelineView from './views/PipelineView.js'
import ResultsView from './views/ResultsView.js'
import SettingsView from './views/SettingsView.js'
import Sidebar from './components/Sidebar.js'

export default function App(): React.ReactElement {
  const { activeView } = usePipelineStore()

  // Register streaming listeners
  useEffect(() => {
    if (!window.stiilileidja) return
    const { appendSynthesisToken, setStep } = usePipelineStore.getState()
    const unsubSynth = window.stiilileidja.onSynthesisToken(appendSynthesisToken)
    const unsubStep = window.stiilileidja.onStepUpdate((step) => {
      setStep(step.step, { status: step.status, message: step.message })
    })
    return () => {
      unsubSynth()
      unsubStep()
    }
  }, [])

  const renderView = (): React.ReactElement => {
    switch (activeView) {
      case 'pipeline': return <PipelineView />
      case 'results': return <ResultsView />
      case 'settings': return <SettingsView />
      default: return <InputView />
    }
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)' }}>
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>
    </div>
  )
}
