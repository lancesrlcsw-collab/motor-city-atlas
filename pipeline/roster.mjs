// Merge ESPN's live roster with nflverse identities and place every player on the depth chart.
import { nameKey, slugify, ageOn } from './lib/util.mjs'

export function groupOf(pos) {
  switch ((pos || '').toUpperCase()) {
    case 'QB': return 'QB'
    case 'RB': case 'FB': case 'HB': return 'RB'
    case 'WR': return 'WR'
    case 'TE': return 'TE'
    case 'T': case 'OT': case 'G': case 'OG': case 'C': case 'OL': case 'LT': case 'RT': case 'LG': case 'RG': return 'OL'
    case 'DE': case 'DT': case 'NT': case 'DL': case 'EDGE': case 'ED': case 'IDL': return 'DL'
    case 'LB': case 'OLB': case 'ILB': case 'MLB': return 'LB'
    case 'CB': case 'S': case 'SS': case 'FS': case 'DB': case 'SAF': return 'DB'
    case 'K': case 'PK': case 'P': case 'LS': return 'ST'
    default: return null
  }
}
export const unitOf = (group) => (['QB', 'RB', 'WR', 'TE', 'OL'].includes(group) ? 'offense' : group === 'ST' ? 'special' : 'defense')

const STATUS_LABEL = {
  A01: 'Active roster', R01: 'Injured reserve', R02: 'Reserve / retired', R04: 'Reserve / physically unable to perform', R05: 'Reserve / non-football injury',
  R23: 'Injured reserve (designated to return)', P01: 'Practice squad', P02: 'Practice squad (injured)', P03: 'Practice squad (international)',
}

// Where a player without a depth-chart entry should be slotted, by listed position.
const FALLBACK_SLOTS = {
  QB: ['qb'], RB: ['rb'], FB: ['rb'], WR: ['wr1', 'wr2', 'wr3'], TE: ['te'], T: ['lt', 'rt'], OT: ['lt', 'rt'], G: ['lg', 'rg'], OG: ['lg', 'rg'], C: ['c'], OL: ['lg', 'rg'],
  DE: ['lde', 'rde'], DT: ['ldt', 'rdt'], NT: ['ldt', 'rdt'], DL: ['ldt', 'rdt'], LB: ['wlb', 'mlb', 'slb'], OLB: ['wlb', 'slb'], ILB: ['mlb'], MLB: ['mlb'],
  CB: ['lcb', 'rcb', 'nb'], S: ['ss', 'fs'], SS: ['ss'], FS: ['fs'], DB: ['ss', 'fs'], K: ['pk'], PK: ['pk'], P: ['p'], LS: ['ls'],
}
const ST_PRIMARY = new Set(['pk', 'p', 'ls'])
const ROLE_LABEL = { h: 'Holder', pr: 'Punt returner', kr: 'Kick returner' }

export function buildRoster({ espn, nflRoster, index, now }) {
  const nflByGsis = new Map(nflRoster.map((r) => [r.gsis, r]))
  const nflByName = new Map(nflRoster.filter((r) => ['ACT', 'RES', 'DEV'].includes(r.status)).map((r) => [nameKey(r.name), r]))
  const players = []
  const used = new Set()

  for (const a of espn.athletes) {
    let gsis = index.espnToGsis.get(a.espnId) || null
    let nfl = gsis ? nflByGsis.get(gsis) : null
    if (!nfl) {
      nfl = nflByName.get(nameKey(a.name)) || null
      if (nfl) gsis = nfl.gsis
    }
    const idx = gsis ? index.byGsis.get(gsis) : null
    if (gsis) used.add(gsis)
    players.push(merge(a, nfl, idx, gsis, now))
  }
  // Anyone nflverse lists on the club that ESPN's page has not caught up with.
  for (const r of nflRoster) {
    if (used.has(r.gsis) || !['ACT', 'RES', 'DEV'].includes(r.status)) continue
    players.push(merge(null, r, index.byGsis.get(r.gsis), r.gsis, now))
  }
  // Unique, stable slugs.
  const seen = new Map()
  for (const p of players) {
    let s = slugify(p.name)
    if (seen.has(s)) s = `${s}-${p.number ?? seen.get(s) + 1}`
    seen.set(s, (seen.get(s) || 0) + 1)
    p.slug = s
  }
  return players
}

