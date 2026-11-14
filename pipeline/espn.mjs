// ESPN's public JSON endpoints: the freshest source for roster moves, depth chart,
// injuries, schedule, standings, matchup previews and headlines.
import { getJSON, pool } from './lib/http.mjs'

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl'
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl'
export const ESPN_TEAM_ID = '8'

// ESPN abbreviations that differ from nflverse.
const TO_NFLVERSE = { LAR: 'LA', WSH: 'WAS' }
export const abbr = (a) => TO_NFLVERSE[a] || a

export async function loadTeams() {
  const j = await getJSON(`${SITE}/teams?limit=40`, { ttlHours: 24 })
  const out = {}
  for (const { team: t } of j?.sports?.[0]?.leagues?.[0]?.teams || []) {
    out[abbr(t.abbreviation)] = { abbr: abbr(t.abbreviation), espnId: t.id, name: t.displayName, location: t.location, nickname: t.name, color: `#${t.color}`, altColor: `#${t.alternateColor}` }
  }
  return out
}

export async function loadRoster() {
  const j = await getJSON(`${SITE}/teams/${ESPN_TEAM_ID}/roster`, { ttlHours: 1 })
  const seen = new Set()
  const athletes = []
  for (const group of j.athletes || []) {
    for (const a of group.items || []) {
      if (seen.has(a.id)) continue
      seen.add(a.id)
      athletes.push({
        espnId: a.id, name: a.fullName || a.displayName, first: a.firstName, last: a.lastName, slug: a.slug,
        jersey: a.jersey != null ? Number(a.jersey) : null, position: a.position?.abbreviation || null, positionName: a.position?.displayName || null,
        side: a.position?.parent?.abbreviation || null, height: a.height ?? null, weight: a.weight ?? null, age: a.age ?? null,
        birthDate: a.dateOfBirth ? a.dateOfBirth.slice(0, 10) : null,
        birthPlace: a.birthPlace ? { city: a.birthPlace.city || null, state: a.birthPlace.state || null, country: a.birthPlace.country || null } : null,
        college: a.college?.name || null, experience: a.experience?.years ?? null, debutYear: a.debutYear ?? null,
        status: a.status?.name || null, group: group.position,
        injury: a.injuries?.[0] ? { status: a.injuries[0].status, date: a.injuries[0].date } : null,
      })
    }
  }
  return { athletes, coach: j.coach?.[0] ? { name: `${j.coach[0].firstName} ${j.coach[0].lastName}`, seasons: j.coach[0].experience } : null, record: j.team?.recordSummary || null, standing: j.team?.standingSummary || null }
}

export async function loadDepth() {
  const j = await getJSON(`${SITE}/teams/${ESPN_TEAM_ID}/depthcharts`, { ttlHours: 1 })
  return (j.depthchart || []).map((d) => ({
    name: d.name,
    positions: Object.entries(d.positions || {}).map(([slot, v]) => ({ slot, label: v.position?.abbreviation || slot.toUpperCase(), athletes: (v.athletes || []).map((a) => ({ espnId: a.id, name: a.displayName })) })),
  }))
}

export async function loadSchedule(season) {
  const j = await getJSON(`${SITE}/teams/${ESPN_TEAM_ID}/schedule?season=${season}`, { ttlHours: 1 })
  const events = (j.events || []).map((e) => {
    const c = e.competitions?.[0] || {}
    const us = c.competitors?.find((x) => x.team?.id === ESPN_TEAM_ID)
    const them = c.competitors?.find((x) => x.team?.id !== ESPN_TEAM_ID)
    return {
      espnId: e.id, week: e.week?.number, date: e.date, name: e.name, home: us?.homeAway === 'home', neutral: !!c.neutralSite,
      opp: abbr(them?.team?.abbreviation), oppName: them?.team?.displayName,
      venue: c.venue?.fullName || null, city: [c.venue?.address?.city, c.venue?.address?.state || c.venue?.address?.country].filter(Boolean).join(', ') || null,
      tv: (c.broadcasts || []).map((b) => b.media?.shortName).filter(Boolean),
      state: c.status?.type?.state || null, detail: c.status?.type?.shortDetail || null, completed: !!c.status?.type?.completed,
      score: us?.score?.value != null && c.status?.type?.completed ? { us: us.score.value, them: them?.score?.value } : null,
      win: c.status?.type?.completed ? !!us?.winner : null,
      note: c.notes?.[0]?.headline || null,
    }
  })
  return { events, bye: j.byeWeek ?? null }
}

