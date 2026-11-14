import { useEffect, useState } from 'react'
import { useStore, type Panel } from '../store'
import type { CompareRow, Game, TeamData } from '../types'
import { countdown, dateShort, kickoffLocal, num, ordinal, signed } from '../lib/format'
import { IconClose } from './icons'
import { Legend, RankPair, WinProbability } from './charts'
import { AboutPanel, CapPanel, HealthPanel, MovesPanel } from './TeamMore'

const TITLES: Record<Panel, [string, string]> = {
  matchup: ['This week', 'Matchup'],
  season: ['2026', 'Season'],
  cap: ['Salary cap', 'The money'],
  health: ['Availability', 'Health report'],
  news: ['Transactions and headlines', 'Moves'],
  sources: ['About this site', 'Sources and method'],
}

const record = (r?: { wins: number; losses: number; ties?: number } | null) => (r ? `${r.wins}–${r.losses}${r.ties ? `–${r.ties}` : ''}` : '')
const nick = (name: string) => name.split(' ').pop() as string

export function PlayerLink({ slug, children }: { slug?: string; children: React.ReactNode }) {
  const select = useStore((s) => s.select)
  const known = useStore((s) => (slug ? s.bySlug.has(slug) : false))
  if (!slug || !known) return <>{children}</>
  return <button className="plink" onClick={() => select(slug)}>{children}</button>
}

/** Find a roster slug from a display name (used for ESPN lists that carry names only). */
export function useSlugByName() {
  const roster = useStore((s) => s.roster)
  return (name?: string | null) => roster.find((p) => p.name === name)?.slug
}

