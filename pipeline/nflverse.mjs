// Loaders for the open nflverse data releases (https://github.com/nflverse/nflverse-data).
// Every function returns plain objects keyed by GSIS player id unless noted.
import { download } from './lib/http.mjs'
import { readCsv, num, n0 } from './lib/csv.mjs'

const REL = 'https://github.com/nflverse/nflverse-data/releases/download'
const rel = (tag, file) => `${REL}/${tag}/${file}`

export const TEAM = 'DET'

// Columns of stats_player_* that are identifiers rather than numbers.
const STAT_META = new Set([
  'player_id', 'player_name', 'player_display_name', 'position', 'position_group', 'headshot_url', 'season', 'season_type',
  'recent_team', 'team', 'opponent_team', 'week', 'game_id', 'fg_made_list', 'fg_missed_list', 'fg_blocked_list',
  'gwfg_distance_list', 'gwfg_distance',
])

/** Keep only non-zero numeric stats from a stats_player row. */
export function statRow(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (STAT_META.has(k)) continue
    const n = num(v)
    if (n !== null && n !== 0) out[k] = Math.round(n * 1000) / 1000
  }
  return out
}

export async function loadPlayersIndex() {
  const file = await download(rel('players', 'players.csv'), { ttlHours: 12 })
  const byGsis = new Map()
  const pfrToGsis = new Map()
  const espnToGsis = new Map()
  await readCsv(file, {
    filter: (r) => {
      if (!r.gsis_id) return false
      byGsis.set(r.gsis_id, {
        gsis: r.gsis_id,
        name: r.display_name,
        first: r.football_name || r.common_first_name || r.first_name,
        last: r.last_name,
        pfrId: r.pfr_id || null,
        pffId: r.pff_id || null,
        otcId: r.otc_id || null,
        espnId: r.espn_id || null,
        birthDate: r.birth_date || null,
        position: r.position || null,
        positionGroup: r.position_group || null,
        height: num(r.height),
        weight: num(r.weight),
        college: r.college_name || null,
        conference: r.college_conference || null,
        rookieSeason: num(r.rookie_season),
        yearsExp: num(r.years_of_experience),
        draftYear: num(r.draft_year),
        draftRound: num(r.draft_round),
        draftPick: num(r.draft_pick),
        draftTeam: r.draft_team || null,
        latestTeam: r.latest_team || null,
        status: r.status || null,
      })
      if (r.pfr_id) pfrToGsis.set(r.pfr_id, r.gsis_id)
      if (r.espn_id) espnToGsis.set(r.espn_id, r.gsis_id)
      return false
    },
  })
  return { byGsis, pfrToGsis, espnToGsis }
}

/** Season roster rows for the team (one row per player, latest designation). */
export async function loadRoster(season) {
  const file = await download(rel('rosters', `roster_${season}.csv`))
  return readCsv(file, {
    filter: (r) => r.team === TEAM,
    map: (r) => ({
      gsis: r.gsis_id,
      name: r.full_name,
      first: r.football_name || r.first_name,
      last: r.last_name,
      position: r.position,
      depthPosition: r.depth_chart_position,
      jersey: num(r.jersey_number),
      status: r.status, // ACT, RES, DEV, CUT, RET ...
      statusDetail: r.status_description_abbr,
      week: num(r.week),
      birthDate: r.birth_date || null,
      height: num(r.height),
      weight: num(r.weight),
      college: r.college || null,
      espnId: r.espn_id || null,
      pfrId: r.pfr_id || null,
      pffId: r.pff_id || null,
      yearsExp: num(r.years_exp),
      entryYear: num(r.entry_year),
      rookieYear: num(r.rookie_year),
      draftClub: r.draft_club || null,
      draftNumber: num(r.draft_number),
    }),
  })
}

