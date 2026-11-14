// Contract data: OverTheCap figures as published in the nflverse `contracts` release.
// The parquet file has one row group with two deeply nested columns, so it is read
// one column at a time to stay inside a normal Node heap.
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { download } from './lib/http.mjs'
import { nameKey } from './lib/util.mjs'

const URL = 'https://github.com/nflverse/nflverse-data/releases/download/contracts/historical_contracts.parquet'

const NICK_TO_ABBR = {
  Cardinals: 'ARI', Falcons: 'ATL', Ravens: 'BAL', Bills: 'BUF', Panthers: 'CAR', Bears: 'CHI', Bengals: 'CIN', Browns: 'CLE',
  Cowboys: 'DAL', Broncos: 'DEN', Lions: 'DET', Packers: 'GB', Texans: 'HOU', Colts: 'IND', Jaguars: 'JAX', Chiefs: 'KC',
  Raiders: 'LV', Chargers: 'LAC', Rams: 'LA', Dolphins: 'MIA', Vikings: 'MIN', Patriots: 'NE', Saints: 'NO', Giants: 'NYG',
  Jets: 'NYJ', Eagles: 'PHI', Steelers: 'PIT', '49ers': 'SF', Seahawks: 'SEA', Buccaneers: 'TB', Titans: 'TEN', Commanders: 'WAS',
}

// OverTheCap positions -> broad groups used for spending comparisons.
export const OTC_GROUP = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
  IDL: 'DL', ED: 'EDGE', LB: 'LB', CB: 'CB', S: 'S', K: 'ST', P: 'ST', LS: 'ST',
}

const m = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 1e4) / 1e4)

function seasonRows(history) {
  const rows = []
  for (const h of history || []) {
    const year = Number(h.year)
    if (!Number.isFinite(year) || year < 1990) continue // skips the "Total" row and empty placeholders
    rows.push({
      year, team: h.team || null, base: m(h.base_salary), prorated: m(h.prorated_bonus), option: m(h.option_bonus), roster: m(h.roster_bonus),
      workout: m(h.workout_bonus), perGame: m(h.per_game_roster_bonus), other: m(h.other_bonus), guaranteed: m(h.guaranteed_salary),
      cap: m(h.cap_number), capPct: m(h.cap_percent), cash: m(h.cash_paid),
    })
  }
  return rows.sort((a, b) => a.year - b.year)
}

/**
 * @param {number} season  current league year
 * @param {Map} playersIndex  gsis -> player (for resolving each contract's current club)
 */
export async function loadContracts(season, playersIndex) {
  const path = await download(URL, { ttlHours: 6 })
  const file = await asyncBufferFromFile(path)
  const light = await parquetReadObjects({
    file, compressors,
    columns: ['player', 'position', 'team', 'is_active', 'year_signed', 'years', 'value', 'apy', 'guaranteed', 'apy_cap_pct', 'otc_id', 'gsis_id'],
  })
  const active = []
  light.forEach((r, i) => { if (r.is_active) active.push(i) })

  let col = await parquetReadObjects({ file, compressors, columns: ['season_history'] })
  const seasonsByRow = new Map(active.map((i) => [i, seasonRows(col[i].season_history)]))
  col = await parquetReadObjects({ file, compressors, columns: ['contract_history'] })
  const historyByRow = new Map(active.map((i) => [i, (col[i].contract_history || []).map((h) => ({
    team: h.team, type: h.contract_type, status: h.status, yearSigned: Number(h.year_signed) || null, years: Number(h.yrs) || null,
    total: m(h.total), apy: m(h.apy), guarantees: m(h.guarantees), earned: m(h.amount_earned), pctEarned: m(h.percent_earned),
  }))]))
  col = null

  // One record per player: the active deal with the highest value.
  const byPlayer = new Map()
  for (const i of active) {
    const r = light[i]
    const key = r.otc_id ?? `${r.player}|${r.position}`
    const prev = byPlayer.get(key)
    if (!prev || (Number(r.value) || 0) > (Number(prev.value) || 0)) {
      const idx = playersIndex.get(r.gsis_id)
      const nick = (r.team || '').split('/').pop()
      byPlayer.set(key, {
        name: r.player, otcPosition: r.position, group: OTC_GROUP[r.position] || 'OTHER', gsis: r.gsis_id || null, otcId: r.otc_id != null ? String(r.otc_id) : null,
        team: idx?.latestTeam || NICK_TO_ABBR[nick] || nick || null,
        yearSigned: Number(r.year_signed) || null, years: Number(r.years) || null, value: m(r.value), apy: m(r.apy), guaranteed: m(r.guaranteed), apyCapPct: m(r.apy_cap_pct),
        seasons: seasonsByRow.get(i), history: historyByRow.get(i),
      })
    }
  }
  const all = [...byPlayer.values()]

  // Rank of each deal's average per year within its position, league-wide.
  const byPos = new Map()
  for (const c of all) {
    if (!byPos.has(c.otcPosition)) byPos.set(c.otcPosition, [])
    byPos.get(c.otcPosition).push(c)
  }
  for (const list of byPos.values()) {
    list.sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
    list.forEach((c, i) => { c.apyRank = { rank: i + 1, of: list.length, position: c.otcPosition } })
  }

  for (const c of all) {
    const paidYears = c.seasons.filter((s) => (s.cash ?? 0) > 0).map((s) => s.year)
    c.throughYear = paidYears.length ? Math.max(...paidYears) : null
    c.freeAgentYear = c.throughYear ? c.throughYear + 1 : null
    for (const s of c.seasons) if (c.throughYear && s.year > c.throughYear) s.void = true
    const cur = c.seasons.find((s) => s.year === season)
    c.capHit = cur?.cap ?? null
    c.cashThisYear = cur?.cash ?? null
    c.careerCash = Math.round(c.seasons.filter((s) => s.year <= season).reduce((t, s) => t + (s.cash ?? 0), 0) * 1e4) / 1e4
    c.type = c.history?.findLast?.((h) => h.status === 'Active')?.type || c.history?.at?.(-1)?.type || null
  }

  // League table: committed cap by club and position group for the current year.
  const league = {}
  for (const c of all) {
    if (!c.team || c.capHit === null) continue
    const t = (league[c.team] ||= { total: 0, players: 0, groups: {} })
    t.total += c.capHit
    t.players++
    t.groups[c.group] = (t.groups[c.group] || 0) + c.capHit
  }

  const byGsis = new Map()
  const byOtc = new Map()
  const byName = new Map()
  for (const c of all) {
    if (c.gsis) byGsis.set(c.gsis, c)
    if (c.otcId) byOtc.set(c.otcId, c)
    byName.set(`${nameKey(c.name)}|${c.team}`, c)
  }
  return {
    league,
    find(player) {
      return byGsis.get(player.gsis) || (player.otcId && byOtc.get(String(player.otcId))) || byName.get(`${nameKey(player.name)}|DET`) || null
    },
  }
}
