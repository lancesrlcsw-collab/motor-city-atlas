import { useMemo, useState } from 'react'
import type { Dossier, StatLine } from '../types'
import { useStore } from '../store'
import { cell, columnsFor, SPLIT_ROLE, SPLIT_ROWS, type Col } from './statColumns'
import { num } from '../lib/format'

function Table({ cols, lead, rows, foot }: { cols: Col[]; lead: { label: string; render: (r: StatLine) => React.ReactNode }[]; rows: StatLine[]; foot?: StatLine }) {
  return (
    <div className="table-wrap scroll">
      <table className="stat-table">
        <thead>
          <tr>
            {lead.map((l) => <th key={l.label} className="lead">{l.label}</th>)}
            {cols.map((c) => <th key={c.key} title={c.title}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.type === 'POST' ? 'post' : r._current ? 'current' : ''}>
              {lead.map((l) => <td key={l.label} className="lead">{l.render(r)}</td>)}
              {cols.map((c) => <td key={c.key}>{cell(r, c)}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr>
              <td className="lead" colSpan={lead.length}>Career · regular season</td>
              {cols.map((c) => <td key={c.key}>{cell(foot, c)}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

type View = 'seasons' | 'log' | 'splits'

export function StatsTab({ d }: { d: Dossier }) {
  const team = useStore((s) => s.team)!
  const cols = useMemo(() => columnsFor(d), [d])
  const seasons = d.stats.seasons || []
  const games = d.stats.games || []
  const logSeasons = [...new Set(games.map((g) => g.season as number))].sort((a, b) => b - a)
  const [view, setView] = useState<View>('seasons')
  const [logSeason, setLogSeason] = useState<number>(logSeasons[0] ?? team.season)
  const [post, setPost] = useState(false)
  const hasPost = seasons.some((s) => s.type === 'POST')
  const splitRoles = Object.keys(d.splits || {}).filter((k) => SPLIT_ROLE[k])
  const [role, setRole] = useState(splitRoles[0])

  const seasonRows = seasons.filter((s) => (post ? s.type === 'POST' : s.type === 'REG')).map((s) => ({ ...s, _current: s.season === team.season }))
  const logRows = games.filter((g) => g.season === logSeason)
  const gameCols = cols.filter((c) => c.key !== 'games')

  if (!seasons.length && !games.length) {
    return <section className="card"><h3>Statistics</h3><p className="muted">{d.first} has not recorded a regular-season statistic yet{d.roster === 'practice' ? ' — he is on the practice squad' : ''}. This page fills in automatically when he does.</p></section>
  }
  return (
    <>
      <div className="subtabs">
        <button className={view === 'seasons' ? 'on' : ''} onClick={() => setView('seasons')}>Season by season</button>
        {logSeasons.length > 0 && <button className={view === 'log' ? 'on' : ''} onClick={() => setView('log')}>Game log</button>}
        {splitRoles.length > 0 && <button className={view === 'splits' ? 'on' : ''} onClick={() => setView('splits')}>Situations</button>}
      </div>

      {view === 'seasons' && (
        <section className="card flush">
          <div className="card-head">
            <h3>{post ? 'Postseason' : 'Regular season'}</h3>
            {hasPost && <div className="toggle"><button className={!post ? 'on' : ''} onClick={() => setPost(false)}>Regular</button><button className={post ? 'on' : ''} onClick={() => setPost(true)}>Playoffs</button></div>}
          </div>
          <Table cols={cols} rows={seasonRows} foot={post ? undefined : d.stats.career}
            lead={[{ label: 'Year', render: (r) => r.season }, { label: 'Tm', render: (r) => r.team }]} />
          {d.group === 'OL' && <p className="faint small pad">Individual blocking statistics are not published as open data. Snap counts are on the Overview tab; grading services such as PFF chart linemen snap by snap.</p>}
        </section>
      )}

      {view === 'log' && (
        <section className="card flush">
          <div className="card-head">
            <h3>Game log</h3>
            <div className="toggle">{logSeasons.map((y) => <button key={y} className={logSeason === y ? 'on' : ''} onClick={() => setLogSeason(y)}>{y}</button>)}</div>
          </div>
          <Table cols={gameCols} rows={logRows}
            lead={[
              { label: 'Wk', render: (r) => (r.type === 'POST' ? `P${r.week}` : r.week) },
              { label: 'Opp', render: (r) => `${r.home === false ? '@' : ''}${r.opp}` },
              { label: 'Result', render: (r) => (r.result ? <span className={`res ${String(r.result)[0]}`}>{r.result}</span> : '–') },
            ]} />
        </section>
      )}

      {view === 'splits' && role && d.splits?.[role] && (
        <section className="card flush">
          <div className="card-head">
            <h3>{SPLIT_ROLE[role].title} by situation · {team.season}</h3>
            {splitRoles.length > 1 && <div className="toggle">{splitRoles.map((r) => <button key={r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>{SPLIT_ROLE[r].title}</button>)}</div>}
          </div>
          <div className="table-wrap scroll">
            <table className="stat-table">
              <thead><tr><th className="lead">Situation</th><th title="Volume">{SPLIT_ROLE[role].plays}</th>{role !== 'rush' && <th title="Completions">Cmp</th>}<th>Yds</th><th>TD</th><th title="First downs">1D</th><th title="Expected points added">EPA</th><th title="EPA per play">EPA/play</th></tr></thead>
              <tbody>
                {SPLIT_ROWS.filter(([k]) => d.splits![role][k]).map(([k, label]) => {
                  const s = d.splits![role][k]
                  return <tr key={k} className={k === 'redZone' || k === 'q1' || k === 'leading' ? 'sep' : ''}><td className="lead">{label}</td><td>{s.plays}</td>{role !== 'rush' && <td>{s.cmp}</td>}<td>{s.yds}</td><td>{s.td}</td><td>{s.first}</td><td>{num(s.epa, 1)}</td><td>{num(s.epa / s.plays, 2)}</td></tr>
                })}
              </tbody>
            </table>
          </div>
          <p className="faint small pad">Built from play-by-play. EPA is expected points added: how much each play changed Detroit’s expected score.</p>
        </section>
      )}
      <p className="source">Statistics: nflverse open data, updated after each game. Totals can differ by a tackle or two from other sites’ scoring.</p>
    </>
  )
}
