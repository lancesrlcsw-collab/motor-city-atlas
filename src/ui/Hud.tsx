import { useEffect, useMemo, useRef, useState } from 'react'
import { orderedRoster, useStore, type Focus, type Panel } from '../store'
import { LENSES, lensById } from '../lib/lens'
import { SITE_MARK, countdown, height } from '../lib/format'
import { IconCalendar, IconCoins, IconField, IconInfo, IconNews, IconPulse, IconSearch, IconSpark, IconVersus } from './icons'

export function Brand() {
  const [a, b] = SITE_MARK
  return (
    <button className="brand" onClick={() => { const s = useStore.getState(); s.openPanel(null, false); s.select(null); s.setFocus('all') }} aria-label="Back to the full field">
      <span className="mark full">{a} <span>{b}</span></span>
      <span className="mark short" aria-hidden="true">{a.split(' ').map((w) => w[0]).join('')}<span>{b[0]}</span></span>
      <span className="sub">Lions 2026 · unofficial</span>
    </button>
  )
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return now
}

export function TopBar() {
  const team = useStore((s) => s.team)!
  const openPanel = useStore((s) => s.openPanel)
  const setSearch = useStore((s) => s.setSearch)
  const setAsk = useStore((s) => s.setAsk)
  const now = useNow(30_000)
  const r = team.team.record
  const m = team.matchup
  const cd = m ? countdown(m.kickoff, now) : null
  const kick = m?.kickoff ? new Date(m.kickoff) : null
  const started = kick ? now >= kick.getTime() : false
  return (
    <header className="topbar">
      <Brand />
      <div className="scorebug glass">
        <button className="cell" onClick={() => openPanel('season')} title="Season and standings">
          <span className="k">{team.season} record</span>
          <span className="v big">{r.wins}–{r.losses}{r.ties ? `–${r.ties}` : ''}</span>
        </button>
        <button className="cell wide" onClick={() => openPanel('season')} title="Season and standings">
          <span className="k">{team.team.division}</span>
          <span className="v">{team.team.standing?.replace(/ in .*/, '')} · {r.streak}</span>
        </button>
        {m && (
          <button className="cell" onClick={() => openPanel('matchup')} title="This week’s matchup">
            <span className="k">Week {m.week}<span className="long"> · {started ? 'in progress or final' : cd ? `kickoff in ${cd}` : 'next'}</span><span className="short"> · {started ? 'now' : cd ?? 'next'}</span></span>
            <span className="v">{m.home ? 'vs' : 'at'} <span className="long">{m.oppName.split(' ').pop()}</span><span className="short">{m.opp}</span> <span className="faint">·</span> {kick ? kick.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : m.weekday}</span>
          </button>
        )}
      </div>
      <div className="top-actions">
        <button className="btn" onClick={() => setSearch(true)} aria-label="Search players"><IconSearch /><span className="txt">Find a player</span><kbd>/</kbd></button>
        <button className="btn primary" onClick={() => { const s = useStore.getState(); if (s.selected) s.setTab('ask'); else setAsk(true) }} aria-label="Ask a question"><IconSpark /><span className="txt">Ask</span></button>
      </div>
    </header>
  )
}

const RAIL: { id: Panel | null; label: string; icon: typeof IconField }[] = [
  { id: null, label: 'Field', icon: IconField },
  { id: 'matchup', label: 'Matchup', icon: IconVersus },
  { id: 'season', label: 'Season', icon: IconCalendar },
  { id: 'cap', label: 'Cap', icon: IconCoins },
  { id: 'health', label: 'Health', icon: IconPulse },
  { id: 'news', label: 'Moves', icon: IconNews },
  { id: 'sources', label: 'About', icon: IconInfo },
]

export function Rail() {
  const panel = useStore((s) => s.panel)
  const openPanel = useStore((s) => s.openPanel)
  const select = useStore((s) => s.select)
  return (
    <nav className="rail glass" aria-label="Sections">
      {RAIL.map((r) => (
        <button key={r.label} className={panel === r.id ? 'on' : ''} onClick={() => { if (r.id === null) { openPanel(null, false); select(null) } else openPanel(r.id) }}>
          <r.icon />
          {r.label}
        </button>
      ))}
    </nav>
  )
}

const FOCI: { id: Focus; label: string }[] = [{ id: 'all', label: 'Everyone' }, { id: 'offense', label: 'Offense' }, { id: 'defense', label: 'Defense' }, { id: 'bench', label: 'Sidelines' }]

export function Dock() {
  const lens = useStore((s) => s.lens)
  const focus = useStore((s) => s.focus)
  const selected = useStore((s) => s.selected)
  const panel = useStore((s) => s.panel)
  const setLens = useStore((s) => s.setLens)
  const setFocus = useStore((s) => s.setFocus)
  return (
    <div className={`dock glass${selected ? ' shifted' : ''}${panel ? ' hidden' : ''}`}>
      <span className="label">Lens</span>
      <div className="seg" role="tablist" aria-label="Data lens">
        {LENSES.map((l) => <button key={l.id} role="tab" aria-selected={lens === l.id} className={lens === l.id ? 'on' : ''} onClick={() => setLens(l.id)}>{l.name}</button>)}
      </div>
      {!selected && (
        <>
          <span className="divider" />
          <span className="label">View</span>
          <div className="seg">
            {FOCI.map((f) => <button key={f.id} className={focus === f.id ? 'on' : ''} onClick={() => setFocus(f.id)}>{f.label}</button>)}
          </div>
        </>
      )}
    </div>
  )
}

