import { useEffect, useState } from 'react'
import { useStore } from './store'
import { Scene } from './scene/Scene'
import { Dock, HoverCard, Legend, Rail, Search, TopBar } from './ui/Hud'
import { Dossier } from './ui/Dossier'
import { TeamPanel } from './ui/TeamPanel'
import { AskDrawer } from './ui/Ask'
import { SITE_MARK } from './lib/format'

function Loader() {
  const status = useStore((s) => s.status)
  const introDone = useStore((s) => s.introDone)
  const error = useStore((s) => s.error)
  const [gone, setGone] = useState(false)
  const done = status === 'ready' && introDone
  useEffect(() => { if (done) { const id = setTimeout(() => setGone(true), 900); return () => clearTimeout(id) } }, [done])
  if (gone) return null
  const [a, b] = SITE_MARK
  return (
    <div className={`loader${status === 'ready' ? ' done' : ''}`} aria-live="polite">
      <div>
        <h1>{a}<br /><span>{b}</span></h1>
        {status === 'error' ? <p>Could not load the roster data. {error}</p> : <><p>The 2026 Detroit roster, modeled in 3D</p><div className="bar" /></>}
      </div>
    </div>
  )
}

export function App() {
  const status = useStore((s) => s.status)
  useEffect(() => { useStore.getState().load() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key === 'Escape') {
        if (s.searchOpen) s.setSearch(false)
        else if (s.askOpen) s.setAsk(false)
        else if (s.overlay) s.setOverlay(null)
        else if (s.selected) s.select(null)
        else if (s.panel) s.openPanel(null)
        return
      }
      if (typing) return
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); s.setSearch(true) }
      else if (e.key === 'ArrowRight' && s.selected) s.step(1)
      else if (e.key === 'ArrowLeft' && s.selected) s.step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <Scene />
      <Loader />
      {status === 'ready' && (
        <>
          <TopBar />
          <Rail />
          <Legend />
          <Dock />
          <HoverCard />
          <Dossier />
          <TeamPanel />
          <Search />
          <AskDrawer />
        </>
      )}
    </div>
  )
}
