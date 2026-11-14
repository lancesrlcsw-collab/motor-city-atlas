// Build every JSON file the site reads, from live sources.  Usage: npm run data
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { SEASON, TEAM, TEAM_NAME, SOURCES } from './config.mjs'
import * as nfl from './nflverse.mjs'
import * as espn from './espn.mjs'
import { loadContracts } from './contracts.mjs'
import { loadPbp } from './pbp.mjs'
import { loadWiki } from './wiki.mjs'
import { buildRoster, assignDepth } from './roster.mjs'
import { derive, poolOf, buildPercentiles } from './metrics.mjs'
import { buildLeagueRanks, buildSchedule, recordFrom, buildMatchup, buildCap, RANK_LABELS } from './team.mjs'
import { compact, round, percentileOf, ordinal, slugify, sum } from './lib/util.mjs'

const OUT = path.resolve('public/data')
const now = new Date()
const t0 = Date.now()
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s] ${msg}`)

// ---------------------------------------------------------------- identities
log('Loading roster, depth chart and player index')
const [index, nflRoster, espnRoster, depthCharts, teams] = await Promise.all([
  nfl.loadPlayersIndex(), nfl.loadRoster(SEASON), espn.loadRoster(), espn.loadDepth(), espn.loadTeams(),
])
const players = buildRoster({ espn: espnRoster, nflRoster, index, now })
const slots = assignDepth(players, depthCharts)
const ids = players.map((p) => p.gsis).filter(Boolean)
log(`  ${players.length} players (${players.filter((p) => p.roster === 'active').length} active, ${players.filter((p) => p.roster === 'reserve').length} reserve, ${players.filter((p) => p.roster === 'practice').length} practice squad)`)

// ---------------------------------------------------------------- statistics
log('Loading season, weekly and advanced statistics')
const firstSeason = Math.max(2010, Math.min(...players.map((p) => p.bio.rookieYear || SEASON)))
const seasonStats = await nfl.loadSeasonStats(ids, firstSeason, SEASON)
const [weekly, snaps, ngs, pfr, qbr, combine, draft, games, injuryReports, weeklyStatus] = await Promise.all([
  nfl.loadWeeklyStats(ids, [SEASON - 1, SEASON]), nfl.loadSnaps(SEASON), nfl.loadNgs(SEASON), nfl.loadPfrAdvanced(SEASON), nfl.loadQbr(SEASON),
  nfl.loadCombine(), nfl.loadDraft(), nfl.loadGames(), nfl.loadInjuryReports(SEASON), nfl.loadWeeklyStatus(SEASON),
])
log('Loading contracts')
const contracts = await loadContracts(SEASON, index.byGsis)
log('Reading play-by-play')
const pbp = await loadPbp(SEASON, ids)

// ---------------------------------------------------------------- ESPN context
log('Loading schedule, standings, injuries, news')
const [espnSchedule, standings, leagueInjuries, teamNews, transactions] = await Promise.all([
  espn.loadSchedule(SEASON), espn.loadStandings(SEASON), espn.loadInjuries(), espn.loadTeamNews(), espn.loadTransactions(SEASON),
])
const espnAthletes = await espn.loadAthletes(players.map((p) => p.espnId).filter(Boolean))
log('Loading Wikipedia / Wikidata backgrounds')
const wiki = await loadWiki(players.map((p) => ({ key: p.id, espnId: p.espnId, pfrId: p.pfrId, name: p.name, birthDate: p.bio.birthDate })))
log(`  ${Object.keys(wiki).length} of ${players.length} players matched`)

// ---------------------------------------------------------------- league percentile pools
const leagueGames = Math.max(1, ...Object.values(snaps.teamSeason || {}).map((t) => t.games))
const seasonFraction = Math.min(1, leagueGames / 17)
const kindFor = { QB: ['passing', 'pass'], RB: ['rushing', 'rush'], WR: ['receiving', 'rec'], TE: ['receiving', 'rec'] }

/** Add the rate stats PFR's weekly files leave out, using the season stat line for denominators. */
function withPfrRates(kind, rec, stat) {
  if (!rec || !stat) return rec
  const out = { ...rec }
  if (kind === 'pass' && stat.attempts) {
    const dropbacks = stat.attempts + (stat.sacks_suffered || 0)
    if (out.bad_throws != null) out.bad_throw_pct = round((out.bad_throws / stat.attempts) * 100, 1)
    if (out.times_pressured != null) out.pressure_pct = round((out.times_pressured / dropbacks) * 100, 1)
    if (out.drops != null) out.drop_pct = round((out.drops / stat.attempts) * 100, 1)
  }
  if (kind === 'rec' && stat.targets && out.drop != null) out.drop_percent = round((out.drop / stat.targets) * 100, 1)
  return out
}

function metricBag(row) {
  const idx = index.byGsis.get(row.gsis)
  const deal = contracts.find({ gsis: row.gsis, otcId: idx?.otcId, name: row.name })
  const bag = derive({ ...row })
  bag.pool = poolOf({ otcPosition: deal?.otcPosition, position: row.position })
  const sn = idx?.pfrId ? snaps.season[idx.pfrId] : null
  if (sn) Object.assign(bag, { snaps_off: sn.off, snaps_def: sn.def, snaps_st: sn.st, snaps_off_pct: round(sn.offPct, 3), snaps_def_pct: round(sn.defPct, 3), snaps_st_pct: round(sn.stPct, 3) })
  const [ngsKind, pfrKind] = kindFor[bag.pool] || [null, 'def']
  const n = ngsKind ? ngs[ngsKind].byPlayer[row.gsis]?.[SEASON] : null
  if (n) for (const [k, v] of Object.entries(n)) bag[`ngs_${k}`] = v
  const a = idx?.pfrId ? withPfrRates(pfrKind, pfr[pfrKind].byPlayer[idx.pfrId]?.[SEASON], bag) : null
  if (a) for (const [k, v] of Object.entries(a)) bag[`pfr_${k}`] = v
  const q = idx?.espnId ? qbr.byPlayer[idx.espnId]?.[SEASON] : null
  if (q?.qbr != null) bag.qbr = q.qbr
  return bag
}
const bags = seasonStats.league.map(metricBag)
const bagById = new Map(bags.map((b) => [b.gsis, b]))
const rank = buildPercentiles(bags, seasonFraction)

// ---------------------------------------------------------------- per-player dossiers
const gameById = new Map(games.map((g) => [g.id, g]))
const NON_ADDITIVE = new Set(['passing_cpoe', 'pacr', 'racr', 'target_share', 'air_yards_share', 'wopr', 'fg_pct', 'pat_pct', 'season', 'games'])
const MAX_KEYS = new Set(['fg_long', 'pt_long'])
const DERIVED = new Set(['cmp_pct', 'ypa', 'td_pct', 'int_pct', 'passer_rating', 'sack_pct', 'anya', 'epa_per_dropback', 'ypc', 'rush_epa_per_att', 'catch_pct', 'ypt', 'adot', 'rec_epa_per_target', 'ypr', 'yac_per_rec', 'scrimmage_yards', 'total_tds', 'tackles', 'punt_avg', 'punt_net', 'punt_in20_pct'])

function careerTotals(rows) {
  const reg = rows.filter((x) => x.type === 'REG')
  if (!reg.length) return null
  const t = { seasons: reg.length, games: sum(reg, (x) => x.games), teams: [...new Set(reg.map((x) => x.team))] }
  for (const row of reg) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v !== 'number' || NON_ADDITIVE.has(k) || DERIVED.has(k)) continue
      t[k] = MAX_KEYS.has(k) ? Math.max(t[k] ?? 0, v) : round((t[k] ?? 0) + v, 3)
    }
  }
  return derive(t)
}

function combineFor(p) {
  const c = p.pfrId ? combine.byPfr[p.pfrId] : null
  if (!c) return null
  const pool = combine.pools[c.pos] || {}
  const drills = [['forty', '40-yard dash', 'sec', true], ['bench', 'Bench press', 'reps', false], ['vertical', 'Vertical jump', 'in', false], ['broad_jump', 'Broad jump', 'in', false], ['cone', '3-cone drill', 'sec', true], ['shuttle', '20-yard shuttle', 'sec', true]]
  const out = []
  for (const [key, label, unit, lowBetter] of drills) {
    if (c[key] === null) continue
    const raw = percentileOf(pool[key] || [], c[key])
    out.push({ key, label, unit, value: c[key], pct: raw === null ? null : lowBetter ? 100 - raw : raw })
  }
  return out.length ? { year: c.season, position: c.pos, school: c.school, drills: out, poolNote: `Percentiles vs. every ${c.pos} measured at the combine since 2000` } : null
}

function lineFor(p, s, sn) {
  if (!s && !sn) return []
  const v = (k) => s?.[k] ?? 0
  const fmt = (n) => n.toLocaleString('en-US')
  switch (p.group) {
    case 'QB': return [['YDS', fmt(v('passing_yards'))], ['TD', v('passing_tds')], ['INT', v('passing_interceptions')]]
    case 'RB': return [['RUSH', fmt(v('rushing_yards'))], ['YPC', s?.ypc ?? '—'], ['TD', v('total_tds')]]
    case 'WR': case 'TE': return [['REC', v('receptions')], ['YDS', fmt(v('receiving_yards'))], ['TD', v('receiving_tds')]]
    case 'OL': return sn ? [['SNAPS', sn.off], ['SHARE', `${Math.round(sn.offPct * 100)}%`], ['PEN', v('penalties')]] : []
    case 'DL': return [['TKL', v('tackles')], ['SACK', v('def_sacks')], ['QB HIT', v('def_qb_hits')]]
    case 'LB': return [['TKL', v('tackles')], ['TFL', v('def_tackles_for_loss')], ['SACK', v('def_sacks')]]
    case 'DB': return [['TKL', v('tackles')], ['PD', v('def_pass_defended')], ['INT', v('def_interceptions')]]
    default:
      if (v('fg_att')) return [['FG', `${v('fg_made')}/${v('fg_att')}`], ['LONG', v('fg_long')], ['XP', `${v('pat_made')}/${v('pat_att')}`]]
      if (v('pt_att')) return [['PUNTS', v('pt_att')], ['AVG', s?.punt_avg ?? '—'], ['IN 20', v('pt_inside_20')]]
      return sn ? [['ST SNAPS', sn.st]] : []
  }
}

const money = (m) => (m >= 1 ? `$${(Math.round(m * 10) / 10).toFixed(1)}M` : `$${Math.round(m * 1000)}K`)

function insightsFor(p, d) {
  const out = []
  const top = (d.percentiles?.metrics || []).filter((m) => m.pct !== null && m.direction !== 'neutral' && m.rank).sort((a, b) => b.pct - a.pct).slice(0, 2)
  for (const m of top) if (m.pct >= 70) out.push(`Ranks ${ordinal(m.rank)} of ${m.of} qualified ${d.percentiles.poolLabel} in ${m.label.toLowerCase()}.`)
  if (d.snaps?.season) {
    const s = d.snaps.season
    const unit = p.unit === 'offense' ? ['offensive', s.offPct] : p.unit === 'defense' ? ['defensive', s.defPct] : ['special-teams', s.stPct]
    if (unit[1] >= 0.15) out.push(`On the field for ${Math.round(unit[1] * 100)}% of Detroit’s ${unit[0]} snaps this season.`)
  }
  if (d.contract) {
    const c = d.contract
    if (c.capRank && c.capHit) out.push(`${SEASON} cap number of ${money(c.capHit)} is the ${c.capRank === 1 ? '' : `${ordinal(c.capRank)}-`}largest on the roster.`)
    if (c.throughYear) out.push(c.throughYear === SEASON ? `Contract expires after this season.` : `Under contract through ${c.throughYear}.`)
  }
  const b = p.bio.draft
  if (b?.round) out.push(`Drafted ${ordinal(b.pick)} overall in ${b.year} (round ${b.round}) by ${b.team}.`)
  else if (p.bio.rookieYear) out.push(`Entered the league in ${p.bio.rookieYear} as an undrafted free agent.`)
  return out.slice(0, 5)
}

log('Assembling player dossiers')
const capOrder = players.map((p) => ({ p, deal: contracts.find(p) })).filter((x) => x.deal?.capHit).sort((a, b) => b.deal.capHit - a.deal.capHit)
const capRankOf = new Map(capOrder.map((x, i) => [x.p.id, i + 1]))
const espnInjuries = new Map((leagueInjuries[espn.ESPN_TEAM_ID] || []).filter((i) => i.espnId).map((i) => [String(i.espnId), i]))
const currentWeek = Math.max(1, ...Object.values(injuryReports).flat().map((x) => x.week))

const dossiers = []
for (const p of players) {
  const deal = contracts.find(p)
  const rows = (p.gsis && seasonStats.rowsByPlayer[p.gsis] ? seasonStats.rowsByPlayer[p.gsis] : []).map(derive).sort((a, b) => a.season - b.season || (a.type === 'REG' ? -1 : 1))
  const current = rows.find((x) => x.season === SEASON && x.type === 'REG') || null
  const sn = p.pfrId ? snaps.season[p.pfrId] : null
  const bag = p.gsis ? bagById.get(p.gsis) : null
  const log_ = (p.gsis && weekly[p.gsis] ? weekly[p.gsis] : []).map((w) => {
    const g = gameById.get(w.gameId)
    const row = derive({ ...w })
    if (g && g.homeScore !== null) {
      const home = g.home === w.team
      const us = home ? g.homeScore : g.awayScore, them = home ? g.awayScore : g.homeScore
      row.home = home; row.result = `${us > them ? 'W' : us < them ? 'L' : 'T'} ${us}-${them}`
    }
    delete row.gameId
    return row
  })
  const reports = p.gsis ? injuryReports[p.gsis] || [] : []
  const thisWeek = reports.find((x) => x.week === currentWeek) || null
  const ei = p.espnId ? espnInjuries.get(String(p.espnId)) : null
  const ea = p.espnId ? espnAthletes[p.espnId] : null
  const w = wiki[p.id] || null
  const play = p.gsis ? pbp.players[p.gsis] : null
  const dr = (p.gsis && draft.byGsis[p.gsis]) || (p.pfrId && draft.byPfr[p.pfrId]) || null

  // Game-week availability, strongest signal first.
  let availability = { status: 'Available', tone: 'ok' }
  if (p.roster === 'reserve') availability = { status: p.rosterDetail, tone: 'out' }
  else if (p.roster === 'practice') availability = { status: 'Practice squad', tone: 'muted' }
  if (p.roster === 'active') {
    // "Active" on ESPN's report means cleared to play, so it is not a designation.
    const st = [thisWeek?.gameStatus, ei?.status, p.injury?.status].find((x) => x && !/^active$/i.test(x)) || null
    if (st) availability = { status: st, tone: /out|doubtful|reserve|suspen/i.test(st) ? 'out' : 'warn' }
  }
  availability.injury = thisWeek?.injury || ei?.type || null
  availability.practice = thisWeek?.practice || null
  availability.week = thisWeek ? currentWeek : null
  availability.returnDate = ei?.returnDate || null

  const contract = deal ? {
    otcPosition: deal.otcPosition, type: deal.type, yearSigned: deal.yearSigned, years: deal.years, value: deal.value, apy: deal.apy, guaranteed: deal.guaranteed,
    apyCapPct: deal.apyCapPct, apyRank: deal.apyRank, throughYear: deal.throughYear, freeAgentYear: deal.freeAgentYear, capHit: deal.capHit, capRank: capRankOf.get(p.id) || null,
    cashThisYear: deal.cashThisYear, careerCash: deal.careerCash, seasons: deal.seasons, history: deal.history,
  } : null

  const d = {
    ...p,
    availability,
    line: lineFor(p, current, sn).map(([label, value]) => ({ label, value })),
    stats: { seasons: rows, career: careerTotals(rows), games: log_ },
    snaps: sn ? { season: { games: sn.games, off: sn.off, def: sn.def, st: sn.st, offPct: round(sn.offPct, 3), defPct: round(sn.defPct, 3), stPct: round(sn.stPct, 3) }, games: snaps.games[p.pfrId] || [] } : null,
    percentiles: bag ? rank(bag) : null,
    advanced: {
      ngs: p.gsis ? compact({ passing: ngs.passing.byPlayer[p.gsis], receiving: ngs.receiving.byPlayer[p.gsis], rushing: ngs.rushing.byPlayer[p.gsis] }) : null,
      pfr: p.pfrId ? compact({
        passing: pfr.pass.byPlayer[p.pfrId] && { ...pfr.pass.byPlayer[p.pfrId], [SEASON]: withPfrRates('pass', pfr.pass.byPlayer[p.pfrId][SEASON], current) },
        rushing: pfr.rush.byPlayer[p.pfrId],
        receiving: pfr.rec.byPlayer[p.pfrId] && { ...pfr.rec.byPlayer[p.pfrId], [SEASON]: withPfrRates('rec', pfr.rec.byPlayer[p.pfrId][SEASON], current) },
        defense: pfr.def.byPlayer[p.pfrId],
      }) : null,
      qbr: p.espnId ? qbr.byPlayer[p.espnId] || null : null,
    },
    combine: combineFor(p),
    draft: dr,
    contract,
    plays: play?.plays || [],
    zones: play ? compact({ pass: play.pass, recv: play.recv, rush: play.rush }) : null,
    splits: play?.splits || null,
    reports,
    weeklyStatus: p.gsis ? weeklyStatus[p.gsis] || [] : [],
    espn: ea && !ea.error ? { summaryLabel: ea.summaryLabel, summary: ea.summary, birthPlace: ea.birthPlace, draftText: ea.draftText } : null,
    news: ea?.news || [],
    wiki: w,
    transactions: transactions.filter((t) => t.text && p.last && t.text.includes(p.name)).slice(0, 12),
    links: compact({
      espn: p.espnId ? `https://www.espn.com/nfl/player/_/id/${p.espnId}` : null,
      pfr: p.pfrId ? `https://www.pro-football-reference.com/players/${p.pfrId[0]}/${p.pfrId}.htm` : null,
      pff: p.pffId ? `https://www.pff.com/nfl/players/${slugify(p.name)}/${p.pffId}` : null,
      otc: p.otcId ? `https://overthecap.com/player/${slugify(p.name)}/${p.otcId}` : null,
      wikipedia: w?.url || null,
    }),
  }
  if (d.espn?.birthPlace && !d.bio.birthPlace) d.bio.birthPlaceText = d.espn.birthPlace
  d.insights = insightsFor(p, d)
  dossiers.push(d)
}