export async function loadStandings(season) {
  const j = await getJSON(`https://site.api.espn.com/apis/v2/sports/football/nfl/standings?season=${season}&level=3`, { ttlHours: 1 })
  const divisions = []
  for (const conf of j.children || []) {
    for (const d of conf.children || []) {
      divisions.push({
        conference: conf.abbreviation, name: d.name,
        teams: (d.standings?.entries || []).map((e) => {
          const s = Object.fromEntries((e.stats || []).map((x) => [x.name || x.type, x]))
          const disp = (k) => s[k]?.displayValue ?? null
          const val = (k) => s[k]?.value ?? null
          return {
            abbr: abbr(e.team.abbreviation), name: e.team.displayName, wins: val('wins'), losses: val('losses'), ties: val('ties'), pct: val('winPercent'),
            pointsFor: val('pointsFor'), pointsAgainst: val('pointsAgainst'), diff: val('pointDifferential') ?? val('differential'), streak: disp('streak'), seed: val('playoffSeed'),
            home: disp('Home') || disp('home'), road: disp('Road') || disp('road'), division: disp('divisionRecord') || disp('vs. Div.'), conferenceRecord: disp('vs. Conf.') || disp('conferenceRecord'),
          }
        }),
      })
    }
  }
  return divisions
}

/** Structured injury designations only (ESPN's free-text comments are not republished). */
export async function loadInjuries() {
  const j = await getJSON(`${SITE}/injuries`, { ttlHours: 1 })
  const out = {}
  for (const t of j?.injuries || []) {
    out[t.id] = (t.injuries || []).map((i) => ({
      espnId: i.athlete?.id || i.athlete?.links?.[0]?.href?.match(/id\/(\d+)/)?.[1] || null, name: i.athlete?.displayName, status: i.status, date: i.date,
      type: i.details?.type || null, location: i.details?.location || null, side: i.details?.side && i.details.side !== 'Not Specified' ? i.details.side : null,
      returnDate: i.details?.returnDate || null,
    }))
  }
  return out
}

const article = (a) => ({
  headline: a.headline, description: a.description || null, published: a.published || a.lastModified || null,
  url: a.links?.web?.href || null, type: a.type || null, byline: a.byline || null, source: 'ESPN',
})

export async function loadTeamNews() {
  const j = await getJSON(`${SITE}/news?team=${ESPN_TEAM_ID}&limit=80`, { ttlHours: 1 })
  return (j?.articles || [])
    .filter((a) => a.links?.web?.href)
    .map((a) => {
      const teamsTagged = new Set((a.categories || []).filter((c) => c.type === 'team').map((c) => String(c.teamId)))
      const text = `${a.headline} ${a.description || ''}`
      // League-wide roundups are tagged with every club; keep stories that are really about Detroit.
      const focused = /\b(Lions|Detroit)\b/.test(text) || (teamsTagged.has(ESPN_TEAM_ID) && teamsTagged.size === 1)
      return { ...article(a), focused }
    })
}

export async function loadTransactions(season) {
  const j = await getJSON(`${SITE}/transactions?team=${ESPN_TEAM_ID}&season=${season}&limit=200`, { ttlHours: 1 })
  return (j?.transactions || []).map((t) => ({ date: t.date?.slice(0, 10), text: t.description }))
}