/** Week-by-week roster designation for each player: { gsis: [{week, status, detail}] } */
export async function loadWeeklyStatus(season) {
  const file = await download(rel('weekly_rosters', `roster_weekly_${season}.csv`))
  const rows = await readCsv(file, { filter: (r) => r.team === TEAM && r.game_type === 'REG' })
  const out = {}
  for (const r of rows) {
    ;(out[r.gsis_id] ||= []).push({ week: num(r.week), status: r.status, detail: r.status_description_abbr })
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.week - b.week)
  return out
}

/**
 * Season stat lines. Regular season and postseason come from separate files so that a
 * playoff run never hides the regular-season line.
 * Returns { rowsByPlayer: {gsis: [{season, type, team, games, ...stats}]}, league: [rows for the last season] }
 */
export async function loadSeasonStats(ids, firstSeason, lastSeason) {
  const idSet = new Set(ids)
  const rowsByPlayer = {}
  const league = []
  for (let y = firstSeason; y <= lastSeason; y++) {
    const ttlHours = y === lastSeason ? 3 : 24 * 30
    for (const kind of ['reg', 'post']) {
      const file = await download(rel('stats_player', `stats_player_${kind}_${y}.csv`), { ttlHours })
      if (!file) continue
      const type = kind === 'reg' ? 'REG' : 'POST'
      const rows = await readCsv(file, { filter: (r) => (y === lastSeason && kind === 'reg') || idSet.has(r.player_id) })
      for (const r of rows) {
        if (idSet.has(r.player_id)) (rowsByPlayer[r.player_id] ||= []).push({ season: y, type, team: r.recent_team, games: n0(r.games), ...statRow(r) })
        if (y === lastSeason && kind === 'reg') league.push({ gsis: r.player_id, name: r.player_display_name, position: r.position, group: r.position_group, team: r.recent_team, games: n0(r.games), ...statRow(r) })
      }
    }
  }
  return { rowsByPlayer, league }
}