function CompareTable({ title, rows, opp, usUnit, themUnit }: { title: string; rows: CompareRow[]; opp: string; usUnit: string; themUnit: string }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <p className="muted">Detroit’s {usUnit} against {opp}’s {themUnit}. Dots show each side’s league rank; left is better.</p>
      <Legend items={[{ color: 'var(--viz-1)', label: `Detroit ${usUnit}`, shape: 'dot' }, { color: '#b9c4ce', label: `${opp} ${themUnit}`, shape: 'dot' }]} />
      <div className="cmp" role="table">
        <div className="cmp-row head" role="row"><span /><span>DET</span><span className="scale"><em>1st</em><em>16th</em><em>32nd</em></span><span>{opp}</span></div>
        {rows.map((r) => (
          <div className="cmp-row" role="row" key={r.label}>
            <span className="cmp-label" role="rowheader">{r.label}</span>
            <span className="cmp-val" role="cell"><b>{num(r.det, Math.abs(r.det) < 1 ? 3 : Number.isInteger(r.det) ? 0 : 1)}</b><em>{ordinal(r.detRank)}</em></span>
            <span role="cell"><RankPair a={r.detRank} b={r.oppRank} aLabel="Detroit" bLabel={opp} /></span>
            <span className="cmp-val" role="cell"><b>{num(r.opp, Math.abs(r.opp) < 1 ? 3 : Number.isInteger(r.opp) ? 0 : 1)}</b><em>{ordinal(r.oppRank)}</em></span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Matchup({ team }: { team: TeamData }) {
  const m = team.matchup
  const slugOf = useSlugByName()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id) }, [])
  if (!m) return <section className="card"><h3>Season complete</h3><p className="muted">There is no upcoming game on the schedule.</p></section>
  const cd = countdown(m.kickoff, now)
  const p = m.projection
  const oppNick = nick(m.oppName)
  const oppPlace = m.oppName.replace(` ${oppNick}`, '')
  return (
    <>
      <section className="hero" style={{ ['--opp' as any]: m.oppColor || '#64748b' }}>
        <div className="eyebrow">Week {m.week} · {kickoffLocal(m.kickoff) || `${m.weekday} ${m.timeET} ET`}{cd ? ` · kickoff in ${cd}` : ''}</div>
        <div className="hero-teams">
          <div><span className="hero-rec">{record(team.team.record)}</span><h2>Detroit</h2><span className="muted">{team.team.standing}</span></div>
          <span className="hero-vs">{m.neutral ? 'vs' : m.home ? 'vs' : 'at'}</span>
          <div className="them"><span className="hero-rec">{record(m.oppRecord)}</span><h2>{m.oppName.replace(` ${oppNick}`, '')}</h2><span className="muted">{oppNick}{m.oppRecord?.division ? ` · ${m.oppRecord.division}` : ''}</span></div>
        </div>
        <div className="hero-meta">
          <span>{m.venue}{m.city ? `, ${m.city}` : ''}{m.neutral ? ' · neutral site' : ''}</span>
          {m.tv?.length ? <span>TV: {m.tv.join(', ')}</span> : null}
          {m.roof ? <span>{m.roof === 'dome' || m.roof === 'closed' ? 'Indoors' : 'Outdoors'}{m.surface ? ` · ${m.surface.replace('fieldturf', 'FieldTurf').replace('a_turf', 'A-Turf').replace('grass', 'grass')}` : ''}</span> : null}
          {m.oppCoach ? <span>Opposing coach: {m.oppCoach}{m.oppQb ? ` · QB ${m.oppQb}` : ''}</span> : null}
        </div>
      </section>

      <section className="tiles three">
        {p && (
          <div className="tile wide">
            <span>Win projection</span>
            <div className="segbar" role="img" aria-label={`Detroit ${p.det} percent, ${oppNick} ${p.opp} percent`}>
              <i className="us" style={{ flex: p.det }}><b>DET {num(p.det, 1)}%</b></i>
              <i className="them" style={{ flex: p.opp }}><b>{m.opp} {num(p.opp, 1)}%</b></i>
            </div>
            <em>{p.source}</em>
          </div>
        )}
        {m.line !== undefined && <div className="tile"><span>Point spread</span><b>{m.line === 0 ? 'Pick ’em' : `DET ${signed(m.line, 1)}`}</b><em>{m.oddsProvider ? `Consensus line via ${m.oddsProvider}` : 'Closing line'}</em></div>}
        {m.total !== undefined && <div className="tile"><span>Over / under</span><b>{num(m.total, 1)}</b><em>Projected combined points</em></div>}
      </section>

      {m.compare && (
        <div className="two-col">
          <CompareTable title="When Detroit has the ball" rows={m.compare.detOffense} opp={m.opp} usUnit="offense" themUnit="defense" />
          <CompareTable title={`When ${oppPlace} has the ball`} rows={m.compare.detDefense} opp={m.opp} usUnit="defense" themUnit="offense" />
        </div>
      )}

      <div className="two-col">
        <section className="card">
          <h3>Statistical leaders</h3>
          <table className="plain">
            <thead><tr><th /><th>Detroit</th><th>{oppNick}</th></tr></thead>
            <tbody>
              {(m.leaders?.det || []).map((l: any, i: number) => {
                const o = m.leaders?.opp?.[i]
                return (
                  <tr key={l.category}>
                    <th>{l.category.replace(' Yards', '')}</th>
                    <td><PlayerLink slug={slugOf(l.name)}>{l.name}</PlayerLink><em>{l.line}</em></td>
                    <td>{o?.name}<em>{o?.line}</em></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h3>Injury report</h3>
          <div className="inj-cols">
            {([['Detroit', m.injuries?.det], [oppNick, m.injuries?.opp]] as const).map(([label, list]) => (
              <div key={label}>
                <div className="eyebrow">{label}</div>
                {(!list || list.length === 0) && <p className="faint small">No one listed.</p>}
                <ul className="inj">
                  {(list || []).map((i: any) => (
                    <li key={i.name}>
                      <span><PlayerLink slug={slugOf(i.name)}>{i.name}</PlayerLink>{i.position ? <em> {i.position}</em> : null}</span>
                      <span className={`pill ${/out|reserve|doubt/i.test(i.status) ? 'out' : 'warn'}`}>{i.status}{i.type ? ` · ${i.type}` : ''}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="two-col">
        <section className="card">
          <h3>Recent form</h3>
          {([['Detroit', m.lastFive?.det], [oppNick, m.lastFive?.opp]] as const).map(([label, games]) => (
            <div className="form" key={label}>
              <span className="eyebrow">{label}</span>
              <div>{(games || []).map((g: any, i: number) => <span key={i} className={`formchip ${g.result}`} title={`${g.at ? 'at' : 'vs'} ${g.opp}`}><b>{g.result}</b>{g.score}<em>{g.at ? '@' : 'v'}{g.opp}</em></span>)}</div>
            </div>
          ))}
        </section>
        <section className="card">
          <h3>Series history</h3>
          <p className="muted">Since {m.history.since}: Detroit {m.history.record.W}–{m.history.record.L}{m.history.record.T ? `–${m.history.record.T}` : ''} against {oppNick}.</p>
          <ul className="feed">
            {m.history.meetings.slice(0, 6).map((g: any) => (
              <li key={g.date}><time>{g.season}</time><span><b className={`res ${g.outcome}`}>{g.outcome}</b> {g.us}–{g.them} {g.home ? 'at home' : 'on the road'}{g.type !== 'REG' ? ' · playoffs' : ` · week ${g.week}`}</span></li>
            ))}
          </ul>
        </section>
      </div>
      <p className="source">Rankings are computed from this season’s play-by-play (nflverse). EPA is expected points added per play; success rate is the share of plays that improved the offense’s expected score. Projection, line and injury designations: ESPN.</p>
    </>
  )
}

function GameRow({ g, open, onToggle }: { g: Game; open: boolean; onToggle: () => void }) {
  const done = !!g.result
  return (
    <li className={`game${open ? ' open' : ''}${done ? '' : ' upcoming'}`}>
      <button className="game-head" onClick={onToggle} aria-expanded={open} disabled={!done}>
        <span className="g-wk">{g.week}</span>
        <span className="g-date">{dateShort(g.date)}</span>
        <span className="g-opp"><i style={{ background: g.oppColor || '#64748b' }} />{g.home ? 'vs' : 'at'} {g.oppName}{g.neutral ? <em> · {g.city?.split(',')[0]}</em> : null}</span>
        {done
          ? <span className={`g-res ${g.result!.outcome}`}><b>{g.result!.outcome}</b> {g.result!.us}–{g.result!.them}{g.result!.overtime ? ' OT' : ''}</span>
          : <span className="g-res when">{g.kickoff ? new Date(g.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : `${g.weekday.slice(0, 3)} ${g.timeET} ET`}{g.tv?.length ? ` · ${g.tv[0]}` : ''}</span>}
        <span className="g-line">{g.line !== undefined && g.line !== null ? (g.line === 0 ? 'PK' : `DET ${signed(g.line, 1)}`) : ''}</span>
      </button>
      {open && done && g.wp && (
        <div className="game-body">
          <div className="eyebrow">Detroit win probability, play by play</div>
          <WinProbability points={g.wp} marks={(g.turningPoints || []).map((p) => ({ t: p.t ?? 0, text: p.text.replace(/^\(\d+:\d+\)\s*/, ''), delta: p.wpa }))} ariaLabel={`Win probability, week ${g.week} ${g.home ? 'vs' : 'at'} ${g.opp}`} />
          {g.turningPoints && g.turningPoints.length > 0 && (
            <ol className="plays tight">
              {g.turningPoints.map((p, i) => (
                <li key={i} className={(p.wpa ?? 0) >= 0 ? '' : 'neg'}>
                  <div className="play-meta"><span>Q{p.qtr} {p.time}</span><b>{(p.wpa ?? 0) >= 0 ? '+' : ''}{Math.round((p.wpa ?? 0) * 100)}%</b></div>
                  <p>{p.text.replace(/^\(\d+:\d+\)\s*/, '').replace(/\(Shotgun\)\s*/, '')}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  )
}

function Season({ team }: { team: TeamData }) {
  const r = team.team.record
  const played = team.schedule.filter((g) => g.result)
  const [open, setOpen] = useState<number | null>(played.at(-1)?.week ?? null)
  const division = team.standings.find((d) => d.name === team.team.division)
  const conf = division?.conference
  const seeds = team.standings.filter((d) => d.conference === conf).flatMap((d) => d.teams).filter((t) => t.seed && t.seed <= 7).sort((a, b) => (a.seed ?? 9) - (b.seed ?? 9))
  const me = team.ranks.teams[team.team.abbr]
  const rankRows = (unit: 'off' | 'def') => Object.entries(team.ranks.labels[unit]).map(([k, label]) => ({ k, label, v: me?.[unit]?.[k], rank: me?.[`${unit}Rank`]?.[k] })).filter((x) => x.v !== undefined && x.v !== null)
  return (
    <>
      <section className="tiles four">
        <div className="tile"><span>Record</span><b>{record(r)}</b><em>{team.team.standing}{team.team.seed ? ` · No. ${team.team.seed} seed today` : ''}</em></div>
        <div className="tile"><span>Points</span><b>{r.pointsFor}–{r.pointsAgainst}</b><em>{signed((r.pointsFor - r.pointsAgainst) / Math.max(1, played.length), 1)} per game</em></div>
        <div className="tile"><span>Home · road</span><b>{r.home[0]}–{r.home[1]} · {r.road[0]}–{r.road[1]}</b><em>Division {r.division[0]}–{r.division[1]}</em></div>
        <div className="tile"><span>Streak</span><b>{r.streak?.replace('W', 'Won ').replace('L', 'Lost ') ?? '—'}</b><em>Last five: {r.last5.join(' ')}</em></div>
      </section>

      <section className="card flush">
        <div className="card-head"><h3>Schedule and results</h3><span className="faint small">Select a finished game for its win-probability story</span></div>
        <ol className="games">
          {team.schedule.map((g) => <GameRow key={g.id} g={g} open={open === g.week} onToggle={() => setOpen(open === g.week ? null : g.week)} />)}
          {team.team.bye ? <li className="game bye"><span className="g-wk">{team.team.bye}</span><span className="g-date" /><span className="g-opp faint">Bye week</span></li> : null}
        </ol>
      </section>

      <div className="two-col">
        {division && (
          <section className="card flush">
            <div className="card-head"><h3>{division.name}</h3></div>
            <div className="table-wrap scroll">
              <table className="stat-table">
                <thead><tr><th className="lead">Team</th><th>W</th><th>L</th><th>T</th><th title="Points for">PF</th><th title="Points against">PA</th><th title="Division record">Div</th><th title="Streak">Strk</th></tr></thead>
                <tbody>{division.teams.map((t) => <tr key={t.abbr} className={t.abbr === team.team.abbr ? 'current' : ''}><td className="lead">{t.name}</td><td>{t.wins}</td><td>{t.losses}</td><td>{t.ties}</td><td>{t.pointsFor}</td><td>{t.pointsAgainst}</td><td>{t.division}</td><td>{t.streak}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}
        {seeds.length > 0 && (
          <section className="card flush">
            <div className="card-head"><h3>{conf} playoff picture</h3><span className="faint small">If the season ended today</span></div>
            <div className="table-wrap scroll">
              <table className="stat-table">
                <thead><tr><th className="lead">Seed</th><th className="lead">Team</th><th>W</th><th>L</th><th>T</th><th>Strk</th></tr></thead>
                <tbody>{seeds.map((t) => <tr key={t.abbr} className={t.abbr === team.team.abbr ? 'current' : ''}><td className="lead">{t.seed}</td><td className="lead">{t.name}</td><td>{t.wins}</td><td>{t.losses}</td><td>{t.ties}</td><td>{t.streak}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {me && (
        <div className="two-col">
          {(['off', 'def'] as const).map((unit) => (
            <section className="card" key={unit}>
              <h3>{unit === 'off' ? 'Offense' : 'Defense'} · league ranks</h3>
              <div className="rankrows" role="table">
                {rankRows(unit).map((x) => (
                  <div className="rankrow" role="row" key={x.k}>
                    <span role="rowheader">{x.label}</span>
                    <span className="mono" role="cell">{num(x.v, Math.abs(x.v) < 1 ? 3 : Number.isInteger(x.v) ? 0 : 1)}</span>
                    <span role="cell"><RankPair a={x.rank} aLabel="Detroit" bLabel="" /></span>
                    <span className="rk" role="cell">{ordinal(x.rank)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="source">Results and betting lines: nflverse schedule data. Win probability: nflfastR model. Standings: ESPN. Ranks are among all 32 clubs, where 1st is always best for that unit.</p>
    </>
  )
}

export function TeamPanel() {
  const panel = useStore((s) => s.panel)
  const team = useStore((s) => s.team)
  const openPanel = useStore((s) => s.openPanel)
  useEffect(() => { document.querySelector('.tp-body')?.scrollTo({ top: 0 }) }, [panel])
  if (!panel || !team) return null
  const [eyebrow, title] = TITLES[panel]
  return (
    <section className="teampanel glass" aria-label={title}>
      <header className="tp-head">
        <div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>
        <button onClick={() => openPanel(null)} aria-label="Close" title="Close (Esc)"><IconClose /></button>
      </header>
      <div className="tp-body scroll">
        {panel === 'matchup' && <Matchup team={team} />}
        {panel === 'season' && <Season team={team} />}
        {panel === 'cap' && <CapPanel team={team} />}
        {panel === 'health' && <HealthPanel team={team} />}
        {panel === 'news' && <MovesPanel team={team} />}
        {panel === 'sources' && <AboutPanel team={team} />}
      </div>
    </section>
  )
}
