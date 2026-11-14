import { useEffect, useState } from 'react'
import { HASH_ROUTING, useStore, type DossierTab } from '../store'
import type { Dossier as DossierData, RosterPlayer } from '../types'
import { POSITION_NAME, SITE_NAME, dateLong, height, ordinal, pct } from '../lib/format'
import { IconChevronLeft, IconChevronRight, IconClose, IconExternal, IconShare, IconTarget } from './icons'
import { Columns, Dial } from './charts'
import { StatsTab } from './DossierStats'
import { AdvancedTab, ContractTab, NewsTab, StoryTab } from './DossierMore'
import { AskPanel } from './Ask'

const TABS: { id: DossierTab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'stats', label: 'Stats' }, { id: 'advanced', label: 'Advanced' },
  { id: 'contract', label: 'Contract' }, { id: 'story', label: 'Story' }, { id: 'news', label: 'News' }, { id: 'ask', label: 'Ask' },
]

const UNIT_NAME = { offense: 'Offense', defense: 'Defense', special: 'Special teams' } as const

export function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`pill ${tone}`}><span className="dot" />{children}</span>
}

function Header({ p, d }: { p: RosterPlayer; d: DossierData | null }) {
  const step = useStore((s) => s.step)
  const select = useStore((s) => s.select)
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) await navigator.share({ title: `${p.name} — ${SITE_NAME}`, url })
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) }
    } catch { /* dismissed */ }
  }
  const role = p.depth ? (p.depth.rank === 1 ? `Starting ${p.depth.label}` : `${p.depth.label} · No. ${p.depth.rank} on the depth chart`) : p.rosterDetail
  const facts = [p.age ? `${p.age} years old` : null, p.height ? height(p.height) : null, p.weight ? `${p.weight} lb` : null, p.experience !== undefined ? (p.experience === 0 ? 'Rookie' : `${ordinal(p.experience + 1)} season`) : null, p.college].filter(Boolean)
  const av = d?.availability ?? p.availability
  return (
    <header className="dz-head">
      <div className="dz-bar">
        <div className="dz-nav">
          <button onClick={() => step(-1)} aria-label="Previous player" title="Previous player (←)"><IconChevronLeft /></button>
          <button onClick={() => step(1)} aria-label="Next player" title="Next player (→)"><IconChevronRight /></button>
        </div>
        <span className="eyebrow">{POSITION_NAME[p.position || ''] ?? p.position} · {UNIT_NAME[p.unit]}</span>
        <div className="dz-nav">
          {!HASH_ROUTING && <button onClick={share} aria-label="Copy a link to this player" title="Copy link"><IconShare />{copied && <span className="copied">Link copied</span>}</button>}
          <button onClick={() => select(null)} aria-label="Close" title="Close (Esc)"><IconClose /></button>
        </div>
      </div>
      <div className="dz-id">
        <div className="dz-num" aria-hidden="true">{p.number ?? '–'}</div>
        <div className="dz-who">
          <h2><span>{p.first}</span> {p.last}</h2>
          <div className="dz-role">{role}</div>
          <div className="dz-facts">{facts.join(' · ')}</div>
        </div>
        {d?.percentiles?.index !== undefined && <Dial value={d.percentiles.index} size={86} />}
      </div>
      <div className="dz-status">
        <StatusPill tone={av.tone}>{av.status}</StatusPill>
        {av.injury && <span className="pill">{av.injury}</span>}
        {d?.availability.practice && <span className="pill">{d.availability.practice.replace(' in Practice', '').replace(' In Practice', '').replace('Participation', 'practice').replace('Did Not Participate', 'Did not practice')}</span>}
        {p.roles?.map((r) => <span className="pill" key={r}>{r}</span>)}
      </div>
      {p.line && p.line.length > 0 && (
        <div className="dz-line">{p.line.map((l) => <div key={l.label}><b>{l.value}</b><span>{l.label}</span></div>)}<em>2026 season</em></div>
      )}
    </header>
  )
}

/** Teammates who share a college, a draft class or a home state with this player. */
function Connections({ d }: { d: DossierData }) {
  const roster = useStore((s) => s.roster)
  const select = useStore((s) => s.select)
  const others = roster.filter((p) => p.slug !== d.slug)
  const schools = new Set((d.bio.colleges?.length ? d.bio.colleges : d.bio.college ? [d.bio.college] : []).map((c) => c.trim()))
  const groups: { label: string; people: RosterPlayer[] }[] = []
  const college = others.filter((p) => p.college && schools.has(p.college))
  if (college.length) groups.push({ label: `Also played at ${d.bio.college}`, people: college })
  const year = d.bio.draft?.year
  const klass = year ? others.filter((p) => p.draft?.year === year && p.draft?.round) : []
  if (klass.length && d.bio.draft?.round) groups.push({ label: `${year} draft class`, people: klass })
  const exp = d.bio.experience
  const rookies = exp === 0 ? others.filter((p) => p.experience === 0) : []
  if (rookies.length && !klass.length) groups.push({ label: 'Fellow rookies', people: rookies })
  const room = others.filter((p) => p.group === d.group && p.roster === 'active')
  if (room.length) groups.push({ label: `The ${d.group === 'ST' ? 'specialists' : `${d.group} room`}`, people: room })
  if (!groups.length) return null
  return (
    <section className="card">
      <h3>Connections on this roster</h3>
      {groups.map((g) => (
        <div className="conn" key={g.label}>
          <span className="eyebrow">{g.label}</span>
          <div className="chips tight">{g.people.slice(0, 14).map((p) => <button key={p.slug} className="chip small" onClick={() => select(p.slug)}>{p.number !== undefined ? <b>{p.number}</b> : null}{p.name}</button>)}</div>
        </div>
      ))}
    </section>
  )
}

