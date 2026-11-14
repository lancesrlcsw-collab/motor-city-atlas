import { useState } from 'react'
import { useStore } from '../store'
import type { TeamData } from '../types'
import { GROUP_NAME, INDEX_NAME, SITE_NAME, dateShort, money, num, ordinal, timeAgo } from '../lib/format'
import { Columns, HBars } from './charts'
import { PlayerLink } from './TeamPanel'
import { StatusPill } from './Dossier'
import { IconExternal } from './icons'

// ---------------------------------------------------------------- Cap

export function CapPanel({ team }: { team: TeamData }) {
  const cap = team.cap
  const setLens = useStore((s) => s.setLens)
  const openPanel = useStore((s) => s.openPanel)
  const [all, setAll] = useState(false)
  const pctOfCap = cap.leagueCap ? (cap.committed / cap.leagueCap) * 100 : null
  const units: [string, number, string][] = [['Offense', cap.byUnit.offense, 'var(--viz-1)'], ['Defense', cap.byUnit.defense, 'var(--viz-2)'], ['Specialists', cap.byUnit.special, 'var(--viz-3)']]
  const unitTotal = units.reduce((t, u) => t + u[1], 0)
  const rows = all ? cap.players : cap.players.slice(0, 12)
  return (
    <>
      <section className="tiles four">
        <div className="tile"><span>{cap.season} league cap</span><b>{money(cap.leagueCap)}</b><em>Per club, before carry-over · <a href={cap.leagueCapSource.url} target="_blank" rel="noreferrer">source</a></em></div>
        <div className="tile"><span>Committed to this roster</span><b>{money(cap.committed)}</b><em>{cap.playersCounted} contracts{pctOfCap ? ` · ${pctOfCap.toFixed(0)}% of the base cap` : ''}</em></div>
        <div className="tile"><span>Cash paid this season</span><b>{money(cap.cash)}</b><em>Salaries and bonuses actually paid in {cap.season}</em></div>
        <div className="tile"><span>League rank</span><b>{ordinal(cap.leagueRank)}</b><em>of 32 in cap committed to active contracts</em></div>
      </section>

      <section className="card">
        <div className="card-head"><h3>Where the cap goes</h3><button className="chip" onClick={() => { setLens('cap'); openPanel(null) }}>See it in 3D</button></div>
        <div className="segbar tall" role="img" aria-label={units.map((u) => `${u[0]} ${money(u[1])}`).join(', ')}>
          {units.map(([label, v, color]) => <i key={label} style={{ flex: v, background: color }}>{v / unitTotal > 0.08 && <b>{Math.round((v / unitTotal) * 100)}%</b>}</i>)}
        </div>
        <div className="viz-legend spaced">{units.map(([label, v, color]) => <span key={label}><i className="box" style={{ background: color }} />{label} · {money(v)}</span>)}</div>
        <h4>By position group</h4>
        <HBars
          rows={cap.groups.map((g: any) => ({ label: GROUP_NAME[g.group] || g.group, value: g.total, ref: g.leagueAvg, note: g.leagueRank ? `${ordinal(g.leagueRank)} of 32 · ${g.players} players` : `${g.players} players` }))}
          format={(v) => money(v)} refLabel="League average for that group"
        />
        {cap.impliedTeamCap && <p className="faint small">OverTheCap’s cap percentages imply Detroit’s adjusted cap is about {money(cap.impliedTeamCap, 0)} after carry-over. That figure is derived, not published.</p>}
      </section>

      <div className="two-col">
        <section className="card">
          <h3>Committed by season</h3>
          <p className="muted">Cap already promised to players under contract in each future year.</p>
          <Columns data={cap.future.map((f: any) => ({ label: String(f.year), value: Math.round(f.committed * 10) / 10, note: `${f.players} players under contract` }))} color="var(--viz-money)" format={(v) => money(v, 0)} ariaLabel="Committed cap by season" />
          <table className="plain compact">
            <thead><tr><th>Season</th><th>Committed</th><th>Players</th><th>Largest number</th></tr></thead>
            <tbody>{cap.future.map((f: any) => <tr key={f.year}><th>{f.year}</th><td>{money(f.committed)}</td><td>{f.players}</td><td>{f.top[0] ? <><PlayerLink slug={f.top[0].slug}>{f.top[0].name}</PlayerLink> <em>{money(f.top[0].cap)}</em></> : '—'}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="card">
          <h3>Contracts ending after {cap.season}</h3>
          <p className="muted">{cap.expiring.length} players are due to reach free agency in {cap.season + 1}.</p>
          <ul className="expiring">
            {cap.expiring.slice(0, 24).map((x: any) => <li key={x.slug}><PlayerLink slug={x.slug}>{x.name}</PlayerLink><em>{x.position}</em><span className="mono">{x.capHit !== null && x.capHit !== undefined ? money(x.capHit) : '—'}</span></li>)}
          </ul>
        </section>
      </div>

      <section className="card flush">
        <div className="card-head"><h3>Every cap number</h3><span className="faint small">$ millions · select a player for the full contract</span></div>
        <div className="table-wrap scroll">
          <table className="stat-table">
            <thead><tr><th className="lead">Player</th><th>Pos</th><th title={`${cap.season} cap number`}>Cap</th><th title="Share of the league base cap">% cap</th><th title="Base salary">Base</th><th title="Prorated bonus">Prorated</th><th title="Average per year">APY</th><th title="Guaranteed at signing">Gtd</th><th title="Under contract through">Thru</th></tr></thead>
            <tbody>
              {rows.map((x: any) => (
                <tr key={x.slug}>
                  <td className="lead"><PlayerLink slug={x.slug}>{x.name}</PlayerLink></td><td>{x.position}</td>
                  <td><b>{x.capHit !== null && x.capHit !== undefined ? num(x.capHit, 2) : '–'}</b></td><td>{x.capPct ? `${x.capPct.toFixed(1)}%` : '–'}</td>
                  <td>{num(x.base, 2)}</td><td>{num(x.prorated, 2)}</td><td>{num(x.apy, 2)}</td><td>{num(x.guaranteed, 2)}</td><td>{x.throughYear ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pad"><button className="chip" onClick={() => setAll((v) => !v)}>{all ? 'Show the top 12' : `Show all ${cap.players.length}`}</button></div>
      </section>
      <ul className="notes">{cap.notes.map((n: string) => <li key={n}>{n}</li>)}</ul>
    </>
  )
}

// ---------------------------------------------------------------- Health

export function HealthPanel({ team }: { team: TeamData }) {
  const list = team.injuries || []
  const setLens = useStore((s) => s.setLens)
  const openPanel = useStore((s) => s.openPanel)
  const game = list.filter((i) => i.roster === 'active')
  const reserve = list.filter((i) => i.roster !== 'active')
  const Row = ({ i }: { i: (typeof list)[number] }) => (
    <li>
      <span className="who"><PlayerLink slug={i.slug}>{i.name}</PlayerLink><em>{i.position}</em></span>
      <StatusPill tone={i.tone}>{i.status}</StatusPill>
      <span className="muted">{[i.injury, i.practice?.replace(' in Practice', '').replace(' In Practice', '')].filter(Boolean).join(' · ') || '—'}</span>
    </li>
  )
  return (
    <>
      <section className="tiles three">
        <div className="tile"><span>Game-status designations</span><b>{game.length}</b><em>Week {team.week} report</em></div>
        <div className="tile"><span>On reserve lists</span><b>{reserve.length}</b><em>Injured reserve, PUP and non-football injury</em></div>
        <div className="tile"><span>See it on the field</span><button className="chip" onClick={() => { setLens('health'); openPanel(null) }}>Open the health lens</button><em>Colors every player by availability</em></div>
      </section>
      <section className="card">
        <h3>This week</h3>
        {game.length === 0 ? <p className="muted">No active-roster player carries a game designation.</p> : <ul className="health">{game.map((i) => <Row key={i.slug} i={i} />)}</ul>}
      </section>
      <section className="card">
        <h3>Reserve lists</h3>
        <ul className="health">{reserve.map((i) => <Row key={i.slug} i={i} />)}</ul>
      </section>
      <p className="source">Designations and practice participation: the NFL’s official injury report via nflverse, and ESPN. Only the designation and listed body part are shown; no medical detail beyond the public report is collected.</p>
    </>
  )
}

// ---------------------------------------------------------------- Moves

export function MovesPanel({ team }: { team: TeamData }) {
  const roster = useStore((s) => s.roster)
  const select = useStore((s) => s.select)
  // Turn any current player's name inside a transaction into a link to his dossier.
  const linkify = (text: string) => {
    const hits = roster.filter((p) => text.includes(p.name)).sort((a, b) => text.indexOf(a.name) - text.indexOf(b.name))
    if (!hits.length) return text
    const out: React.ReactNode[] = []
    let rest = text
    for (const p of hits) {
      const i = rest.indexOf(p.name)
      if (i < 0) continue
      out.push(rest.slice(0, i), <button key={p.slug + i} className="plink" onClick={() => select(p.slug)}>{p.name}</button>)
      rest = rest.slice(i + p.name.length)
    }
    out.push(rest)
    return out
  }
  return (
    <div className="two-col">
      <section className="card">
        <h3>Transactions</h3>
        <ul className="feed">{(team.transactions || []).map((t, i) => <li key={i}><time>{dateShort(t.date)}</time><span>{linkify(t.text)}</span></li>)}</ul>
      </section>
      <section className="card">
        <h3>Headlines</h3>
        <ul className="news">
          {(team.news || []).map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noreferrer">{n.headline}</a>
              {n.description && <p className="muted">{n.description}</p>}
              <span className="faint small">{n.source}{n.published ? ` · ${timeAgo(n.published)}` : ''}</span>
            </li>
          ))}
        </ul>
        <p className="faint small">Headlines link to the original reporting at ESPN.</p>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- About

export function AboutPanel({ team }: { team: TeamData }) {
  return (
    <>
      <section className="card">
        <h3>What this is</h3>
        <p className="prose">{SITE_NAME} is an independent fan project: a 3D model of the {team.season} Detroit roster in which every player stands where the depth chart puts him, at his listed height and build, and opens into a full dossier. It is not affiliated with or endorsed by the Detroit Lions, the NFL or any data provider, and it uses no official logos or photography.</p>
        <p className="prose">Data was last rebuilt {timeAgo(team.generatedAt)} ({new Date(team.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}). It refreshes automatically through the season.</p>
      </section>
      <section className="card">
        <h3>Where the data comes from</h3>
        <ul className="sources">
          {team.sources.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.name}<IconExternal /></a><span>{s.what}{s.license ? ` · ${s.license}` : ''}</span></li>)}
        </ul>
      </section>
      <div className="two-col">
        <section className="card">
          <h3>How to read the numbers</h3>
          <dl className="glossary">
            <dt>{INDEX_NAME}</dt><dd>The average league percentile across a position’s core statistics, among players with enough volume to qualify. Our own composite; not a PFF grade.</dd>
            <dt>Percentile</dt><dd>50 is the league median at that position. Higher is always better, including for stats where a lower raw number is good.</dd>
            <dt>EPA</dt><dd>Expected points added: how much a play changed the offense’s expected score, from nflfastR’s model.</dd>
            <dt>Success rate</dt><dd>The share of plays that improved the offense’s expected points.</dd>
            <dt>Cap number</dt><dd>What a contract counts against the salary cap in a given season, which differs from the cash paid that year.</dd>
            <dt>Win probability</dt><dd>The model’s estimate of Detroit’s chance to win at each moment of a game.</dd>
          </dl>
        </section>
        <section className="card">
          <h3>What is deliberately left out</h3>
          <ul className="insights">
            <li>PFF grades. They are a licensed product; each player links to his PFF page, and the site is ready to show grades if a licensed feed is added.</li>
            <li>Rumors and unsourced claims about players’ private lives. Background text is quoted from Wikipedia with a link, family links come from Wikidata, and headlines link to ESPN’s reporting.</li>
            <li>Details about players’ children, home addresses or anything medical beyond the public injury report.</li>
            <li>Official team marks and player photographs, which belong to the NFL and its partners.</li>
          </ul>
        </section>
      </div>
      <p className="source">Spotted something wrong? Statistics come straight from the sources above and are rebuilt on a schedule, so most errors correct themselves at the next refresh.</p>
    </>
  )
}
