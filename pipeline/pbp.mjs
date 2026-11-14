// One streaming pass over the season's play-by-play (nflfastR format) to build:
//  - efficiency tables for all 32 offenses and defenses
//  - win-probability timelines and turning points for the team's games
//  - per-player signature plays, field-zone tendencies and situational splits
import { download } from './lib/http.mjs'
import { readCsv, num, n0 } from './lib/csv.mjs'
import { TEAM } from './nflverse.mjs'

const URL = (season) => `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv.gz`

const blankSide = () => ({ plays: 0, epa: 0, success: 0, dropbacks: 0, dropbackEpa: 0, rushes: 0, rushEpa: 0, explosive: 0, third: 0, thirdConv: 0, fourth: 0, fourthConv: 0, turnovers: 0, sacks: 0, yards: 0, rzDrives: 0, rzTds: 0, drives: 0, points: 0 })
const blankZone = () => ({ att: 0, cmp: 0, yds: 0, td: 0, int: 0, epa: 0 })
const blankLane = () => ({ att: 0, yds: 0, td: 0, epa: 0, success: 0, first: 0 })
const blankSplit = () => ({ plays: 0, yds: 0, td: 0, epa: 0, first: 0, cmp: 0 })

const depthOf = (air) => (air < 0 ? 'behind' : air < 10 ? 'short' : air < 20 ? 'mid' : 'deep')
function laneOf(loc, gap) {
  if (loc === 'middle') return 'middle'
  if ((loc === 'left' || loc === 'right') && (gap === 'end' || gap === 'tackle' || gap === 'guard')) return `${loc}-${gap}`
  return null
}

function elapsed(r) {
  const qtr = n0(r.qtr)
  const qs = num(r.quarter_seconds_remaining)
  if (!qtr || qs === null) return null
  return (qtr - 1) * 900 + (900 - qs)
}

