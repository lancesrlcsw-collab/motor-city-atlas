import type { Metric } from '../types'

export const SITE_NAME = 'Motor City Atlas'
/** The name of the site's own composite measure (average percentile across a position's core stats). */
export const INDEX_NAME = 'Atlas Index'
/** The wordmark in two parts: the lead words, then the last word, which is set in the accent color. */
export const SITE_MARK: [string, string] = (() => {
  const upper = SITE_NAME.toUpperCase()
  const cut = upper.lastIndexOf(' ')
  return cut < 0 ? [upper, ''] : [upper.slice(0, cut), upper.slice(cut + 1)]
})()

/** Dollar amounts arrive in millions. */
export function money(m?: number | null, digits = 1): string {
  if (m === null || m === undefined || Number.isNaN(m)) return '—'
  if (Math.abs(m) >= 1) return `$${m.toFixed(digits)}M`
  if (m === 0) return '$0'
  return `$${Math.round(m * 1000)}K`
}

export function moneyLong(m?: number | null): string {
  if (m === null || m === undefined || Number.isNaN(m)) return '—'
  return `$${Math.round(m * 1_000_000).toLocaleString('en-US')}`
}

export function height(inches?: number | null): string {
  if (!inches) return '—'
  return `${Math.floor(inches / 12)}′${inches % 12}″`
}

export function num(v: unknown, digits = 0): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v !== 'number') return String(v)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function metricValue(m: Pick<Metric, 'value' | 'format'>): string {
  switch (m.format) {
    case 'int': return num(m.value, Number.isInteger(m.value) ? 0 : 1)
    case 'pct': return `${num(m.value, 1)}%`
    case 'share': return `${num(m.value * 100, 1)}%`
    case 'dec1': return num(m.value, 1)
    case 'dec2': return num(m.value, 2)
    case 'dec3': return num(m.value, 3)
    default: return num(m.value)
  }
}

export function ordinal(n?: number | null): string {
  if (n === null || n === undefined) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function pct(v?: number | null, digits = 0): string {
  if (v === null || v === undefined) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

export function dateShort(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: iso.length === 10 ? 'UTC' : undefined })
}

export function dateLong(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: iso.length === 10 ? 'UTC' : undefined })
}

export function kickoffLocal(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

export function timeAgo(iso?: string): string {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  if (h < 36) return `${h} hr ago`
  return `${Math.round(h / 24)} days ago`
}

export function countdown(iso?: string, now = Date.now()): string | null {
  if (!iso) return null
  let s = Math.floor((new Date(iso).getTime() - now) / 1000)
  if (s <= 0) return null
  const d = Math.floor(s / 86400); s -= d * 86400
  const h = Math.floor(s / 3600); s -= h * 3600
  const m = Math.floor(s / 60)
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${String(m).padStart(2, '0')}m`
}

export const signed = (v?: number | null, digits = 1) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}`)

export const GROUP_NAME: Record<string, string> = {
  QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends', OL: 'Offensive line', DL: 'Defensive line', EDGE: 'Edge rushers',
  LB: 'Linebackers', DB: 'Defensive backs', CB: 'Cornerbacks', S: 'Safeties', ST: 'Specialists',
}

export const POSITION_NAME: Record<string, string> = {
  QB: 'Quarterback', RB: 'Running back', FB: 'Fullback', WR: 'Wide receiver', TE: 'Tight end', OT: 'Offensive tackle', T: 'Offensive tackle', G: 'Guard', OG: 'Guard',
  C: 'Center', DE: 'Defensive end', DT: 'Defensive tackle', NT: 'Nose tackle', LB: 'Linebacker', OLB: 'Linebacker', ILB: 'Linebacker', MLB: 'Linebacker',
  CB: 'Cornerback', S: 'Safety', SS: 'Safety', FS: 'Safety', DB: 'Defensive back', PK: 'Kicker', K: 'Kicker', P: 'Punter', LS: 'Long snapper',
}