function merge(a, nfl, idx, gsis, now) {
  const position = a?.position || nfl?.depthPosition || nfl?.position || idx?.position || null
  const group = groupOf(position) || groupOf(nfl?.position) || groupOf(idx?.position) || 'ST'
  // nflverse carries the formal designation (active / reserve / practice squad) as of its weekly
  // snapshot; ESPN's page reflects same-day practice-squad moves, so it breaks ties there.
  let roster = nfl?.status === 'RES' ? 'reserve' : nfl?.status === 'DEV' ? 'practice' : 'active'
  let detail = STATUS_LABEL[nfl?.statusDetail] || null
  if (a) {
    const espnPractice = a.group === 'practiceSquad' || a.status === 'Practice Squad'
    if (espnPractice && roster !== 'practice') { roster = 'practice'; detail = null }
    else if (!espnPractice && roster === 'practice') { roster = 'active'; detail = null }
    if (!nfl && a.group === 'injuredReserveOrOut') roster = 'reserve'
  }
  const birthDate = a?.birthDate || nfl?.birthDate || idx?.birthDate || null
  return {
    id: gsis || `espn-${a.espnId}`,
    gsis,
    espnId: a?.espnId || nfl?.espnId || idx?.espnId || null,
    pfrId: nfl?.pfrId || idx?.pfrId || null,
    pffId: nfl?.pffId || idx?.pffId || null,
    otcId: idx?.otcId || null,
    name: a?.name || nfl?.name || idx?.name,
    first: a?.first || nfl?.first || idx?.first || null,
    last: a?.last || nfl?.last || idx?.last || null,
    number: a?.jersey ?? nfl?.jersey ?? null,
    position,
    positionName: a?.positionName || null,
    group,
    unit: unitOf(group),
    roster,
    rosterDetail: detail || (roster === 'practice' ? 'Practice squad' : roster === 'reserve' ? 'Reserve list' : 'Active roster'),
    injury: a?.injury || null,
    bio: {
      birthDate,
      age: ageOn(birthDate, now) ?? a?.age ?? null,
      birthPlace: a?.birthPlace || null,
      height: a?.height ?? nfl?.height ?? idx?.height ?? null,
      weight: a?.weight ?? nfl?.weight ?? idx?.weight ?? null,
      college: a?.college || idx?.college || nfl?.college || null,
      colleges: nfl?.college && nfl.college.includes(';') ? nfl.college.split(';').map((s) => s.trim()) : null,
      conference: idx?.conference || null,
      experience: a?.experience ?? nfl?.yearsExp ?? idx?.yearsExp ?? null,
      rookieYear: nfl?.rookieYear ?? idx?.rookieSeason ?? a?.debutYear ?? null,
      entryYear: nfl?.entryYear ?? null,
      draft: idx?.draftYear && idx?.draftPick ? { year: idx.draftYear, round: idx.draftRound, pick: idx.draftPick, team: idx.draftTeam } : nfl?.draftNumber ? { year: nfl.entryYear, round: null, pick: nfl.draftNumber, team: nfl.draftClub } : null,
    },
  }
}

/** Assign each active player one primary depth-chart slot; returns the ordered slot table. */
export function assignDepth(players, depthCharts) {
  const byEspn = new Map(players.filter((p) => p.espnId).map((p) => [p.espnId, p]))
  const order = ['3WR 1TE', 'Base 4-3 D', 'Special Teams']
  const charts = [...depthCharts].sort((x, y) => (order.indexOf(x.name) + 99) % 99 - (order.indexOf(y.name) + 99) % 99)
  const best = new Map() // player id -> { slot, rank, chart, seq }
  let seq = 0
  for (const chart of charts) {
    for (const pos of chart.positions) {
      pos.athletes.forEach((a, i) => {
        const p = byEspn.get(a.espnId)
        if (!p) return
        seq++
        if (chart.name === 'Special Teams' && !ST_PRIMARY.has(pos.slot)) {
          ;(p.roles ||= []).push(`${ROLE_LABEL[pos.slot] || pos.label}${i === 0 ? '' : ` (${i + 1})`}`)
          return
        }
        ;(p.listed ||= []).push({ chart: chart.name, slot: pos.slot, label: pos.label, rank: i + 1 })
        const cur = best.get(p.id)
        if (!cur || i + 1 < cur.rank) best.set(p.id, { slot: pos.slot, label: pos.label, rank: i + 1, chart: chart.name, seq })
      })
    }
  }
  const slots = {}
  for (const p of players) {
    if (p.roster !== 'active') continue
    let b = best.get(p.id)
    if (!b) {
      const options = FALLBACK_SLOTS[(p.position || '').toUpperCase()] || FALLBACK_SLOTS[p.group] || []
      if (!options.length) continue
      const slot = options.reduce((m, s) => ((slots[s]?.length || 0) < (slots[m]?.length || 0) ? s : m), options[0])
      b = { slot, label: slot.replace(/\d/, '').toUpperCase(), rank: 99, chart: null, seq: 1e6 + players.indexOf(p) }
    }
    ;(slots[b.slot] ||= []).push({ p, ...b })
  }
  for (const [slot, list] of Object.entries(slots)) {
    list.sort((x, y) => x.rank - y.rank || x.seq - y.seq)
    list.forEach((e, i) => { e.p.depth = { slot, label: e.label, rank: i + 1, starter: i === 0 } })
    slots[slot] = list.map((e) => e.p.id)
  }
  return slots
}