/** Weekly game logs for the given players. { gsis: [{season, week, type, team, opp, gameId, ...stats}] } */
export async function loadWeeklyStats(ids, seasons) {
  const idSet = new Set(ids)
  const out = {}
  for (const y of seasons) {
    const file = await download(rel('stats_player', `stats_player_week_${y}.csv`), { ttlHours: y === Math.max(...seasons) ? 3 : 24 * 30 })
    if (!file) continue
    const rows = await readCsv(file, { filter: (r) => idSet.has(r.player_id) })
    for (const r of rows) {
      ;(out[r.player_id] ||= []).push({ season: y, week: num(r.week), type: r.season_type, team: r.team, opp: r.opponent_team, gameId: r.game_id, ...statRow(r) })
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.season - b.season || a.week - b.week)
  return out
}

/** Team season totals for all 32 clubs (offense columns + defensive counting stats). */
export async function loadTeamStats(season) {
  const file = await download(rel('stats_team', `stats_team_reg_${season}.csv`))
  const rows = await readCsv(file)
  const out = {}
  for (const r of rows) out[r.team] = { games: n0(r.games), ...statRow(r) }
  return out
}

/** Weekly team rows, used to total what each defense allowed. */
export async function loadTeamWeeks(season) {
  const file = await download(rel('stats_team', `stats_team_week_${season}.csv`))
  return readCsv(file, {
    filter: (r) => r.season_type === 'REG',
    map: (r) => ({ team: r.team, opp: r.opponent_team, week: num(r.week), ...statRow(r) }),
  })
}

/** Snap counts keyed by PFR id: season totals for the league and per-game rows for the team. */
export async function loadSnaps(season) {
  const file = await download(rel('snap_counts', `snap_counts_${season}.csv`))
  if (!file) return { season: {}, games: {}, teamGames: {} }
  const rows = await readCsv(file, { filter: (r) => r.game_type === 'REG' })
  // Team totals per game are derived from the busiest player on each unit.
  const teamGame = {}
  for (const r of rows) {
    const key = `${r.team}|${r.week}`
    const t = (teamGame[key] ||= { off: 0, def: 0, st: 0 })
    const o = n0(r.offense_snaps), d = n0(r.defense_snaps), s = n0(r.st_snaps)
    const op = n0(r.offense_pct), dp = n0(r.defense_pct), sp = n0(r.st_pct)
    if (o && op) t.off = Math.max(t.off, Math.round(o / op))
    if (d && dp) t.def = Math.max(t.def, Math.round(d / dp))
    if (s && sp) t.st = Math.max(t.st, Math.round(s / sp))
  }
  const teamSeason = {}
  for (const [key, t] of Object.entries(teamGame)) {
    const team = key.split('|')[0]
    const s = (teamSeason[team] ||= { off: 0, def: 0, st: 0, games: 0 })
    s.off += t.off; s.def += t.def; s.st += t.st; s.games++
  }
  const season_ = {}
  const games = {}
  for (const r of rows) {
    const id = r.pfr_player_id
    if (!id) continue
    const s = (season_[id] ||= { team: r.team, position: r.position, games: 0, off: 0, def: 0, st: 0 })
    const o = n0(r.offense_snaps), d = n0(r.defense_snaps), st = n0(r.st_snaps)
    s.team = r.team; s.off += o; s.def += d; s.st += st; s.games++
    if (r.team === TEAM) {
      ;(games[id] ||= []).push({ week: num(r.week), opp: r.opponent, off: o, offPct: num(r.offense_pct), def: d, defPct: num(r.defense_pct), st, stPct: num(r.st_pct) })
    }
  }
  for (const s of Object.values(season_)) {
    const t = teamSeason[s.team]
    if (!t) continue
    s.offPct = t.off ? s.off / t.off : 0
    s.defPct = t.def ? s.def / t.def : 0
    s.stPct = t.st ? s.st / t.st : 0
  }
  for (const k of Object.keys(games)) games[k].sort((a, b) => a.week - b.week)
  return { season: season_, games, teamSeason }
}

/** Next Gen Stats season rows (week 0). Returns { passing: {gsis: {season: row}}, receiving, rushing } plus league rows for `season`. */
export async function loadNgs(season) {
  const out = {}
  const numericExcept = new Set(['season', 'season_type', 'week', 'player_display_name', 'player_position', 'team_abbr', 'player_gsis_id', 'player_first_name', 'player_last_name', 'player_jersey_number', 'player_short_name'])
  for (const kind of ['passing', 'receiving', 'rushing']) {
    const file = await download(rel('nextgen_stats', `ngs_${kind}.csv.gz`))
    const rows = await readCsv(file, { filter: (r) => r.week === '0' && r.season_type === 'REG' })
    const byPlayer = {}
    const league = []
    for (const r of rows) {
      const stats = {}
      for (const [k, v] of Object.entries(r)) {
        if (numericExcept.has(k)) continue
        const n = num(v)
        if (n !== null) stats[k] = Math.round(n * 100) / 100
      }
      const y = num(r.season)
      ;(byPlayer[r.player_gsis_id] ||= {})[y] = stats
      if (y === season) league.push({ gsis: r.player_gsis_id, position: r.player_position, ...stats })
    }
    out[kind] = { byPlayer, league }
  }
  return out
}

const passerRating = (cmp, att, yds, td, int) => {
  if (!att) return null
  const c = (v) => Math.max(0, Math.min(2.375, v))
  return Math.round(((c((cmp / att - 0.3) * 5) + c((yds / att - 3) * 0.25) + c((td / att) * 20) + c(2.375 - (int / att) * 25)) / 6) * 1000) / 10
}
const r2 = (v) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100)