// ---------------------------------------------------------------- team file
log('Assembling team, schedule, matchup and cap')
const ranks = buildLeagueRanks({ pbp, games })
const schedule = buildSchedule({ games, espnSchedule, pbp, teams })
const record = recordFrom(schedule)
const next = schedule.find((g) => !g.result) || null
const summary = next?.espnId ? await espn.loadSummary(next.espnId) : null
const matchup = buildMatchup({ next, ranks, games, summary, standings, teams, schedule })
const cap = buildCap({ players: dossiers, contractsLeague: contracts.league })
const division = standings.find((d) => d.teams.some((t) => t.abbr === TEAM)) || null
const self = division?.teams.find((t) => t.abbr === TEAM) || null

const team = {
  generatedAt: now.toISOString(), season: SEASON, week: next?.week ?? schedule.at(-1)?.week ?? null,
  team: { abbr: TEAM, name: TEAM_NAME, coach: espnRoster.coach, record, standing: espnRoster.standing, seed: self?.seed ?? null, division: division?.name || null, bye: espnSchedule.bye },
  standings, schedule, matchup,
  ranks: { labels: RANK_LABELS, teams: ranks },
  zones: pbp.teamZones,
  cap,
  injuries: dossiers.filter((d) => d.availability.tone !== 'ok' && d.roster !== 'practice').map((d) => ({ slug: d.slug, name: d.name, position: d.position, roster: d.roster, ...d.availability })),
  transactions: transactions.slice(0, 60),
  news: teamNews.filter((n) => n.focused).slice(0, 24).map(({ focused, ...n }) => n),
  depth: { slots, charts: depthCharts.map((c) => c.name) },
  teams,
  sources: SOURCES,
}