export async function loadPbp(season, playerIds) {
  const ids = new Set(playerIds)
  const file = await download(URL(season))
  const off = {}
  const def = {}
  const games = {} // gameId -> { wp: [[t, wp]], plays: [] }
  const players = {} // gsis -> { plays: [], pass: {}, recv: {}, rush: {}, splits: {} }
  const teamZones = { offense: { pass: {}, rush: {} }, defense: { pass: {}, rush: {} } }
  const drives = new Map() // key -> { team, def, rz, td }

  const P = (id) => (players[id] ||= { plays: [], pass: {}, recv: {}, rush: {}, splits: {} })
  const addZone = (grid, key, r, yards) => {
    const z = (grid[key] ||= blankZone())
    z.att++
    if (r.complete_pass === '1') { z.cmp++; z.yds += yards }
    if (r.pass_touchdown === '1') z.td++
    if (r.interception === '1') z.int++
    z.epa += n0(r.epa)
  }
  const addLane = (grid, key, r, yards) => {
    const z = (grid[key] ||= blankLane())
    z.att++; z.yds += yards; z.epa += n0(r.epa)
    if (r.rush_touchdown === '1') z.td++
    if (r.success === '1') z.success++
    if (r.first_down === '1') z.first++
  }
  const addSplit = (p, role, name, r, yards) => {
    const s = ((p.splits[role] ||= {})[name] ||= blankSplit())
    s.plays++; s.yds += yards; s.epa += n0(r.epa)
    if (r.touchdown === '1' && r.td_team === r.posteam) s.td++
    if (r.first_down === '1') s.first++
    if (r.complete_pass === '1') s.cmp++
  }

  await readCsv(file, {
    filter: (r) => {
      if (r.season_type !== 'REG') return false
      const pos = r.posteam
      const dteam = r.defteam
      const epa = num(r.epa)
      const yards = n0(r.yards_gained)
      const isPass = r.pass === '1'
      const isRush = r.rush === '1'
      const scrimmage = (isPass || isRush) && epa !== null && r.two_point_attempt !== '1'

      if (pos && dteam && scrimmage) {
        for (const [side, t] of [[(off[pos] ||= blankSide()), 1], [(def[dteam] ||= blankSide()), 1]]) {
          side.plays += t; side.epa += epa; side.yards += yards
          if (r.success === '1') side.success++
          if (isPass) { side.dropbacks++; side.dropbackEpa += epa } else { side.rushes++; side.rushEpa += epa }
          if ((isPass && yards >= 20) || (isRush && yards >= 10)) side.explosive++
          if (r.down === '3') { side.third++; if (r.third_down_converted === '1') side.thirdConv++ }
          if (r.down === '4') { side.fourth++; if (r.fourth_down_converted === '1') side.fourthConv++ }
          if (r.interception === '1' || r.fumble_lost === '1') side.turnovers++
          if (r.sack === '1') side.sacks++
        }
      }
      if (pos && dteam && r.drive) {
        const key = `${r.game_id}|${pos}|${r.drive}`
        const d = drives.get(key) || { team: pos, def: dteam, rz: false, td: false }
        const yl = num(r.yardline_100)
        if (yl !== null && yl <= 20 && (isPass || isRush)) d.rz = true
        if (r.fixed_drive_result === 'Touchdown') d.td = true
        drives.set(key, d)
      }

      const ours = pos === TEAM || dteam === TEAM
      if (!ours) return false
      const weOffense = pos === TEAM
      const opp = weOffense ? dteam : pos
      const g = (games[r.game_id] ||= { week: num(r.week), home: r.home_team, away: r.away_team, wp: [], plays: [] })
      const t = elapsed(r)
      const hwp = num(r.home_wp)
      if (t !== null && hwp !== null) g.wp.push([t, r.home_team === TEAM ? hwp : 1 - hwp])

      const wpaRaw = num(r.wpa)
      const wpa = wpaRaw === null ? null : weOffense ? wpaRaw : -wpaRaw
      const epaUs = epa === null ? null : weOffense ? epa : -epa
      const td = r.touchdown === '1'
      const base = {
        week: num(r.week), opp, qtr: n0(r.qtr), time: r.time || null, down: num(r.down), togo: num(r.ydstogo), spot: r.yrdln || null,
        text: r.desc, epa: epaUs === null ? null : Math.round(epaUs * 100) / 100, wpa: wpa === null ? null : Math.round(wpa * 1000) / 1000,
        yards, td: td || undefined, score: `${r.total_home_score}-${r.total_away_score}`,
      }
      if (wpa !== null && Math.abs(wpa) >= 0.04 && r.desc) g.plays.push({ ...base, t })

      // --- player involvement -------------------------------------------------
      const involve = (id, role) => { if (id && ids.has(id)) P(id).plays.push({ ...base, role }) }
      if (weOffense) {
        if (isPass && r.sack !== '1') involve(r.passer_player_id, 'pass')
        if (r.receiver_player_id) involve(r.receiver_player_id, 'target')
        if (isRush) involve(r.rusher_player_id, 'rush')
        if (r.field_goal_attempt === '1' || r.extra_point_attempt === '1') involve(r.kicker_player_id, 'kick')
        if (r.punt_attempt === '1') involve(r.punter_player_id, 'punt')
      } else {
        involve(r.sack_player_id, 'sack'); involve(r.half_sack_1_player_id, 'sack'); involve(r.half_sack_2_player_id, 'sack')
        involve(r.interception_player_id, 'interception')
        involve(r.forced_fumble_player_1_player_id, 'forced fumble')
        involve(r.pass_defense_1_player_id, 'pass defended'); involve(r.pass_defense_2_player_id, 'pass defended')
        involve(r.tackle_for_loss_1_player_id, 'tackle for loss')
        if (r.fumble_recovery_1_team === TEAM) involve(r.fumble_recovery_1_player_id, 'fumble recovery')
      }
      involve(r.kickoff_returner_player_id, 'kick return'); involve(r.punt_returner_player_id, 'punt return')

      // --- field zones and situational splits ----------------------------------
      const air = num(r.air_yards)
      const loc = r.pass_location
      const isAttempt = isPass && r.pass_attempt === '1' && r.sack !== '1' && (loc === 'left' || loc === 'middle' || loc === 'right') && air !== null
      if (isAttempt) {
        const key = `${loc}-${depthOf(air)}`
        addZone(teamZones[weOffense ? 'offense' : 'defense'].pass, key, r, yards)
        if (weOffense) {
          if (ids.has(r.passer_player_id)) addZone(P(r.passer_player_id).pass, key, r, yards)
          if (ids.has(r.receiver_player_id)) addZone(P(r.receiver_player_id).recv, key, r, yards)
        }
      }
      const lane = isRush && r.qb_scramble !== '1' && r.qb_kneel !== '1' ? laneOf(r.run_location, r.run_gap) : null
      if (lane) {
        addLane(teamZones[weOffense ? 'offense' : 'defense'].rush, lane, r, yards)
        if (weOffense && ids.has(r.rusher_player_id)) addLane(P(r.rusher_player_id).rush, lane, r, yards)
      }
      if (weOffense && scrimmage) {
        const tags = []
        if (r.down) tags.push(`down${r.down}`)
        if (num(r.yardline_100) !== null && num(r.yardline_100) <= 20) tags.push('redZone')
        if (r.qtr) tags.push(`q${Math.min(n0(r.qtr), 5)}`)
        const sd = num(r.score_differential)
        if (sd !== null) tags.push(sd > 0 ? 'leading' : sd < 0 ? 'trailing' : 'tied')
        for (const [id, role] of [[isPass && r.sack !== '1' ? r.passer_player_id : null, 'pass'], [r.receiver_player_id, 'recv'], [isRush ? r.rusher_player_id : null, 'rush']]) {
          if (!id || !ids.has(id)) continue
          for (const tag of tags) addSplit(P(id), role, tag, r, role === 'recv' && r.complete_pass !== '1' ? 0 : yards)
        }
      }
      return false
    },
  })

  for (const d of drives.values()) {
    const o = (off[d.team] ||= blankSide()); const x = (def[d.def] ||= blankSide())
    o.drives++; x.drives++
    if (d.rz) { o.rzDrives++; x.rzDrives++; if (d.td) { o.rzTds++; x.rzTds++ } }
  }

  // Tidy numeric noise and thin the win-probability series.
  const r3 = (v) => Math.round(v * 1000) / 1000
  for (const g of Object.values(games)) {
    g.wp.sort((a, b) => a[0] - b[0])
    const step = Math.max(1, Math.ceil(g.wp.length / 90))
    const thin = g.wp.filter((_, i) => i % step === 0 || i === g.wp.length - 1)
    g.wp = thin.map(([t, w]) => [t, r3(w)])
    g.plays.sort((a, b) => Math.abs(b.wpa) - Math.abs(a.wpa))
    g.plays = g.plays.slice(0, 6).sort((a, b) => a.t - b.t)
  }
  for (const p of Object.values(players)) {
    for (const grid of [p.pass, p.recv, p.rush]) for (const z of Object.values(grid)) z.epa = r3(z.epa)
    for (const role of Object.values(p.splits)) for (const s of Object.values(role)) s.epa = r3(s.epa)
    // Signature plays: the ones that moved win probability most in Detroit's favour.
    const seen = new Set()
    p.plays = p.plays
      .filter((x) => (x.wpa ?? x.epa ?? 0) > 0)
      .sort((a, b) => (b.wpa ?? 0) - (a.wpa ?? 0) || (b.epa ?? 0) - (a.epa ?? 0))
      .filter((x) => { const k = `${x.week}|${x.text}`; if (seen.has(k)) return false; seen.add(k); return true })
      .slice(0, 8)
  }
  for (const side of ['offense', 'defense']) {
    for (const z of Object.values(teamZones[side].pass)) z.epa = r3(z.epa)
    for (const z of Object.values(teamZones[side].rush)) z.epa = r3(z.epa)
  }
  return { off, def, games, players, teamZones }
}