/** Sum PFR's weekly charting rows into a season line that uses the same keys as the season files. */
function aggregatePfrWeeks(kind, rows) {
  const acc = {}
  for (const r of rows) {
    const a = (acc[r.pfr_player_id] ||= { g: 0 })
    a.g++
    const add = (key, col) => { const v = num(r[col]); if (v !== null) a[key] = (a[key] || 0) + v }
    if (kind === 'pass') {
      add('drops', 'passing_drops'); add('bad_throws', 'passing_bad_throws'); add('times_blitzed', 'times_blitzed'); add('times_hurried', 'times_hurried')
      add('times_hit', 'times_hit'); add('times_pressured', 'times_pressured'); add('times_sacked', 'times_sacked')
    } else if (kind === 'rush') {
      add('att', 'carries'); add('ybc', 'rushing_yards_before_contact'); add('yac', 'rushing_yards_after_contact'); add('brk_tkl', 'rushing_broken_tackles')
    } else if (kind === 'rec') {
      add('brk_tkl', 'receiving_broken_tackles'); add('drop', 'receiving_drop'); add('int', 'receiving_int')
    } else {
      add('int', 'def_ints'); add('tgt', 'def_targets'); add('cmp', 'def_completions_allowed'); add('yds', 'def_yards_allowed'); add('td', 'def_receiving_td_allowed')
      add('air', 'def_air_yards_completed'); add('yac', 'def_yards_after_catch'); add('bltz', 'def_times_blitzed'); add('hrry', 'def_times_hurried'); add('qbkd', 'def_times_hitqb')
      add('sk', 'def_sacks'); add('prss', 'def_pressures'); add('comb', 'def_tackles_combined'); add('m_tkl', 'def_missed_tackles')
    }
  }
  for (const a of Object.values(acc)) {
    // Passing and receiving rates need attempts/targets, which the caller adds from the stat line.
    if (kind === 'rush') {
      if (a.att) { a.ybc_att = r2((a.ybc || 0) / a.att); a.yac_att = r2((a.yac || 0) / a.att) }
    } else if (kind === 'def') {
      if (a.tgt) { a.cmp_percent = r2(((a.cmp || 0) / a.tgt) * 100); a.yds_tgt = r2((a.yds || 0) / a.tgt); a.rat = passerRating(a.cmp || 0, a.tgt, a.yds || 0, a.td || 0, a.int || 0) }
      if (a.cmp) a.yds_cmp = r2((a.yds || 0) / a.cmp)
      const chances = (a.comb || 0) + (a.m_tkl || 0)
      if (chances) a.m_tkl_percent = r2(((a.m_tkl || 0) / chances) * 100)
    }
  }
  return acc
}

/**
 * Pro Football Reference advanced stats, keyed by PFR id then season. Past seasons come from
 * the season files; the current season is summed from the weekly files, which update first.
 */
export async function loadPfrAdvanced(season) {
  const out = {}
  const meta = new Set(['season', 'player', 'pfr_id', 'tm', 'team', 'pos', 'loaded', 'age'])
  for (const kind of ['pass', 'rush', 'rec', 'def']) {
    const file = await download(rel('pfr_advstats', `advstats_season_${kind}.csv`))
    const rows = await readCsv(file)
    const byPlayer = {}
    for (const r of rows) {
      const y = num(r.season)
      if (y === season) continue
      const stats = {}
      for (const [k, v] of Object.entries(r)) {
        if (meta.has(k)) continue
        const n = num(typeof v === 'string' ? v.replace('%', '') : v)
        if (n !== null) stats[k] = Math.round(n * 100) / 100
      }
      ;(byPlayer[r.pfr_id] ||= {})[y] = stats
    }
    const weekFile = await download(rel('pfr_advstats', `advstats_week_${kind}_${season}.csv`))
    const weekRows = weekFile ? await readCsv(weekFile, { filter: (r) => r.game_type === 'REG' }) : []
    for (const [id, stats] of Object.entries(aggregatePfrWeeks(kind, weekRows))) (byPlayer[id] ||= {})[season] = stats
    out[kind] = { byPlayer }
  }
  return out
}

/** ESPN Total QBR by season, keyed by ESPN id then season. */
export async function loadQbr(season) {
  const file = await download(rel('espn_data', 'qbr_season_level.csv'))
  const rows = await readCsv(file, { filter: (r) => r.season_type === 'Regular' })
  const byPlayer = {}
  const league = []
  for (const r of rows) {
    const y = num(r.season)
    const row = { qbr: num(r.qbr_total), rank: num(r.rank), plays: num(r.qb_plays), epa: num(r.epa_total), ptsAdded: num(r.pts_added), qualified: r.qualified === 'TRUE' }
    ;(byPlayer[r.player_id] ||= {})[y] = row
    if (y === season) league.push({ espnId: r.player_id, ...row })
  }
  return { byPlayer, league }
}

