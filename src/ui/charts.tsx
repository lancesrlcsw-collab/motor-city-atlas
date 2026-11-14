// Small, dependency-free chart components. They share a few fixed rules: thin marks with a
// rounded data end, a 2px surface gap between touching marks, hairline grids, values in text
// colours (never the series colour), and a hover/focus tooltip that only repeats what the
// accompanying table already shows.
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { indexColor } from '../lib/lens'
import { epaColor } from '../scene/ZoneOverlay'
import { INDEX_NAME, metricValue, ordinal } from '../lib/format'
import type { Lane, Metric, Zone } from '../types'

// ---------------------------------------------------------------- tooltip plumbing
interface Tip { x: number; y: number; body: ReactNode }

function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: { clientX: number; clientY: number }, body: ReactNode) => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, body })
  }
  const showAt = (el: Element, body: ReactNode) => {
    const r = ref.current?.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    if (r) setTip({ x: b.left + b.width / 2 - r.left, y: b.top - r.top, body })
  }
  const node = tip ? (
    <div className="viz-tip" style={{ left: Math.max(70, Math.min((ref.current?.clientWidth ?? 300) - 70, tip.x)), top: tip.y }} role="status">{tip.body}</div>
  ) : null
  return { ref, show, showAt, hide: () => setTip(null), node }
}

