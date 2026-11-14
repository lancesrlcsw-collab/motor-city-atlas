import { useState } from 'react'
import type { Dossier, StatLine } from '../types'
import { useStore } from '../store'
import { INDEX_NAME, dateShort, money, moneyLong, num, ordinal, timeAgo } from '../lib/format'
import { Dial, LaneBars, PercentileRows, StackedColumns, ZoneGrid } from './charts'
import { NGS_LABELS, PFR_LABELS } from './statColumns'
import { IconExternal } from './icons'

// ---------------------------------------------------------------- Advanced

/** Metrics down the side, the last few seasons across the top. */
function HistoryTable({ title, source, data, labels }: { title: string; source: string; data?: Record<string, StatLine>; labels: [string, string, number?][] }) {
  if (!data) return null
  const years = Object.keys(data).map(Number).sort((a, b) => b - a).slice(0, 4).reverse()
  const rows = labels.filter(([k]) => years.some((y) => data[y]?.[k] !== undefined))
  if (!rows.length) return null
  return (
    <section className="card flush">
      <div className="card-head"><h3>{title}</h3><span className="faint small">{source}</span></div>
      <div className="table-wrap scroll">
        <table className="stat-table wide-lead">
          <thead><tr><th className="lead">Measure</th>{years.map((y) => <th key={y}>{y}</th>)}</tr></thead>
          <tbody>
            {rows.map(([k, label, digits]) => (
              <tr key={k}><td className="lead">{label}</td>{years.map((y) => <td key={y} className={y === years.at(-1) ? 'now' : ''}>{data[y]?.[k] !== undefined ? num(data[y][k], digits ?? (Number.isInteger(data[y][k]) ? 0 : 1)) : '–'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function AdvancedTab({ d }: { d: Dossier }) {
  const overlay = useStore((s) => s.overlay)
  const setOverlay = useStore((s) => s.setOverlay)
  const p = d.percentiles
  const zones = d.zones
  const ranked = p?.metrics.filter((m) => m.pct !== undefined && m.pct !== null) ?? []
  const [zoneKind, setZoneKind] = useState<'pass' | 'recv' | 'rush'>(zones?.pass ? 'pass' : zones?.recv ? 'recv' : 'rush')
  const kinds = (['pass', 'recv', 'rush'] as const).filter((k) => zones?.[k] && Object.keys(zones[k]!).length > 1)
  const qbr = d.advanced?.qbr
  return (
    <>
      <section className="card">
        <div className="card-head">
          <h3>Where he ranks</h3>
          {p?.index !== undefined && <Dial value={p.index} size={78} />}
        </div>
        {!p && <p className="muted">No league-wide statistics on file for {d.first} this season.</p>}
        {p && !p.qualified && <p className="muted">Not enough volume to rank yet: the comparison group is {p.poolLabel} with {p.qualifier}. His numbers are listed without percentiles.</p>}
        {p && p.qualified && <p className="muted">Percentile among the {p.poolSize} {p.poolLabel} with {p.qualifier}. 50 is the league median; higher is always better, including for stats where a lower number is good.</p>}
        {p && <PercentileRows metrics={p.metrics} />}
        {p && ranked.length > 0 && (
          <div className="viz-legend spaced">
            <span><i className="box" style={{ background: 'var(--div-lo2)' }} />Bottom fifth</span><span><i className="box" style={{ background: 'var(--div-lo1)' }} />Below average</span>
            <span><i className="box" style={{ background: 'var(--div-mid)' }} />Average</span><span><i className="box" style={{ background: 'var(--div-hi1)' }} />Above average</span><span><i className="box" style={{ background: 'var(--div-hi2)' }} />Top fifth</span>
          </div>
        )}
        <p className="faint small">The {INDEX_NAME} averages the percentiles of a position’s core stats. It is our own composite of open data — not a PFF grade.</p>
      </section>

      {kinds.length > 0 && zones && (
        <section className="card">
          <div className="card-head">
            <h3>Where the ball goes</h3>
            {kinds.length > 1 && <div className="toggle">{kinds.map((k) => <button key={k} className={zoneKind === k ? 'on' : ''} onClick={() => setZoneKind(k)}>{k === 'pass' ? 'Passing' : k === 'recv' ? 'Targets' : 'Runs'}</button>)}</div>}
          </div>
          {zoneKind === 'rush' && zones.rush ? <LaneBars lanes={zones.rush} /> : <ZoneGrid zones={(zoneKind === 'pass' ? zones.pass : zones.recv) || {}} noun={zoneKind === 'pass' ? 'Passing' : 'Receiving'} />}
          <div className="chips">
            <button className={`chip${overlay === zoneKind ? ' on' : ''}`} onClick={() => setOverlay(overlay === zoneKind ? null : zoneKind)}>{overlay === zoneKind ? 'Remove from the field' : 'Project onto the 3D field'}</button>
          </div>
        </section>
      )}

      <HistoryTable title="Next Gen Stats · passing" source="NFL player tracking" data={d.advanced?.ngs?.passing} labels={NGS_LABELS.passing} />
      <HistoryTable title="Next Gen Stats · receiving" source="NFL player tracking" data={d.advanced?.ngs?.receiving} labels={NGS_LABELS.receiving} />
      <HistoryTable title="Next Gen Stats · rushing" source="NFL player tracking" data={d.advanced?.ngs?.rushing} labels={NGS_LABELS.rushing} />
      <HistoryTable title="Charting · passing" source="Pro Football Reference" data={d.advanced?.pfr?.passing} labels={PFR_LABELS.passing} />
      <HistoryTable title="Charting · rushing" source="Pro Football Reference" data={d.advanced?.pfr?.rushing} labels={PFR_LABELS.rushing} />
      <HistoryTable title="Charting · receiving" source="Pro Football Reference" data={d.advanced?.pfr?.receiving} labels={PFR_LABELS.receiving} />
      <HistoryTable title="Charting · defense" source="Pro Football Reference" data={d.advanced?.pfr?.defense} labels={PFR_LABELS.defense} />
      {qbr && <HistoryTable title="ESPN Total QBR" source="ESPN" data={qbr} labels={[['qbr', 'Total QBR', 1], ['rank', 'League rank'], ['plays', 'Action plays'], ['epa', 'Total EPA', 1], ['ptsAdded', 'Points added', 1]]} />}

      {d.combine && (
        <section className="card">
          <div className="card-head"><h3>Combine · {d.combine.year}</h3><span className="faint small">{d.combine.position}{d.combine.school ? ` · ${d.combine.school}` : ''}</span></div>
          <PercentileRows metrics={d.combine.drills.map((x) => ({ key: x.key, label: `${x.label} (${x.unit})`, format: x.unit === 'sec' ? 'dec2' : x.unit === 'reps' ? 'int' : 'dec1', direction: 'high', value: x.value, pct: x.pct }))} />
          <p className="faint small">{d.combine.poolNote}. Faster times rank higher.</p>
        </section>
      )}

      <section className="card quiet">
        <h3>PFF grades</h3>
        <p className="muted">PFF’s play-by-play grades are a licensed product, so they are not republished here. The site is built to display them the moment a licensed feed is connected.</p>
        {d.links?.pff && <div className="links"><a href={d.links.pff} target="_blank" rel="noreferrer">{d.name} on PFF<IconExternal /></a></div>}
      </section>
      <p className="source">Tracking: NFL Next Gen Stats. Charting: Pro Football Reference. Both via nflverse. Where sources chart a play differently, their totals can differ slightly from the box score.</p>
    </>
  )
}

// ---------------------------------------------------------------- Contract

const CONTRACT_SERIES = [
  { key: 'base', label: 'Base salary', color: 'var(--viz-1)' },
  { key: 'prorated', label: 'Prorated signing bonus', color: 'var(--viz-2)' },
  { key: 'bonus', label: 'Roster, option and other bonuses', color: 'var(--viz-3)' },
]

export function ContractTab({ d }: { d: Dossier }) {
  const team = useStore((s) => s.team)!
  const c = d.contract
  if (!c) return <section className="card"><h3>Contract</h3><p className="muted">No contract is on file for {d.name} yet. Recently signed players usually appear within a few days.</p></section>
  const seasons = (c.seasons || []).filter((s) => (s.cap ?? 0) > 0 || (s.cash ?? 0) > 0)
  const first = Math.max(team.season - 3, Math.min(...seasons.map((s) => s.year)))
  const shown = seasons.filter((s) => s.year >= first)
  const stack = shown.map((s) => {
    const bonus = (s.roster ?? 0) + (s.option ?? 0) + (s.workout ?? 0) + (s.perGame ?? 0) + (s.other ?? 0)
    const parts = [{ key: 'base', value: s.base ?? 0 }, { key: 'prorated', value: s.prorated ?? 0 }, { key: 'bonus', value: bonus }]
    const sum = parts.reduce((t, x) => t + x.value, 0)
    // If the published pieces do not add up to the cap number (void-year accelerations), show the remainder with the bonus money.
    if ((s.cap ?? 0) - sum > 0.01) parts[1].value += (s.cap ?? 0) - sum
    return { label: String(s.year), parts, total: s.cap ?? 0, faded: !!s.void, flag: s.void ? 'void year' : s.team && s.team !== 'Lions' ? s.team : undefined }
  })
  const leagueCap = team.cap?.leagueCap as number | undefined
  const tiles: [string, string, string?][] = [
    ['Total value', money(c.value), c.years ? `${c.years}-year ${c.type ? c.type.toLowerCase() : 'deal'}, signed ${c.yearSigned}` : undefined],
    ['Average per year', money(c.apy), c.apyRank ? `${ordinal(c.apyRank.rank)} of ${c.apyRank.of} at ${c.apyRank.position} league-wide` : undefined],
    ['Guaranteed', money(c.guaranteed), c.value && c.guaranteed ? `${Math.round((c.guaranteed / c.value) * 100)}% of the total` : undefined],
    [`${team.season} cap number`, c.capHit !== undefined ? money(c.capHit) : 'Not published', c.capHit !== undefined && leagueCap ? `${((c.capHit / leagueCap) * 100).toFixed(1)}% of the cap${c.capRank ? ` · ${ordinal(c.capRank)} on the team` : ''}` : 'Year-by-year figures pending'],
    ['Under contract through', c.throughYear ? String(c.throughYear) : '—', c.freeAgentYear ? `Free agent in ${c.freeAgentYear}` : undefined],
    ['Career earnings', money(c.careerCash), `Cash paid through ${team.season}`],
  ]
  return (
    <>
      <section className="tiles">
        {tiles.map(([label, value, sub]) => <div className="tile" key={label}><span>{label}</span><b>{value}</b>{sub && <em>{sub}</em>}</div>)}
      </section>

      {stack.length > 0 && (
        <section className="card">
          <h3>Cap number by year</h3>
          <p className="muted">What each season costs against the salary cap, and what it is made of. Faded columns are void years that only carry leftover bonus money.</p>
          <StackedColumns data={stack} series={CONTRACT_SERIES} format={(v) => money(v, v >= 10 ? 0 : 1)} highlight={String(team.season)} ariaLabel={`${d.name} cap number by year`} />
        </section>
      )}

      {shown.length > 0 && (
        <section className="card flush">
          <div className="card-head"><h3>Year by year</h3><span className="faint small">$ millions</span></div>
          <div className="table-wrap scroll">
            <table className="stat-table">
              <thead><tr><th className="lead">Year</th><th title="Base salary">Base</th><th title="Prorated signing bonus">Prorated</th><th title="Roster, option, workout and other bonuses">Bonuses</th><th title="Guaranteed salary">Gtd</th><th title="Salary-cap number">Cap</th><th title="Share of the team’s cap">Cap %</th><th title="Cash paid that year">Cash</th></tr></thead>
              <tbody>
                {seasons.map((s) => (
                  <tr key={s.year} className={s.year === team.season ? 'current' : s.void ? 'post' : ''}>
                    <td className="lead">{s.year}{s.void ? ' · void' : ''}</td>
                    <td>{num(s.base ?? 0, 2)}</td><td>{num(s.prorated ?? 0, 2)}</td>
                    <td>{num((s.roster ?? 0) + (s.option ?? 0) + (s.workout ?? 0) + (s.perGame ?? 0) + (s.other ?? 0), 2)}</td>
                    <td>{num(s.guaranteed ?? 0, 2)}</td><td><b>{num(s.cap ?? 0, 2)}</b></td><td>{s.capPct !== undefined ? `${(s.capPct * 100).toFixed(1)}%` : '–'}</td><td>{num(s.cash ?? 0, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {c.history && c.history.length > 0 && (
        <section className="card">
          <h3>Every contract</h3>
          <ul className="deals">
            {[...c.history].reverse().map((h, i) => (
              <li key={i}>
                <div><b>{h.yearSigned}</b> · {h.team} · {h.type}{h.status ? <span className={`pill ${h.status === 'Active' ? 'ok' : 'muted'}`}>{h.status}</span> : null}</div>
                <div className="muted">{h.years} {h.years === 1 ? 'year' : 'years'}, {money(h.total)} total · {money(h.apy)} per year · {money(h.guarantees)} guaranteed{h.earned !== undefined ? ` · ${money(h.earned)} earned` : ''}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {c.cashThisYear !== undefined && <p className="source">Cash due this season: {moneyLong(c.cashThisYear)}. Contract figures: OverTheCap, as published in the nflverse contracts release. Cap % is OverTheCap’s share of the club’s adjusted cap.</p>}
    </>
  )
}

// ---------------------------------------------------------------- Story

export function StoryTab({ d }: { d: Dossier }) {
  const w = d.wiki
  const [open, setOpen] = useState<Record<string, boolean>>({ personal: true, early: true })
  const order = ['personal', 'early', 'college', 'career', 'awards']
  const sections = [...(w?.sections || [])].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  return (
    <>
      {!w && (
        <section className="card"><h3>Background</h3><p className="muted">There is no Wikipedia article for {d.name} yet, which is common for rookies and practice-squad players. Sourced background will appear here when one is published.</p></section>
      )}
      {w?.intro && (
        <section className="card">
          <h3>{w.description ? w.description.replace(/^./, (c) => c.toUpperCase()) : 'Background'}</h3>
          {w.intro.split('\n').filter(Boolean).map((t, i) => <p className="prose" key={i}>{t}</p>)}
        </section>
      )}
      {(w?.family?.length || (w?.social && Object.keys(w.social).length)) ? (
        <section className="card">
          <h3>Family and public accounts</h3>
          {w?.family && w.family.length > 0 && (
            <ul className="family">
              {w.family.map((f) => (
                <li key={f.relation + f.name}>
                  <span className="eyebrow">{f.relation}</span>
                  {f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a> : <b>{f.name}</b>}
                  {f.description && <span className="muted"> · {f.description}</span>}
                </li>
              ))}
            </ul>
          )}
          {w?.social && (
            <div className="links">
              {w.social.instagram && <a href={`https://www.instagram.com/${w.social.instagram}`} target="_blank" rel="noreferrer">Instagram @{w.social.instagram}<IconExternal /></a>}
              {w.social.x && <a href={`https://x.com/${w.social.x}`} target="_blank" rel="noreferrer">X @{w.social.x}<IconExternal /></a>}
            </div>
          )}
          <p className="faint small">Relatives and accounts as recorded on Wikidata. Only people already named in public reference sources are listed.</p>
        </section>
      ) : null}
      {sections.map((s) => (
        <section className="card fold" key={s.title}>
          <button className="fold-head" aria-expanded={!!open[s.key]} onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))}><h3>{s.title}</h3><span>{open[s.key] ? '–' : '+'}</span></button>
          {open[s.key] && s.text.split('\n').filter(Boolean).map((t, i) => (/^[A-Z0-9 ,'’&-]{4,60}$/.test(t) ? <h4 key={i}>{t.toLowerCase().replace(/^./, (c) => c.toUpperCase())}</h4> : <p className="prose" key={i}>{t}</p>))}
        </section>
      ))}
      {d.transactions && d.transactions.length > 0 && (
        <section className="card">
          <h3>Roster moves this season</h3>
          <ul className="feed">{d.transactions.map((t, i) => <li key={i}><time>{dateShort(t.date)}</time><span>{t.text}</span></li>)}</ul>
        </section>
      )}
      {w?.url && <p className="source">Background text from <a href={w.url} target="_blank" rel="noreferrer">Wikipedia: {w.title}</a>, used under CC BY-SA 4.0 and shown as published{w.touched ? ` (article last edited ${dateShort(w.touched)})` : ''}. This site adds no reporting of its own about players’ private lives.</p>}
    </>
  )
}

// ---------------------------------------------------------------- News

export function NewsTab({ d }: { d: Dossier }) {
  const news = d.news || []
  return (
    <>
      <section className="card">
        <h3>Headlines</h3>
        {news.length === 0 && <p className="muted">No recent stories are tagged to {d.name}.</p>}
        <ul className="news">
          {news.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noreferrer">{n.headline}</a>
              {n.description && <p className="muted">{n.description}</p>}
              <span className="faint small">{n.source}{n.published ? ` · ${timeAgo(n.published)}` : ''}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="source">Headlines link to the original reporting at ESPN. Stories are listed when ESPN tags them to this player.</p>
    </>
  )
}
