// Data lenses: each one re-colours the roster and raises every player on a column whose
// height encodes one number, so the whole team can be read at a glance.
import type { RosterPlayer } from '../types'
import { money } from './format'

export type LensId = 'roster' | 'cap' | 'snaps' | 'index' | 'age' | 'contract' | 'health'

export interface LensValue {
  color: string
  /** Column height, 0..1 of the lens maximum. */
  height: number
  /** Short value tag shown above the player, or null when the lens has nothing to say. */
  tag: string | null
  /** True when the player has no value for this lens (drawn dimmed). */
  empty?: boolean
}

export interface Lens {
  id: LensId
  name: string
  blurb: string
  /** World-unit height of a full column. */
  maxHeight: number
  legend: { color: string; label: string }[]
  note?: string
  value(p: RosterPlayer, ctx: LensContext): LensValue
}

export interface LensContext { season: number; maxCap: number }

export const UNIT_COLOR = { offense: '#3db8ff', defense: '#dfe9f1', special: '#f2c14e' } as const
const EMPTY = '#3a4a5a'

function ramp(stops: [number, string][], t: number): string {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]
      const k = (x - t0) / (t1 - t0 || 1)
      const a = parseInt(c0.slice(1), 16), b = parseInt(c1.slice(1), 16)
      const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k)
      return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`
    }
  }
  return stops[stops.length - 1][1]
}

const GOLD: [number, string][] = [[0, '#7a5a1c'], [0.35, '#d99a2b'], [1, '#ffe08a']]
const CYAN: [number, string][] = [[0, '#15506e'], [0.5, '#1ea7e6'], [1, '#9be4ff']]
// One-hue ordinal ramp (validated light-to-dark steps) for ordered classes.
export const ORDINAL_BLUE = ['#1c5cab', '#3987e5', '#86b6ef', '#cde2fb']
const AGE: [number, string][] = [[0, ORDINAL_BLUE[0]], [0.5, ORDINAL_BLUE[1]], [1, ORDINAL_BLUE[3]]]

// Percentiles are a polarity around the league median, so they use a diverging scale:
// two opposite hues with a neutral grey in the middle.
export const INDEX_BANDS = [
  { min: 80, color: '#4f97ea', label: 'Top fifth of the league · 80+' },
  { min: 60, color: '#2f6fb8', label: 'Above average · 60–79' },
  { min: 40, color: '#5b6878', label: 'Around average · 40–59' },
  { min: 20, color: '#a8573f', label: 'Below average · 20–39' },
  { min: 0, color: '#e8684a', label: 'Bottom fifth · under 20' },
]
export const indexColor = (v?: number | null) => (v === null || v === undefined ? EMPTY : INDEX_BANDS.find((b) => v >= b.min)!.color)

export const TONE_COLOR = { ok: '#3ddc97', warn: '#ffc247', out: '#ff5a5f', muted: '#7d8fa0' } as const

export const LENSES: Lens[] = [
  {
    id: 'roster', name: 'Depth chart', blurb: 'Who lines up where. First string at the line, backups in waves behind them.', maxHeight: 0,
    legend: [{ color: UNIT_COLOR.offense, label: 'Offense' }, { color: UNIT_COLOR.defense, label: 'Defense' }, { color: UNIT_COLOR.special, label: 'Specialists' }],
    value: (p) => ({ color: UNIT_COLOR[p.unit], height: 0, tag: null }),
  },
  {
    id: 'cap', name: 'Money', blurb: 'Column height is each player’s 2026 salary-cap number.', maxHeight: 17,
    legend: [{ color: '#ffe08a', label: 'Largest cap numbers' }, { color: '#d99a2b', label: 'Mid-tier' }, { color: '#7a5a1c', label: 'Near the minimum' }, { color: EMPTY, label: 'Not published yet' }],
    note: 'Contract figures: OverTheCap via nflverse.',
    value: (p, ctx) => {
      const v = p.lens?.cap
      if (v === undefined || v === null) return { color: EMPTY, height: 0, tag: null, empty: true }
      const t = v / ctx.maxCap
      return { color: ramp(GOLD, Math.sqrt(t)), height: t, tag: money(v) }
    },
  },
  {
    id: 'snaps', name: 'Usage', blurb: 'Share of Detroit’s snaps each player has been on the field for this season.', maxHeight: 9,
    legend: [{ color: '#9be4ff', label: 'Every-down player' }, { color: '#1ea7e6', label: 'Rotation' }, { color: '#15506e', label: 'Spot duty' }, { color: EMPTY, label: 'No snaps' }],
    note: 'Snap counts: Pro Football Reference via nflverse. Specialists show special-teams share.',
    value: (p) => {
      const v = p.lens?.snaps
      if (!v) return { color: EMPTY, height: 0, tag: null, empty: true }
      return { color: ramp(CYAN, v), height: v, tag: `${Math.round(v * 100)}%` }
    },
  },
  {
    id: 'index', name: 'Impact', blurb: 'Atlas Index: average league percentile across a position’s core stats, among qualified players.', maxHeight: 10,
    legend: [...INDEX_BANDS.map((b) => ({ color: b.color, label: b.label })), { color: EMPTY, label: 'Not enough volume to rank' }],
    note: 'Our own composite of open statistics. It is not a PFF grade. Linemen have no open individual stats to rank.',
    value: (p) => {
      const v = p.lens?.index
      if (v === undefined || v === null) return { color: EMPTY, height: 0, tag: null, empty: true }
      return { color: indexColor(v), height: v / 100, tag: String(v) }
    },
  },
  {
    id: 'age', name: 'Age', blurb: 'Column height and color follow age, youngest to oldest.', maxHeight: 8,
    legend: [{ color: ORDINAL_BLUE[0], label: '21–24' }, { color: ORDINAL_BLUE[1], label: '25–29' }, { color: ORDINAL_BLUE[3], label: '30 and over' }],
    value: (p) => {
      if (!p.age) return { color: EMPTY, height: 0, tag: null, empty: true }
      const t = (p.age - 21) / 14
      return { color: ramp(AGE, t), height: Math.max(0.06, t), tag: String(p.age) }
    },
  },
  {
    id: 'contract', name: 'Control', blurb: 'How many seasons each player is under contract, counting this one.', maxHeight: 9,
    legend: [{ color: ORDINAL_BLUE[0], label: 'Expires after this season' }, { color: ORDINAL_BLUE[1], label: 'Through 2027' }, { color: ORDINAL_BLUE[2], label: 'Through 2028' }, { color: ORDINAL_BLUE[3], label: '2029 and beyond' }, { color: EMPTY, label: 'No contract on file' }],
    note: 'Contract length excludes void years.',
    value: (p, ctx) => {
      const through = p.lens?.through
      if (!through) return { color: EMPTY, height: 0, tag: null, empty: true }
      const years = Math.max(1, through - ctx.season + 1)
      const color = ORDINAL_BLUE[Math.min(3, years - 1)]
      return { color, height: Math.min(1, years / 5), tag: `’${String(through).slice(2)}` }
    },
  },
  {
    id: 'health', name: 'Health', blurb: 'This week’s injury report and reserve designations.', maxHeight: 0,
    legend: [{ color: TONE_COLOR.ok, label: 'Available' }, { color: TONE_COLOR.warn, label: 'Questionable' }, { color: TONE_COLOR.out, label: 'Out / reserve list' }, { color: TONE_COLOR.muted, label: 'Practice squad' }],
    note: 'Designations: NFL injury report via nflverse and ESPN.',
    value: (p) => ({ color: TONE_COLOR[p.availability.tone], height: 0, tag: p.availability.tone === 'ok' || p.availability.tone === 'muted' ? null : p.availability.injury || p.availability.status }),
  },
]

export const lensById = (id: LensId) => LENSES.find((l) => l.id === id)!