// ---------------------------------------------------------------- light roster for the 3D scene
const roster = dossiers.map((d) => compact({
  id: d.id, slug: d.slug, name: d.name, first: d.first, last: d.last, number: d.number, position: d.position, group: d.group, unit: d.unit,
  roster: d.roster, rosterDetail: d.rosterDetail, depth: d.depth || null, roles: d.roles || null,
  height: d.bio.height, weight: d.bio.weight, age: d.bio.age, experience: d.bio.experience, college: d.bio.college,
  draft: d.bio.draft ? { year: d.bio.draft.year, round: d.bio.draft.round, pick: d.bio.draft.pick } : null,
  availability: { status: d.availability.status, tone: d.availability.tone, injury: d.availability.injury },
  line: d.line,
  lens: {
    cap: d.contract?.capHit ?? null, apy: d.contract?.apy ?? null, through: d.contract?.throughYear ?? null,
    snaps: d.snaps ? round(d.unit === 'offense' ? d.snaps.season.offPct : d.unit === 'defense' ? d.snaps.season.defPct : d.snaps.season.stPct, 3) : null,
    index: d.percentiles?.index ?? null,
  },
}))

// ---------------------------------------------------------------- compact context for the Ask feature
const askTeam = {
  generatedAt: team.generatedAt, season: SEASON, team: TEAM_NAME, coach: espnRoster.coach?.name, record: `${record.wins}-${record.losses}${record.ties ? `-${record.ties}` : ''}`,
  standing: espnRoster.standing, streak: record.streak,
  schedule: schedule.map((g) => `Wk ${g.week}: ${g.home ? 'vs' : '@'} ${g.opp} ${g.date}${g.result ? ` ${g.result.outcome} ${g.result.us}-${g.result.them}` : ` (${g.weekday} ${g.timeET} ET${g.neutral ? `, neutral site ${g.venue}` : ''})`}`),
  nextGame: matchup ? { week: matchup.week, opponent: matchup.oppName, kickoff: matchup.kickoff, venue: matchup.venue, city: matchup.city, line: matchup.line, total: matchup.total, projection: matchup.projection, opponentRecord: matchup.oppRecord } : null,
  cap: { leagueCap: cap.leagueCap, committedByRosterContracts: cap.committed, note: cap.notes[1], groups: cap.groups.map((g) => ({ group: g.group, total: g.total, leagueRank: g.leagueRank })) },
  teamRanks: ranks[TEAM],
  players: dossiers.map((d) => compact({
    slug: d.slug, name: d.name, number: d.number, position: d.position, roster: d.rosterDetail, depth: d.depth ? `${d.depth.label}${d.depth.rank}` : null,
    age: d.bio.age, height: d.bio.height, weight: d.bio.weight, college: d.bio.college, experience: d.bio.experience,
    draft: d.bio.draft?.round ? `${d.bio.draft.year} R${d.bio.draft.round} #${d.bio.draft.pick} ${d.bio.draft.team}` : 'undrafted',
    availability: d.availability.status + (d.availability.injury ? ` (${d.availability.injury})` : ''),
    statLine: d.line.map((x) => `${x.value} ${x.label}`).join(', ') || null,
    index: d.percentiles?.index ?? null,
    contract: d.contract ? { years: d.contract.years, value: d.contract.value, apy: d.contract.apy, guaranteed: d.contract.guaranteed, capHit: d.contract.capHit, through: d.contract.throughYear } : null,
  })),
}