export function Legend() {
  const lens = lensById(useStore((s) => s.lens))
  const panel = useStore((s) => s.panel)
  const selected = useStore((s) => s.selected)
  return (
    <aside className={`legend glass${panel || selected ? ' hidden' : ''}`}>
      <h3>{lens.name}</h3>
      <p>{lens.blurb}</p>
      <ul>{lens.legend.map((l) => <li key={l.label}><i style={{ background: l.color }} />{l.label}</li>)}</ul>
      {lens.note && <div className="note">{lens.note}</div>}
    </aside>
  )
}

export function HoverCard() {
  const hovered = useStore((s) => s.hovered)
  const roster = useStore((s) => s.roster)
  const team = useStore((s) => s.team)
  const lensId = useStore((s) => s.lens)
  const selected = useStore((s) => s.selected)
  const ref = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const move = (e: PointerEvent) => {
      pos.current = { x: e.clientX, y: e.clientY }
      const el = ref.current
      if (!el) return
      const w = el.offsetWidth, h = el.offsetHeight
      const x = Math.min(window.innerWidth - w - 12, e.clientX + 18)
      const y = Math.min(window.innerHeight - h - 12, Math.max(12, e.clientY - h - 14))
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  const p = useMemo(() => roster.find((x) => x.id === hovered), [roster, hovered])
  if (!p || !team || p.slug === selected) return <div ref={ref} className="hovercard" style={{ opacity: 0 }} />
  const lens = lensById(lensId)
  const maxCap = Math.max(1, ...roster.map((x) => x.lens?.cap ?? 0))
  const v = lens.value(p, { season: team.season, maxCap })
  return (
    <div ref={ref} className="hovercard glass" style={{ left: 0, top: 0, transform: `translate(${pos.current.x + 18}px, ${Math.max(12, pos.current.y - 150)}px)` }}>
      <div className="row1">
        <span className="no">{p.number ?? '–'}</span>
        <span className="nm">{p.name}</span>
      </div>
      <div className="meta">
        {p.depth ? `${p.depth.label} · ${p.depth.rank === 1 ? 'starter' : `No. ${p.depth.rank} on the depth chart`}` : `${p.position} · ${p.rosterDetail}`}
        {p.height ? ` · ${height(p.height)}, ${p.weight} lb` : ''}
      </div>
      {p.line && p.line.length > 0 && (
        <div className="stats">{p.line.map((l) => <div key={l.label}><b>{l.value}</b><span>{l.label}</span></div>)}</div>
      )}
      {lens.id !== 'roster' && <div className="lensline"><i style={{ background: v.color }} />{lens.name}: {v.tag ?? (lens.id === 'health' ? p.availability.status : 'no figure')}</div>}
      {p.availability.tone !== 'ok' && lens.id !== 'health' && <div className="lensline"><i style={{ background: p.availability.tone === 'out' ? 'var(--bad)' : p.availability.tone === 'warn' ? 'var(--warn)' : 'var(--text-3)' }} />{p.availability.status}{p.availability.injury ? ` · ${p.availability.injury}` : ''}</div>}
      <div className="hint">Click for the full dossier</div>
    </div>
  )
}

export function Search() {
  const open = useStore((s) => s.searchOpen)
  const setSearch = useStore((s) => s.setSearch)
  const roster = useStore((s) => s.roster)
  const select = useStore((s) => s.select)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => input.current?.focus(), 30) } }, [open])
  const results = useMemo(() => {
    const list = orderedRoster(roster)
    const s = q.trim().toLowerCase()
    if (!s) return list.slice(0, 40)
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '')
    return list.filter((p) => norm(p.name).includes(norm(s)) || String(p.number) === s || (p.position || '').toLowerCase() === s || (p.college || '').toLowerCase().includes(s) || p.group.toLowerCase() === s).slice(0, 40)
  }, [roster, q])
  if (!open) return null
  return (
    <div className="scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) setSearch(false) }}>
      <div className="search glass" role="dialog" aria-label="Find a player">
        <input
          ref={input} value={q} placeholder="Name, number, position or college" aria-label="Search players"
          onChange={(e) => { setQ(e.target.value); setIdx(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
            else if (e.key === 'Enter' && results[idx]) select(results[idx].slug)
            else if (e.key === 'Escape') setSearch(false)
          }}
        />
        <div className="results scroll">
          {results.length === 0 && <div className="empty">No one on the roster matches “{q}”.</div>}
          {results.map((p, i) => (
            <button key={p.id} className={`result${i === idx ? ' on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => select(p.slug)}>
              <span className="no">{p.number ?? '–'}</span>
              <span><div className="nm">{p.name}</div><div className="sm">{p.position} · {p.rosterDetail}{p.college ? ` · ${p.college}` : ''}</div></span>
              <span className="sm">{p.line?.map((l) => `${l.value} ${l.label}`).slice(0, 2).join(' · ')}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