export function Legend({ items }: { items: { color: string; label: string; shape?: 'dot' | 'box' | 'line' }[] }) {
  return (
    <div className="viz-legend">
      {items.map((i) => (
        <span key={i.label}><i className={i.shape || 'box'} style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  )
}

const niceMax = (v: number) => {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

// ---------------------------------------------------------------- columns (single series)
export interface ColumnDatum { label: string; value: number | null; note?: string; muted?: boolean }

export function Columns({ data, height = 132, color = 'var(--viz-1)', format = (v: number) => String(v), max, ariaLabel, labelEvery = 1 }: {
  data: ColumnDatum[]; height?: number; color?: string; format?: (v: number) => string; max?: number; ariaLabel: string; labelEvery?: number
}) {
  const tip = useTip()
  const top = max ?? niceMax(Math.max(...data.map((d) => d.value ?? 0)))
  const ticks = [0, top / 2, top]
  const peak = data.reduce((m, d, i) => ((d.value ?? -1) > (data[m]?.value ?? -1) ? i : m), 0)
  return (
    <div className="viz" ref={tip.ref} role="img" aria-label={ariaLabel}>
      <div className="viz-plot" style={{ height }}>
        <div className="viz-yaxis">{[...ticks].reverse().map((t) => <span key={t}>{format(t)}</span>)}</div>
        <div className="viz-area">
          {ticks.map((t) => <i key={t} className="viz-grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
          <div className="viz-cols">
            {data.map((d, i) => (
              <div
                key={d.label + i} className="viz-col" tabIndex={0}
                onPointerMove={(e) => tip.show(e, <><b>{d.label}</b>{d.value === null ? 'Did not play' : format(d.value)}{d.note ? <em>{d.note}</em> : null}</>)}
                onPointerLeave={tip.hide}
                onFocus={(e) => tip.showAt(e.currentTarget, <><b>{d.label}</b>{d.value === null ? 'Did not play' : format(d.value)}{d.note ? <em>{d.note}</em> : null}</>)}
                onBlur={tip.hide}
              >
                {d.value !== null && d.value > 0 && (
                  <span className="viz-bar" style={{ height: `${(d.value / top) * 100}%`, background: d.muted ? 'var(--viz-quiet)' : color }}>
                    {(i === peak || i === data.length - 1) && <b className="viz-cap">{format(d.value)}</b>}
                  </span>
                )}
                {d.value === null && <span className="viz-none" />}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="viz-xaxis">{data.map((d, i) => <span key={d.label + i}>{i % labelEvery === 0 ? d.label : ''}</span>)}</div>
      {tip.node}
    </div>
  )
}

// ---------------------------------------------------------------- stacked columns
export interface StackDatum { label: string; parts: { key: string; value: number }[]; total: number; faded?: boolean; flag?: string }

export function StackedColumns({ data, series, height = 170, format, ariaLabel, highlight }: {
  data: StackDatum[]; series: { key: string; label: string; color: string }[]; height?: number; format: (v: number) => string; ariaLabel: string; highlight?: string
}) {
  const tip = useTip()
  const top = niceMax(Math.max(...data.map((d) => d.total)))
  const ticks = [0, top / 2, top]
  const body = (d: StackDatum) => (
    <>
      <b>{d.label}{d.flag ? ` · ${d.flag}` : ''}</b>
      {series.map((s) => { const v = d.parts.find((p) => p.key === s.key)?.value ?? 0; return v ? <span key={s.key} className="row"><i style={{ background: s.color }} />{s.label}<u>{format(v)}</u></span> : null })}
      <span className="row total">Cap number<u>{format(d.total)}</u></span>
    </>
  )
  return (
    <div className="viz" ref={tip.ref} role="img" aria-label={ariaLabel}>
      <Legend items={series} />
      <div className="viz-plot" style={{ height }}>
        <div className="viz-yaxis">{[...ticks].reverse().map((t) => <span key={t}>{format(t)}</span>)}</div>
        <div className="viz-area">
          {ticks.map((t) => <i key={t} className="viz-grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
          <div className="viz-cols">
            {data.map((d) => {
              const parts = series.map((s) => ({ ...s, value: d.parts.find((p) => p.key === s.key)?.value ?? 0 })).filter((p) => p.value > 0)
              return (
                <div key={d.label} className={`viz-col${d.label === highlight ? ' now' : ''}`} tabIndex={0}
                  onPointerMove={(e) => tip.show(e, body(d))} onPointerLeave={tip.hide}
                  onFocus={(e) => tip.showAt(e.currentTarget, body(d))} onBlur={tip.hide}>
                  <span className="viz-stack" style={{ height: `${(d.total / top) * 100}%`, opacity: d.faded ? 0.42 : 1 }}>
                    {(d.label === highlight || d.total === Math.max(...data.map((x) => x.total))) && <b className="viz-cap">{format(d.total)}</b>}
                    {[...parts].reverse().map((p, i) => (
                      <i key={p.key} className={i === 0 ? 'top' : ''} style={{ flex: `${p.value} 0 0`, background: p.color }} />
                    ))}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="viz-xaxis">{data.map((d) => <span key={d.label} className={d.label === highlight ? 'now' : ''}>’{d.label.slice(2)}</span>)}</div>
      {tip.node}
    </div>
  )
}

// ---------------------------------------------------------------- percentile meters
export function PercentileRows({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="pct-rows" role="table" aria-label="League percentile ranks">
      {metrics.map((m) => (
        <div className="pct-row" role="row" key={m.key}>
          <span className="pct-label" role="cell">{m.label}</span>
          <span className="pct-value mono" role="cell">{metricValue(m)}</span>
          <span className="pct-meter" role="cell" aria-label={m.pct !== undefined ? `${ordinal(m.pct)} percentile` : 'not ranked'}>
            {m.pct !== undefined && m.pct !== null ? (
              <>
                <i className="mid" />
                <i className="fill" style={{ width: `${Math.max(2, m.pct)}%`, background: m.direction === 'neutral' ? 'var(--viz-quiet)' : indexColor(m.pct) }} />
              </>
            ) : <i className="na" />}
          </span>
          <span className="pct-rank" role="cell">
            {m.pct !== undefined && m.pct !== null ? <><b>{m.pct}</b>{m.rank ? <em>{ordinal(m.rank)} of {m.of}</em> : null}</> : <em>—</em>}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Half-dial for the composite index. */
export function Dial({ value, size = 92, label = INDEX_NAME }: { value?: number | null; size?: number; label?: string }) {
  const r = size / 2 - 7
  const c = Math.PI * r
  const v = value ?? 0
  return (
    <div className="dial" style={{ width: size }} role="img" aria-label={value === null || value === undefined ? `${label}: not ranked` : `${label}: ${value} out of 100`}>
      <svg width={size} height={size / 2 + 8} viewBox={`0 0 ${size} ${size / 2 + 8}`}>
        <path d={`M 7 ${size / 2} A ${r} ${r} 0 0 1 ${size - 7} ${size / 2}`} fill="none" stroke="rgba(150,200,240,0.16)" strokeWidth="7" strokeLinecap="round" />
        {value !== null && value !== undefined && (
          <path d={`M 7 ${size / 2} A ${r} ${r} 0 0 1 ${size - 7} ${size / 2}`} fill="none" stroke={indexColor(value)} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} />
        )}
      </svg>
      <div className="dial-num">{value ?? '—'}</div>
      <div className="dial-label">{label}</div>
    </div>
  )
}

// ---------------------------------------------------------------- win-probability line
export function WinProbability({ points, marks = [], height = 120, ariaLabel }: {
  points: [number, number][]; marks?: { t: number; wp?: number; text: string; delta?: number }[]; height?: number; ariaLabel: string
}) {
  const tip = useTip()
  const W = 600, H = height
  const tMax = Math.max(3600, points.at(-1)?.[0] ?? 3600)
  const X = (t: number) => (t / tMax) * W
  const Y = (wp: number) => H - 6 - wp * (H - 12)
  const path = useMemo(() => points.map(([t, wp], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(wp).toFixed(1)}`).join(' '), [points, tMax, H])
  const [cross, setCross] = useState<number | null>(null)
  const nearest = (t: number) => points.reduce((b, p) => (Math.abs(p[0] - t) < Math.abs(b[0] - t) ? p : b), points[0])
  const clock = (t: number) => { const q = Math.min(5, Math.floor(t / 900) + 1); const left = 900 - (t % 900); return `${q > 4 ? 'OT' : `Q${q}`} ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` }
  const wpAt = (t: number) => nearest(t)[1]
  return (
    <div className="viz wp" ref={tip.ref}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label={ariaLabel}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const t = ((e.clientX - r.left) / r.width) * tMax
          const p = nearest(t)
          setCross(p[0])
          tip.show(e, <><b>{clock(p[0])}</b>Detroit win probability {Math.round(p[1] * 100)}%</>)
        }}
        onPointerLeave={() => { setCross(null); tip.hide() }}>
        {[900, 1800, 2700, 3600].filter((t) => t < tMax).map((t) => <line key={t} x1={X(t)} x2={X(t)} y1={0} y2={H} className="grid" />)}
        <line x1={0} x2={W} y1={Y(0.5)} y2={Y(0.5)} className="axis" />
        <path d={`${path} L${X(points.at(-1)![0])} ${Y(0.5)} L${X(points[0][0])} ${Y(0.5)} Z`} className="wash" />
        <path d={path} className="line" vectorEffect="non-scaling-stroke" />
        {cross !== null && <line x1={X(cross)} x2={X(cross)} y1={0} y2={H} className="cross" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="wp-marks">
        {marks.map((m, i) => (
          <button key={i} className={`wp-mark${(m.delta ?? 0) >= 0 ? ' up' : ' down'}`} style={{ left: `${(m.t / tMax) * 100}%`, top: `${(Y(m.wp ?? wpAt(m.t)) / H) * 100}%` }}
            aria-label={`${clock(m.t)}: ${m.text}`}
            onPointerEnter={(e) => tip.showAt(e.currentTarget, <><b>{clock(m.t)} · {(m.delta ?? 0) >= 0 ? '+' : ''}{Math.round((m.delta ?? 0) * 100)} pts of win probability</b><span className="wrap">{m.text}</span></>)}
            onPointerLeave={tip.hide}
            onFocus={(e) => tip.showAt(e.currentTarget, <><b>{clock(m.t)}</b><span className="wrap">{m.text}</span></>)} onBlur={tip.hide} />
        ))}
      </div>
      <div className="wp-axis"><span>Kickoff</span><span>Half</span><span>Final</span></div>
      {tip.node}
    </div>
  )
}

// ---------------------------------------------------------------- tendency maps
const DEPTHS: [string, string][] = [['deep', '20+ yds'], ['mid', '10–19'], ['short', '0–9'], ['behind', 'Behind LOS']]
const SIDES: [string, string][] = [['left', 'Left'], ['middle', 'Middle'], ['right', 'Right']]

export function ZoneGrid({ zones, noun }: { zones: Record<string, Zone>; noun: string }) {
  const maxAtt = Math.max(1, ...Object.values(zones).map((z) => z.att))
  return (
    <div className="zone-grid" role="table" aria-label={`${noun} by field zone`}>
      <div className="zg-head" role="row"><span />{SIDES.map(([, l]) => <span key={l} role="columnheader">{l}</span>)}</div>
      {DEPTHS.map(([d, dl]) => (
        <div className="zg-row" role="row" key={d}>
          <span className="zg-depth" role="rowheader">{dl}</span>
          {SIDES.map(([s]) => {
            const z = zones[`${s}-${d}`]
            if (!z) return <span key={s} className="zg-cell empty" role="cell">—</span>
            const color = epaColor(z.epa / z.att)
            return (
              <span key={s} className="zg-cell" role="cell" style={{ background: `color-mix(in srgb, ${color} ${Math.round(22 + 46 * (z.att / maxAtt))}%, transparent)`, borderColor: color }}
                title={`${z.cmp} of ${z.att}, ${z.yds} yards, ${z.td} TD, ${z.int} INT, ${z.epa >= 0 ? '+' : ''}${z.epa.toFixed(1)} EPA`}>
                <b>{z.cmp}/{z.att}</b>
                <em>{z.yds} yds{z.td ? ` · ${z.td} TD` : ''}{z.int ? ` · ${z.int} INT` : ''}</em>
              </span>
            )
          })}
        </div>
      ))}
      <div className="zg-key"><i style={{ background: 'var(--div-lo2)' }} />Cost points<i style={{ background: 'var(--div-mid)' }} />Neutral<i style={{ background: 'var(--div-hi2)' }} />Added points<span>EPA per {noun === 'Passing' ? 'attempt' : 'target'} · darker = more volume</span></div>
    </div>
  )
}

const LANE_ORDER: [string, string][] = [['left-end', 'Left end'], ['left-tackle', 'Left tackle'], ['left-guard', 'Left guard'], ['middle', 'Middle'], ['right-guard', 'Right guard'], ['right-tackle', 'Right tackle'], ['right-end', 'Right end']]

export function LaneBars({ lanes }: { lanes: Record<string, Lane> }) {
  const rows = LANE_ORDER.filter(([k]) => lanes[k]).map(([k, label]) => ({ label, ...lanes[k], ypc: lanes[k].yds / lanes[k].att }))
  const max = Math.max(6, ...rows.map((r) => r.ypc))
  return (
    <div className="lane-bars" role="table" aria-label="Rushing by gap">
      {rows.map((r) => (
        <div className="lane-row" role="row" key={r.label}>
          <span className="lane-label" role="rowheader">{r.label}</span>
          <span className="lane-track" role="cell"><i style={{ width: `${Math.max(2, (Math.max(0, r.ypc) / max) * 100)}%`, background: epaColor(r.epa / r.att) }} /></span>
          <span className="lane-val mono" role="cell"><b>{r.ypc.toFixed(1)}</b> ypc</span>
          <span className="lane-sub" role="cell">{r.att} att · {r.yds} yds{r.td ? ` · ${r.td} TD` : ''}</span>
        </div>
      ))}
      <div className="zg-key"><i style={{ background: 'var(--div-lo2)' }} />Cost points<i style={{ background: 'var(--div-mid)' }} />Neutral<i style={{ background: 'var(--div-hi2)' }} />Added points<span>Bar length = yards per carry · color = EPA per carry</span></div>
    </div>
  )
}

// ---------------------------------------------------------------- rank dot plot (1..32)
export function RankPair({ a, b, aLabel, bLabel }: { a?: number; b?: number; aLabel: string; bLabel: string }) {
  const pos = (r?: number) => (r ? `${((r - 1) / 31) * 100}%` : '0%')
  return (
    <span className="rank-pair" role="img" aria-label={`${aLabel} ranks ${ordinal(a)}, ${bLabel} ranks ${ordinal(b)} of 32`}>
      <i className="rail" />
      {b ? <i className="dot them" style={{ left: pos(b) }} /> : null}
      {a ? <i className="dot us" style={{ left: pos(a) }} /> : null}
    </span>
  )
}

/** Horizontal bars for one measure across named groups, with an optional reference tick. */
export function HBars({ rows, format, color = 'var(--viz-money)', refLabel }: {
  rows: { label: string; value: number; ref?: number; note?: string; onClick?: () => void }[]; format: (v: number) => string; color?: string; refLabel?: string
}) {
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.ref ?? 0)))
  return (
    <div className="hbars" role="table">
      {rows.map((r) => (
        <div className="hbar-row" role="row" key={r.label}>
          <span className="hbar-label" role="rowheader">{r.onClick ? <button onClick={r.onClick}>{r.label}</button> : r.label}</span>
          <span className="hbar-track" role="cell">
            <i className="fill" style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: color }} />
            {r.ref !== undefined && <i className="ref" style={{ left: `${(r.ref / max) * 100}%` }} title={`${refLabel}: ${format(r.ref)}`} />}
          </span>
          <span className="hbar-val mono" role="cell">{format(r.value)}</span>
          {r.note !== undefined && <span className="hbar-note" role="cell">{r.note}</span>}
        </div>
      ))}
      {refLabel && <div className="zg-key"><i className="tick" />{refLabel}</div>}
    </div>
  )
}