// ---------------------------------------------------------------- write
// Skip the write when nothing but the timestamp would change, so scheduled runs only
// produce a commit (and a redeploy) when the data really moved.
const files = new Map([
  ['team.json', team],
  ['roster.json', roster],
  ['ask-team.json', askTeam],
  ...dossiers.map((d) => [`players/${d.slug}.json`, d]),
])
const stable = (obj) => JSON.stringify(compact(obj), (k, v) => (k === 'generatedAt' ? undefined : v))
const hash = crypto.createHash('sha256')
for (const [name, data] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) hash.update(name).update(stable(data))
const contentHash = hash.digest('hex').slice(0, 20)
let previous = null
try { previous = JSON.parse(await fs.readFile(path.join(OUT, 'meta.json'), 'utf8')) } catch { /* first run */ }
if (previous?.contentHash === contentHash && process.env.PIPELINE_FORCE !== '1') {
  log(`No changes since ${previous.generatedAt}; nothing written`)
} else {
  log('Writing files')
  await fs.mkdir(path.join(OUT, 'players'), { recursive: true })
  const write = (file, data) => fs.writeFile(path.join(OUT, file), JSON.stringify(compact(data)))
  await Promise.all([...files].map(([name, data]) => write(name, data)))
  // Remove dossiers of players who are no longer with the club.
  for (const f of await fs.readdir(path.join(OUT, 'players'))) {
    if (!files.has(`players/${f}`)) await fs.rm(path.join(OUT, 'players', f))
  }
  await write('meta.json', { generatedAt: team.generatedAt, contentHash, season: SEASON, players: dossiers.length })
  const size = async (f) => (await fs.stat(path.join(OUT, f))).size
  log(`Done: ${dossiers.length} dossiers, team.json ${(await size('team.json') / 1024).toFixed(0)} KB, roster.json ${(await size('roster.json') / 1024).toFixed(0)} KB`)
}
