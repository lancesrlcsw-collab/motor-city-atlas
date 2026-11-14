// Team-level assembly: league rankings, schedule and results, next-opponent preview, salary-cap picture.
import { TEAM, SEASON, LEAGUE_CAP, LEAGUE_CAP_SOURCE } from './config.mjs'
import { OTC_GROUP } from './contracts.mjs'
import { round, sum } from './lib/util.mjs'

const r = (v, d = 3) => round(v, d)

/** Efficiency + scoring table for all 32 clubs with ranks (1 = best). */
export function buildLeagueRanks({ pbp, games }) {
  const done = games.filter((g) => g.season === SEASON && g.type === 'REG' && g.homeScore !== null)
  const pts = {}
  for (const g of done) {
    const h = (pts[g.home] ||= { pf: 0, pa: 0, g: 0 }); const a = (pts[g.away] ||= { pf: 0, pa: 0, g: 0 })
    h.pf += g.homeScore; h.pa += g.awayScore; h.g++
    a.pf += g.awayScore; a.pa += g.homeScore; a.g++
  }
  const side = (s, p, kind) => {
    if (!s || !s.plays) return null
    const g = p?.g || 1
    return {
      [kind === 'off' ? 'ppg' : 'papg']: r((kind === 'off' ? p?.pf : p?.pa) / g, 1),
      ypg: r(s.yards / g, 1),
      epaPlay: r(s.epa / s.plays),
      success: r((s.success / s.plays) * 100, 1),
      passEpa: s.dropbacks ? r(s.dropbackEpa / s.dropbacks) : null,
      rushEpa: s.rushes ? r(s.rushEpa / s.rushes) : null,
      explosive: r((s.explosive / s.plays) * 100, 1),
      third: s.third ? r((s.thirdConv / s.third) * 100, 1) : null,
      redZone: s.rzDrives ? r((s.rzTds / s.rzDrives) * 100, 1) : null,
      turnovers: s.turnovers,
      sacks: s.sacks,
      passRate: r((s.dropbacks / s.plays) * 100, 1),
    }
  }
  const table = {}
  for (const team of Object.keys(pts)) table[team] = { games: pts[team].g, off: side(pbp.off[team], pts[team], 'off'), def: side(pbp.def[team], pts[team], 'def') }

  // Direction of "better" for ranking.
  const offHigh = ['ppg', 'ypg', 'epaPlay', 'success', 'passEpa', 'rushEpa', 'explosive', 'third', 'redZone']
  const offLow = ['turnovers', 'sacks']
  const defLow = ['papg', 'ypg', 'epaPlay', 'success', 'passEpa', 'rushEpa', 'explosive', 'third', 'redZone']
  const defHigh = ['turnovers', 'sacks']
  const rankKey = (unit, key, high) => {
    const list = Object.entries(table).filter(([, t]) => t[unit]?.[key] !== null && t[unit]?.[key] !== undefined).sort((a, b) => (high ? b[1][unit][key] - a[1][unit][key] : a[1][unit][key] - b[1][unit][key]))
    list.forEach(([team], i) => {
      // Ties share the better rank.
      const prev = i > 0 ? list[i - 1] : null
      const rank = prev && prev[1][unit][key] === table[team][unit][key] ? table[prev[0]][`${unit}Rank`][key] : i + 1
      ;(table[team][`${unit}Rank`] ||= {})[key] = rank
    })
  }
  for (const k of offHigh) rankKey('off', k, true)
  for (const k of offLow) rankKey('off', k, false)
  for (const k of defLow) rankKey('def', k, false)
  for (const k of defHigh) rankKey('def', k, true)
  return table
}

export const RANK_LABELS = {
  off: { ppg: 'Points per game', ypg: 'Yards per game', epaPlay: 'EPA per play', success: 'Success rate %', passEpa: 'EPA per dropback', rushEpa: 'EPA per rush', explosive: 'Explosive-play rate %', third: 'Third-down %', redZone: 'Red-zone TD %', turnovers: 'Giveaways', sacks: 'Sacks allowed' },
  def: { papg: 'Points allowed per game', ypg: 'Yards allowed per game', epaPlay: 'EPA per play allowed', success: 'Success rate allowed %', passEpa: 'EPA per dropback allowed', rushEpa: 'EPA per rush allowed', explosive: 'Explosive plays allowed %', third: 'Third-down % allowed', redZone: 'Red-zone TD % allowed', turnovers: 'Takeaways', sacks: 'Sacks' },
}

