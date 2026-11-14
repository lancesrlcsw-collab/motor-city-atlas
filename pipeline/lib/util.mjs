export const round = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d)

export const div = (a, b) => (a === null || b === null || !b ? null : a / b)

export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) ?? 0), 0)

export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Normalised name key for joining sources that spell names differently (Jr., II, D.J. vs DJ). */
export function nameKey(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z]/g, '')
}

export function ageOn(birthISO, on = new Date()) {
  if (!birthISO) return null
  const b = new Date(birthISO)
  if (Number.isNaN(b.getTime())) return null
  let a = on.getUTCFullYear() - b.getUTCFullYear()
  const m = on.getUTCMonth() - b.getUTCMonth()
  if (m < 0 || (m === 0 && on.getUTCDate() < b.getUTCDate())) a--
  return a
}

/** Percentile rank (0-100) of value within a sorted ascending array; higher value = higher percentile. */
export function percentileOf(sortedAsc, value) {
  if (value === null || value === undefined || !sortedAsc.length) return null
  let below = 0
  let equal = 0
  for (const v of sortedAsc) {
    if (v < value) below++
    else if (v === value) equal++
  }
  return Math.round(((below + equal * 0.5) / sortedAsc.length) * 100)
}

export function groupBy(arr, keyFn) {
  const m = new Map()
  for (const x of arr) {
    const k = keyFn(x)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(x)
  }
  return m
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Drop null/undefined/empty values so the shipped JSON stays small. */
export function compact(obj) {
  if (Array.isArray(obj)) return obj.map(compact)
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue
      if (Array.isArray(v) && v.length === 0) continue
      out[k] = compact(v)
    }
    return out
  }
  return obj
}
