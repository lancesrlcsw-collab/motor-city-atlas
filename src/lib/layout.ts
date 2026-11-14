// Where every player stands. One world unit is one yard; the field runs along X with the
// line of scrimmage at x = 0. Detroit's offense sets up on the -X side facing +X and its own
// defense lines up across from it, so the whole roster reads as one play about to be snapped.
import type { RosterPlayer } from '../types'

export const FIELD = { length: 120, width: 53.333, half: 60, halfWidth: 26.667, endZone: 10 }

/** Starter coordinates [x, z] by depth-chart slot. +z is the offense's right. */
const OFFENSE: Record<string, [number, number]> = {
  c: [-2.3, 0], lg: [-2.3, -3.7], lt: [-2.7, -7.4], rg: [-2.3, 3.7], rt: [-2.7, 7.4],
  te: [-3.0, 11.4], qb: [-8.6, 0], rb: [-9.6, 4.3],
  wr1: [-2.5, -22], wr2: [-3.4, 22], wr3: [-3.6, -15.2],
}
const DEFENSE: Record<string, [number, number]> = {
  lde: [2.5, 9.2], ldt: [2.3, 2.8], rdt: [2.3, -2.8], rde: [2.5, -9.2],
  slb: [7.0, 9.6], mlb: [7.3, 0], wlb: [7.0, -9.6],
  lcb: [5.6, 22], rcb: [5.6, -22], nb: [6.2, -15.6],
  ss: [12.4, 6.8], fs: [14.0, -5.6],
}
// Yards between the first string and each wave of backups lined up behind it.
const WAVE_OFFENSE = 11.4
const WAVE_DEFENSE = 14.6
const SIDELINE = FIELD.halfWidth + 6.2

export interface Placement {
  x: number
  z: number
  /** Rotation about Y so the figure faces its opponent. */
  facing: number
  zone: 'offense' | 'defense' | 'specialists' | 'reserve' | 'practice'
  rank: number
}

function row(count: number, centerX: number, spacing: number): number[] {
  return Array.from({ length: count }, (_, i) => centerX + (i - (count - 1) / 2) * spacing)
}

export function placePlayers(players: RosterPlayer[]): Map<string, Placement> {
  const out = new Map<string, Placement>()
  const specialists: RosterPlayer[] = []
  const reserve: RosterPlayer[] = []
  const practice: RosterPlayer[] = []
  const stray: RosterPlayer[] = []

  for (const p of players) {
    if (p.roster === 'reserve') { reserve.push(p); continue }
    if (p.roster === 'practice') { practice.push(p); continue }
    const slot = p.depth?.slot
    const rank = p.depth?.rank ?? 1
    if (slot && OFFENSE[slot]) {
      const [x, z] = OFFENSE[slot]
      out.set(p.id, { x: x - (rank - 1) * WAVE_OFFENSE, z, facing: 0, zone: 'offense', rank })
    } else if (slot && DEFENSE[slot]) {
      const [x, z] = DEFENSE[slot]
      out.set(p.id, { x: x + (rank - 1) * WAVE_DEFENSE, z, facing: Math.PI, zone: 'defense', rank })
    } else if (p.unit === 'special') specialists.push(p)
    else stray.push(p)
  }

  const order = (a: RosterPlayer, b: RosterPlayer) => unitOrder(a) - unitOrder(b) || (a.number ?? 99) - (b.number ?? 99)
  specialists.sort((a, b) => slotOrder(a) - slotOrder(b))
  reserve.sort(order); practice.sort(order)

  // Far sideline (-z): specialists by the offense's end, then the practice squad.
  row(specialists.length, -41, 3.4).forEach((x, i) => out.set(specialists[i].id, { x, z: -SIDELINE, facing: -Math.PI / 2, zone: 'specialists', rank: 1 }))
  row(practice.length + stray.length, 9, 3.3).forEach((x, i) => {
    const p = [...practice, ...stray][i]
    out.set(p.id, { x, z: -SIDELINE, facing: -Math.PI / 2, zone: 'practice', rank: 1 })
  })
  // Near sideline (+z): the reserve lists.
  row(reserve.length, 0, 3.5).forEach((x, i) => out.set(reserve[i].id, { x, z: SIDELINE, facing: Math.PI / 2, zone: 'reserve', rank: 1 }))
  return out
}

const unitOrder = (p: RosterPlayer) => (p.unit === 'offense' ? 0 : p.unit === 'defense' ? 1 : 2)
const slotOrder = (p: RosterPlayer) => ['pk', 'p', 'ls'].indexOf(p.depth?.slot || '') + 1 || 9

export const ZONE_LABELS: { text: string; x: number; z: number; rotation: number }[] = [
  { text: 'PRACTICE SQUAD', x: 9, z: -SIDELINE - 4.6, rotation: 0 },
  { text: 'SPECIALISTS', x: -41, z: -SIDELINE - 4.6, rotation: 0 },
  { text: 'RESERVE LISTS', x: 0, z: SIDELINE + 4.6, rotation: 0 },
]

/** Scale a figure from listed height/weight. Returns [height in yards, girth factor]. */
export function bodyScale(heightIn?: number, weightLb?: number): [number, number] {
  const h = (heightIn || 73) / 36
  const bmi = ((weightLb || 220) / ((heightIn || 73) ** 2)) * 703
  // 26 BMI (a lean corner) -> 0.86 ; 40 BMI (a nose tackle) -> 1.42
  const girth = Math.max(0.8, Math.min(1.5, 0.86 + (bmi - 26) * 0.04))
  return [h, girth]
}