/** Combine results keyed by PFR id, with a pool per position for percentiles. */
export async function loadCombine() {
  const file = await download(rel('combine', 'combine.csv'), { ttlHours: 24 * 7 })
  const rows = await readCsv(file)
  const byPfr = {}
  const pools = {}
  const drills = ['forty', 'bench', 'vertical', 'broad_jump', 'cone', 'shuttle']
  for (const r of rows) {
    const rec = { season: num(r.season), pos: r.pos, school: r.school, height: r.ht || null, weight: num(r.wt) }
    for (const d of drills) rec[d] = num(r[d])
    if (r.pfr_id) byPfr[r.pfr_id] = rec
    const pool = (pools[r.pos] ||= {})
    for (const d of drills) if (rec[d] !== null) (pool[d] ||= []).push(rec[d])
    if (rec.weight !== null) (pool.weight ||= []).push(rec.weight)
  }
  for (const pool of Object.values(pools)) for (const k of Object.keys(pool)) pool[k].sort((a, b) => a - b)
  return { byPfr, pools }
}

/** Draft record + career value keyed by GSIS id (and PFR id as fallback). */
export async function loadDraft() {
  const file = await download(rel('draft_picks', 'draft_picks.csv'), { ttlHours: 24 })
  const rows = await readCsv(file, { filter: (r) => num(r.season) >= 2010 })
  const byGsis = {}
  const byPfr = {}
  for (const r of rows) {
    const rec = {
      season: num(r.season), round: num(r.round), pick: num(r.pick), team: r.team, position: r.position, college: r.college, age: num(r.age),
      allPro: n0(r.allpro), proBowls: n0(r.probowls), seasonsStarted: n0(r.seasons_started), weightedAv: num(r.w_av), careerAv: num(r.car_av), games: num(r.games),
    }
    if (r.gsis_id) byGsis[r.gsis_id] = rec
    if (r.pfr_player_id) byPfr[r.pfr_player_id] = rec
  }
  return { byGsis, byPfr }
}

/** All games since 1999 (schedule, results, lines, venue). */
export async function loadGames() {
  const file = await download(rel('schedules', 'games.csv'))
  return readCsv(file, {
    map: (r) => ({
      id: r.game_id, season: num(r.season), type: r.game_type, week: num(r.week), date: r.gameday, weekday: r.weekday, time: r.gametime,
      away: r.away_team, home: r.home_team, awayScore: num(r.away_score), homeScore: num(r.home_score), location: r.location,
      overtime: r.overtime === '1', espnId: r.espn || null, spread: num(r.spread_line), total: num(r.total_line),
      awayMoneyline: num(r.away_moneyline), homeMoneyline: num(r.home_moneyline), divGame: r.div_game === '1', roof: r.roof || null,
      surface: r.surface || null, temp: num(r.temp), wind: num(r.wind), awayRest: num(r.away_rest), homeRest: num(r.home_rest),
      awayQb: r.away_qb_name || null, homeQb: r.home_qb_name || null, awayCoach: r.away_coach || null, homeCoach: r.home_coach || null,
      referee: r.referee || null, stadium: r.stadium || null,
    }),
  })
}

/** Official weekly injury/practice report rows for the team: { gsis: [{week, ...}] } */
export async function loadInjuryReports(season) {
  const file = await download(rel('injuries', `injuries_${season}.csv`))
  if (!file) return {}
  const rows = await readCsv(file, { filter: (r) => r.team === TEAM })
  const out = {}
  for (const r of rows) {
    ;(out[r.gsis_id] ||= []).push({
      week: num(r.week),
      injury: r.report_primary_injury || r.practice_primary_injury || null,
      secondary: r.report_secondary_injury || r.practice_secondary_injury || null,
      gameStatus: r.report_status || null,
      practice: r.practice_status || null,
    })
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.week - b.week)
  return out
}