function Overview({ d }: { d: DossierData }) {
  const overlay = useStore((s) => s.overlay)
  const setOverlay = useStore((s) => s.setOverlay)
  const team = useStore((s) => s.team)!
  const weeks = team.schedule.filter((g) => g.result).map((g) => g.week)
  const snapKey = d.unit === 'offense' ? 'offPct' : d.unit === 'defense' ? 'defPct' : 'stPct'
  const snapNoun = d.unit === 'offense' ? 'offensive' : d.unit === 'defense' ? 'defensive' : 'special-teams'
  const snapData = weeks.map((w) => {
    const g = d.snaps?.games?.find((x) => x.week === w)
    const opp = team.schedule.find((x) => x.week === w)
    return { label: `W${w}`, value: g ? Math.round(((g as any)[snapKey] ?? 0) * 100) : null, note: opp ? `${opp.home ? 'vs' : 'at'} ${opp.opp}` : undefined }
  })
  const bp = d.bio.birthPlace
  const born = [d.bio.birthDate ? dateLong(d.bio.birthDate).replace(/^\w+, /, '') : null, bp ? [bp.city, bp.state || bp.country].filter(Boolean).join(', ') : d.bio.birthPlaceText].filter(Boolean).join(' · ')
  const draft = d.bio.draft?.round ? `${d.bio.draft.year} · Round ${d.bio.draft.round}, pick ${d.bio.draft.pick} (${d.bio.draft.team})` : d.bio.rookieYear ? `Undrafted · entered the league in ${d.bio.rookieYear}` : null
  const overlays: { id: 'pass' | 'recv' | 'rush'; label: string }[] = []
  if (d.zones?.pass && Object.keys(d.zones.pass).length > 2) overlays.push({ id: 'pass', label: 'Passing map' })
  if (d.zones?.recv && Object.keys(d.zones.recv).length > 2) overlays.push({ id: 'recv', label: 'Target map' })
  if (d.zones?.rush && Object.keys(d.zones.rush).length > 2) overlays.push({ id: 'rush', label: 'Run lanes' })
  const reports = (d.reports || []).filter((r) => r.injury || r.gameStatus)
  return (
    <>
      {d.insights && d.insights.length > 0 && (
        <section className="card">
          <h3>At a glance</h3>
          <ul className="insights">{d.insights.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      )}

      {overlays.length > 0 && (
        <section className="card accent">
          <h3><IconTarget /> See it on the field</h3>
          <p className="muted">Paint this season’s tendencies onto the turf. Each zone shows volume and whether those plays added or cost Detroit points.</p>
          <div className="chips">
            {overlays.map((o) => <button key={o.id} className={`chip${overlay === o.id ? ' on' : ''}`} onClick={() => setOverlay(overlay === o.id ? null : o.id)}>{o.label}</button>)}
            {overlay && <button className="chip ghost" onClick={() => setOverlay(null)}>Clear</button>}
          </div>
        </section>
      )}

      {d.snaps && snapData.some((s) => s.value) && (
        <section className="card">
          <h3>Playing time</h3>
          <p className="muted">Share of Detroit’s {snapNoun} snaps, week by week. Season: <b>{pct((d.snaps.season as any)[snapKey])}</b> ({d.unit === 'offense' ? d.snaps.season.off : d.unit === 'defense' ? d.snaps.season.def : d.snaps.season.st} snaps in {d.snaps.season.games} games).</p>
          <Columns data={snapData} max={100} format={(v) => `${v}%`} ariaLabel={`${d.name} snap share by week`} />
        </section>
      )}

      {(d.weeklyStatus?.length || reports.length) ? (
        <section className="card">
          <h3>Availability, week by week</h3>
          <div className="weeks">
            {team.schedule.filter((g) => g.week <= team.week).map((g) => {
              const st = d.weeklyStatus?.find((w) => w.week === g.week)
              const rep = d.reports?.find((r) => r.week === g.week)
              const tone = !st ? 'none' : st.status !== 'ACT' ? (st.status === 'DEV' ? 'muted' : 'out') : rep?.gameStatus === 'Out' || rep?.gameStatus === 'Doubtful' ? 'out' : rep?.gameStatus ? 'warn' : 'ok'
              const text = !st ? 'Not on the roster' : st.status === 'RES' ? 'Reserve list' : st.status === 'DEV' ? 'Practice squad' : rep?.gameStatus ? `${rep.gameStatus}${rep.injury ? ` (${rep.injury})` : ''}` : rep?.injury ? `On the report (${rep.injury}), no game designation` : 'Active'
              return <span key={g.week} className={`wk ${tone}`} title={`Week ${g.week} ${g.home ? 'vs' : 'at'} ${g.opp}: ${text}`}><i />{g.week}</span>
            })}
          </div>
          <div className="weeks-key"><span className="wk ok"><i />Active</span><span className="wk warn"><i />Questionable</span><span className="wk out"><i />Out / reserve</span><span className="wk muted"><i />Practice squad</span></div>
          {reports.length > 0 && <p className="faint small">Injury report this season: {reports.map((r) => `Wk ${r.week} ${r.injury ?? ''}${r.gameStatus ? ` (${r.gameStatus.toLowerCase()})` : ''}`.trim()).join(' · ')}</p>}
        </section>
      ) : null}

      {d.plays && d.plays.length > 0 && (
        <section className="card">
          <h3>Signature plays</h3>
          <p className="muted">The plays that moved Detroit’s chances of winning the most with {d.last} involved.</p>
          <ol className="plays">
            {d.plays.slice(0, 4).map((pl, i) => (
              <li key={i}>
                <div className="play-meta"><span>Week {pl.week} {team.schedule.find((g) => g.week === pl.week)?.home ? 'vs' : 'at'} {pl.opp} · Q{pl.qtr} {pl.time}</span>{pl.wpa ? <b>+{Math.round(pl.wpa * 100)}% win probability</b> : null}</div>
                <p>{pl.text.replace(/^\(\d+:\d+\)\s*/, '').replace(/\(Shotgun\)\s*/, '')}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Connections d={d} />

      <section className="card">
        <h3>Profile</h3>
        <dl className="facts">
          {born && <><dt>Born</dt><dd>{born}</dd></>}
          {d.bio.college && <><dt>College</dt><dd>{d.bio.colleges?.join(' → ') || d.bio.college}{d.bio.conference ? <span className="faint"> · {d.bio.conference}</span> : null}</dd></>}
          {draft && <><dt>Draft</dt><dd>{draft}</dd></>}
          <dt>Roster</dt><dd>{d.rosterDetail}{d.listed?.length ? <span className="faint"> · listed at {d.listed.map((l) => `${l.label}${l.rank}`).join(', ')}</span> : null}</dd>
          {d.draft && (d.draft.proBowls || d.draft.allPro || d.draft.careerAv) ? <><dt>Honors</dt><dd>{[d.draft.proBowls ? `${d.draft.proBowls}× Pro Bowl` : null, d.draft.allPro ? `${d.draft.allPro}× first-team All-Pro` : null, d.draft.careerAv ? `Career approximate value ${d.draft.careerAv}` : null].filter(Boolean).join(' · ')}</dd></> : null}
        </dl>
        {d.links && (
          <div className="links">
            {([['espn', 'ESPN'], ['pfr', 'Pro Football Reference'], ['pff', 'PFF'], ['otc', 'OverTheCap'], ['wikipedia', 'Wikipedia']] as const).filter(([k]) => d.links![k]).map(([k, label]) => (
              <a key={k} href={d.links![k]} target="_blank" rel="noreferrer">{label}<IconExternal /></a>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

export function Dossier() {
  const selected = useStore((s) => s.selected)
  const p = useStore((s) => (s.selected ? s.bySlug.get(s.selected) : undefined))
  const entry = useStore((s) => (s.selected ? s.dossiers[s.selected] : undefined))
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const [tall, setTall] = useState(false)
  useEffect(() => { document.querySelector('.dz-body')?.scrollTo({ top: 0 }) }, [selected, tab])
  if (!selected || !p) return null
  const d = entry && typeof entry !== 'string' ? entry : null
  return (
    <aside className={`dossier glass${tall ? ' tall' : ''}`} aria-label={`${p.name} dossier`}>
      <button className="dz-grip" onClick={() => setTall((t) => !t)} aria-label={tall ? 'Shrink panel' : 'Expand panel'}><i /></button>
      <Header p={p} d={d} />
      <nav className="dz-tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>
      <div className="dz-body scroll">
        {entry === 'error' && <div className="card"><p>Could not load this player’s file. Check your connection and try again.</p></div>}
        {!d && entry !== 'error' && <div className="skeleton"><i /><i /><i /></div>}
        {d && tab === 'overview' && <Overview d={d} />}
        {d && tab === 'stats' && <StatsTab d={d} />}
        {d && tab === 'advanced' && <AdvancedTab d={d} />}
        {d && tab === 'contract' && <ContractTab d={d} />}
        {d && tab === 'story' && <StoryTab d={d} />}
        {d && tab === 'news' && <NewsTab d={d} />}
        {d && tab === 'ask' && <AskPanel slug={d.slug} name={d.name} />}
      </div>
    </aside>
  )
}