export function buildSchedule({ games, espnSchedule, pbp, teams }) {
  const ours = games.filter((g) => g.season === SEASON && (g.home === TEAM || g.away === TEAM)).sort((a, b) => a.date.localeCompare(b.date))
  return ours.map((g) => {
    const home = g.home === TEAM
    const opp = home ? g.away : g.home
    const e = espnSchedule.events.find((ev) => ev.espnId === g.espnId) || espnSchedule.events.find((ev) => ev.week === g.week && ev.opp === opp) || {}
    const done = g.homeScore !== null
    const us = done ? (home ? g.homeScore : g.awayScore) : null
    const them = done ? (home ? g.awayScore : g.homeScore) : null
    const p = pbp.games[g.id]
    return {
      id: g.id, espnId: g.espnId || e.espnId || null, week: g.week, type: g.type, date: g.date, weekday: g.weekday, timeET: g.time, kickoff: e.date || null,
      opp, oppName: teams[opp]?.name || e.oppName || opp, oppColor: teams[opp]?.color || null, oppAltColor: teams[opp]?.altColor || null,
      home, neutral: g.location === 'Neutral' || !!e.neutral, venue: e.venue || g.stadium, city: e.city || null, roof: g.roof, surface: g.surface, tv: e.tv || [],
      divisionGame: g.divGame, line: g.spread === null ? null : home ? -g.spread : g.spread, total: g.total, rest: home ? g.homeRest : g.awayRest,
      oppCoach: home ? g.awayCoach : g.homeCoach, oppQb: home ? g.awayQb : g.homeQb, note: e.note || null,
      result: done ? { us, them, outcome: us > them ? 'W' : us < them ? 'L' : 'T', overtime: g.overtime } : null,
      wp: p?.wp || null, turningPoints: p?.plays || null,
    }
  })
}

export function recordFrom(schedule) {
  const rec = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, home: [0, 0, 0], road: [0, 0, 0], division: [0, 0, 0], streak: null, last5: [] }
  const played = schedule.filter((g) => g.result && g.type === 'REG')
  for (const g of played) {
    const i = g.result.outcome === 'W' ? 0 : g.result.outcome === 'L' ? 1 : 2
    rec[['wins', 'losses', 'ties'][i]]++
    rec.pointsFor += g.result.us; rec.pointsAgainst += g.result.them
    if (!g.neutral) (g.home ? rec.home : rec.road)[i]++
    if (g.divisionGame) rec.division[i]++
  }
  if (played.length) {
    const last = played.at(-1).result.outcome
    let n = 0
    for (let i = played.length - 1; i >= 0 && played[i].result.outcome === last; i--) n++
    rec.streak = `${last}${n}`
    rec.last5 = played.slice(-5).map((g) => g.result.outcome)
  }
  return rec
}