export async function loadSummary(eventId) {
  const j = await getJSON(`${SITE}/summary?event=${eventId}`, { ttlHours: 1 })
  if (!j) return null
  const comp = j.header?.competitions?.[0] || {}
  const pick = j.pickcenter?.[0]
  const teamOf = (id) => abbr(comp.competitors?.find((c) => c.team?.id === id || c.id === id)?.team?.abbreviation)
  return {
    predictor: j.predictor ? { home: Number(j.predictor.homeTeam?.gameProjection), away: Number(j.predictor.awayTeam?.gameProjection) } : null,
    odds: pick ? { provider: pick.provider?.name || null, details: pick.details || null, spread: pick.spread ?? null, overUnder: pick.overUnder ?? null, homeMoneyline: pick.homeTeamOdds?.moneyLine ?? null, awayMoneyline: pick.awayTeamOdds?.moneyLine ?? null } : null,
    injuries: (j.injuries || []).map((t) => ({
      team: abbr(t.team?.abbreviation),
      list: (t.injuries || []).map((i) => ({ espnId: i.athlete?.id, name: i.athlete?.displayName, position: i.athlete?.position?.abbreviation || null, status: i.status, type: i.details?.type || null, returnDate: i.details?.returnDate || null })),
    })),
    leaders: (j.leaders || []).map((t) => ({
      team: abbr(t.team?.abbreviation),
      list: (t.leaders || []).map((l) => ({ category: l.displayName, name: l.leaders?.[0]?.athlete?.displayName || null, espnId: l.leaders?.[0]?.athlete?.id || null, line: l.leaders?.[0]?.displayValue || null })),
    })),
    lastFive: (j.lastFiveGames || []).map((t) => ({
      team: abbr(t.team?.abbreviation),
      games: (t.events || []).map((e) => ({ result: e.gameResult, score: e.score, opp: abbr(e.opponent?.abbreviation), at: e.atVs === '@', date: e.gameDate })),
    })),
    broadcasts: (j.broadcasts || []).map((b) => b.media?.shortName || b.station).filter(Boolean),
    venue: j.gameInfo?.venue ? { name: j.gameInfo.venue.fullName, city: [j.gameInfo.venue.address?.city, j.gameInfo.venue.address?.state || j.gameInfo.venue.address?.country].filter(Boolean).join(', '), grass: j.gameInfo.venue.grass ?? null, indoor: j.gameInfo.venue.indoor ?? null } : null,
    weather: j.gameInfo?.weather ? { temp: j.gameInfo.weather.temperature ?? null, condition: j.gameInfo.weather.conditionId ?? null, text: j.gameInfo.weather.displayValue ?? null } : null,
    home: teamOf(comp.competitors?.find((c) => c.homeAway === 'home')?.team?.id),
    away: teamOf(comp.competitors?.find((c) => c.homeAway === 'away')?.team?.id),
  }
}

/** Per-athlete profile bits that only ESPN carries: league ranks in headline stats and tagged headlines. */
export async function loadAthletes(espnIds) {
  const out = {}
  await pool(espnIds, 5, async (id) => {
    try {
      const [a, o] = await Promise.all([
        getJSON(`${WEB}/athletes/${id}`, { ttlHours: 6 }),
        getJSON(`${WEB}/athletes/${id}/overview`, { ttlHours: 3 }),
      ])
      const ath = a?.athlete || {}
      out[id] = {
        birthPlace: ath.displayBirthPlace || null,
        draftText: ath.displayDraft || null,
        experienceText: ath.displayExperience || null,
        status: ath.status?.name || null,
        summary: (ath.statsSummary?.statistics || []).map((s) => ({ name: s.name, label: s.shortDisplayName || s.displayName, value: s.displayValue, rank: s.rankDisplayValue || null })),
        summaryLabel: ath.statsSummary?.displayName || null,
        news: (o?.news || []).filter((n) => n.links?.web?.href && n.type !== 'Media').slice(0, 10).map(article),
      }
    } catch (err) {
      out[id] = { error: String(err.message || err) }
    }
  })
  return out
}