export function buildMatchup({ next, ranks, games, summary, standings, teams, schedule }) {
  if (!next) return null
  const opp = next.opp
  const us = ranks[TEAM], them = ranks[opp]
  const row = (label, a, aRank, b, bRank, betterHigh) => ({ label, det: a, detRank: aRank, opp: b, oppRank: bRank, betterHigh })
  const compare = us && them ? {
    detOffense: [
      row('Points per game vs. allowed', us.off.ppg, us.offRank.ppg, them.def.papg, them.defRank.papg),
      row('EPA per play', us.off.epaPlay, us.offRank.epaPlay, them.def.epaPlay, them.defRank.epaPlay),
      row('Success rate %', us.off.success, us.offRank.success, them.def.success, them.defRank.success),
      row('EPA per dropback', us.off.passEpa, us.offRank.passEpa, them.def.passEpa, them.defRank.passEpa),
      row('EPA per rush', us.off.rushEpa, us.offRank.rushEpa, them.def.rushEpa, them.defRank.rushEpa),
      row('Explosive-play rate %', us.off.explosive, us.offRank.explosive, them.def.explosive, them.defRank.explosive),
      row('Third-down %', us.off.third, us.offRank.third, them.def.third, them.defRank.third),
      row('Red-zone TD %', us.off.redZone, us.offRank.redZone, them.def.redZone, them.defRank.redZone),
      row('Giveaways vs. takeaways', us.off.turnovers, us.offRank.turnovers, them.def.turnovers, them.defRank.turnovers),
      row('Sacks allowed vs. sacks', us.off.sacks, us.offRank.sacks, them.def.sacks, them.defRank.sacks),
    ],
    detDefense: [
      row('Points allowed vs. per game', us.def.papg, us.defRank.papg, them.off.ppg, them.offRank.ppg),
      row('EPA per play', us.def.epaPlay, us.defRank.epaPlay, them.off.epaPlay, them.offRank.epaPlay),
      row('Success rate %', us.def.success, us.defRank.success, them.off.success, them.offRank.success),
      row('EPA per dropback', us.def.passEpa, us.defRank.passEpa, them.off.passEpa, them.offRank.passEpa),
      row('EPA per rush', us.def.rushEpa, us.defRank.rushEpa, them.off.rushEpa, them.offRank.rushEpa),
      row('Explosive-play rate %', us.def.explosive, us.defRank.explosive, them.off.explosive, them.offRank.explosive),
      row('Third-down %', us.def.third, us.defRank.third, them.off.third, them.offRank.third),
      row('Red-zone TD %', us.def.redZone, us.defRank.redZone, them.off.redZone, them.offRank.redZone),
      row('Takeaways vs. giveaways', us.def.turnovers, us.defRank.turnovers, them.off.turnovers, them.offRank.turnovers),
      row('Sacks vs. sacks allowed', us.def.sacks, us.defRank.sacks, them.off.sacks, them.offRank.sacks),
    ],
  } : null

  const meetings = games
    .filter((g) => g.homeScore !== null && ((g.home === TEAM && g.away === opp) || (g.away === TEAM && g.home === opp)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((g) => {
      const home = g.home === TEAM
      const a = home ? g.homeScore : g.awayScore, b = home ? g.awayScore : g.homeScore
      return { season: g.season, week: g.week, type: g.type, date: g.date, home, us: a, them: b, outcome: a > b ? 'W' : a < b ? 'L' : 'T' }
    })
  const tally = { W: 0, L: 0, T: 0 }
  for (const m of meetings) tally[m.outcome]++

  const oppStanding = standings.flatMap((d) => d.teams.map((t) => ({ ...t, division: d.name }))).find((t) => t.abbr === opp) || null
  const homeIsUs = next.home
  const projection = summary?.predictor ? { det: homeIsUs ? summary.predictor.home : summary.predictor.away, opp: homeIsUs ? summary.predictor.away : summary.predictor.home, source: 'ESPN matchup predictor' } : null
  return {
    week: next.week, opp, oppName: next.oppName, oppColor: next.oppColor, oppAltColor: next.oppAltColor, kickoff: next.kickoff, date: next.date, weekday: next.weekday, timeET: next.timeET,
    home: next.home, neutral: next.neutral, venue: summary?.venue?.name || next.venue, city: summary?.venue?.city || next.city, roof: next.roof, surface: next.surface,
    tv: summary?.broadcasts?.length ? summary.broadcasts : next.tv, line: summary?.odds?.spread != null ? (homeIsUs ? summary.odds.spread : -summary.odds.spread) : next.line,
    total: summary?.odds?.overUnder ?? next.total, oddsProvider: summary?.odds?.provider || null, projection, weather: summary?.weather || null,
    oppCoach: next.oppCoach, oppQb: next.oppQb, oppRecord: oppStanding ? { wins: oppStanding.wins, losses: oppStanding.losses, ties: oppStanding.ties, division: oppStanding.division, streak: oppStanding.streak, seed: oppStanding.seed } : null,
    compare,
    injuries: { det: summary?.injuries?.find((t) => t.team === TEAM)?.list || [], opp: summary?.injuries?.find((t) => t.team === opp)?.list || [] },
    leaders: { det: summary?.leaders?.find((t) => t.team === TEAM)?.list || [], opp: summary?.leaders?.find((t) => t.team === opp)?.list || [] },
    lastFive: { det: summary?.lastFive?.find((t) => t.team === TEAM)?.games || [], opp: summary?.lastFive?.find((t) => t.team === opp)?.games || [] },
    history: { since: 1999, record: tally, meetings: meetings.slice(0, 10) },
    oppSchedule: null,
  }
}

/** Salary-cap picture from each rostered player's active contract. */
export function buildCap({ players, contractsLeague }) {
  const withDeal = players.filter((p) => p.contract)
  const cur = (p) => p.contract.seasons.find((s) => s.year === SEASON)
  const leagueCap = LEAGUE_CAP[SEASON] ?? null
  const rows = withDeal
    .map((p) => {
      const s = cur(p)
      return {
        id: p.id, slug: p.slug, name: p.name, position: p.position, group: OTC_GROUP[p.contract.otcPosition] || p.group, unit: p.unit, roster: p.roster,
        capHit: s?.cap ?? null, base: s?.base ?? 0, prorated: s?.prorated ?? 0, bonuses: r((s?.roster ?? 0) + (s?.option ?? 0) + (s?.workout ?? 0) + (s?.perGame ?? 0) + (s?.other ?? 0), 4),
        cash: s?.cash ?? 0, apy: p.contract.apy, guaranteed: p.contract.guaranteed, value: p.contract.value, years: p.contract.years, throughYear: p.contract.throughYear, freeAgentYear: p.contract.freeAgentYear,
        capPct: leagueCap && s?.cap ? r((s.cap / leagueCap) * 100, 2) : null, type: p.contract.type,
      }
    })
    .sort((a, b) => (b.capHit ?? -1) - (a.capHit ?? -1) || (b.apy ?? 0) - (a.apy ?? 0))
  const total = r(sum(rows, (x) => x.capHit), 3)
  const unpriced = rows.filter((x) => x.capHit === null)

  const groups = {}
  for (const x of rows) {
    const g = (groups[x.group] ||= { group: x.group, total: 0, players: 0 })
    g.total += x.capHit ?? 0; g.players++
  }
  const groupList = Object.values(groups).map((g) => {
    const league = Object.entries(contractsLeague).map(([team, t]) => ({ team, v: t.groups[g.group] || 0 })).sort((a, b) => b.v - a.v)
    const rank = league.findIndex((t) => t.team === TEAM) + 1
    return { ...g, total: r(g.total, 3), share: total ? r((g.total / total) * 100, 1) : null, leagueRank: rank || null, leagueAvg: r(sum(league, (t) => t.v) / (league.length || 1), 2), leagueMax: league[0] ? { team: league[0].team, total: r(league[0].v, 2) } : null }
  }).sort((a, b) => b.total - a.total)

  const leagueTotals = Object.entries(contractsLeague).map(([team, t]) => ({ team, total: r(t.total, 2) })).sort((a, b) => b.total - a.total)
  const future = []
  for (let y = SEASON; y <= SEASON + 4; y++) {
    const list = withDeal.map((p) => ({ p, s: p.contract.seasons.find((x) => x.year === y && !x.void) })).filter((x) => x.s && (x.s.cap ?? 0) > 0)
    future.push({
      year: y, committed: r(sum(list, (x) => x.s.cap), 2), players: list.length, leagueCap: LEAGUE_CAP[y] ?? null,
      guaranteed: r(sum(list, (x) => x.s.guaranteed ?? 0), 2),
      top: list.sort((a, b) => b.s.cap - a.s.cap).slice(0, 5).map((x) => ({ slug: x.p.slug, name: x.p.name, cap: x.s.cap })),
    })
  }
  const pctSum = sum(withDeal, (p) => cur(p)?.capPct ?? 0)
  const capWithPct = sum(withDeal, (p) => (cur(p)?.capPct ? cur(p).cap : 0))
  return {
    season: SEASON, leagueCap, leagueCapSource: LEAGUE_CAP_SOURCE,
    committed: total, playersCounted: rows.length - unpriced.length,
    unpriced: unpriced.map((x) => ({ slug: x.slug, name: x.name, position: x.position, apy: x.apy, value: x.value })),
    byRoster: { active: r(sum(rows.filter((x) => x.roster === 'active'), (x) => x.capHit), 2), reserve: r(sum(rows.filter((x) => x.roster === 'reserve'), (x) => x.capHit), 2), practice: r(sum(rows.filter((x) => x.roster === 'practice'), (x) => x.capHit), 2) },
    byUnit: { offense: r(sum(rows.filter((x) => x.unit === 'offense'), (x) => x.capHit), 2), defense: r(sum(rows.filter((x) => x.unit === 'defense'), (x) => x.capHit), 2), special: r(sum(rows.filter((x) => x.unit === 'special'), (x) => x.capHit), 2) },
    cash: r(sum(rows, (x) => x.cash), 2),
    guaranteedTotal: r(sum(rows, (x) => x.guaranteed ?? 0), 2),
    impliedTeamCap: pctSum > 0.3 ? r(capWithPct / pctSum, 1) : null,
    leagueRank: leagueTotals.findIndex((t) => t.team === TEAM) + 1 || null,
    leagueTotals,
    groups: groupList,
    players: rows,
    future,
    expiring: rows.filter((x) => x.freeAgentYear === SEASON + 1).map((x) => ({ slug: x.slug, name: x.name, position: x.position, capHit: x.capHit, apy: x.apy })),
    notes: [
      'Figures are OverTheCap contract data as published in the nflverse contracts release, in millions of dollars.',
      'Committed cap is the sum of current-year cap numbers for players on the roster, reserve lists and practice squad. It does not include dead money from released or traded players, or league adjustments, so it is lower than the club’s full cap charge.',
      'The league cap is the base figure announced by the NFL. Each club’s actual limit is higher or lower after carry-over and adjustments.',
      ...(unpriced.length ? [`${unpriced.length} players (mostly ${SEASON} draft picks and practice-squad signings) have contract totals but no year-by-year cap numbers published yet, so they are not in the committed total.`] : []),
    ],
  }
}
