// Sanity checks on the generated data. Run after `npm run data`; a failure stops a scheduled
// refresh from publishing a broken build when a source has a bad day.
import fs from 'node:fs/promises'
import path from 'node:path'

const DIR = path.resolve('public/data')
const read = async (f) => JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8'))
const problems = []
const check = (ok, message) => { if (!ok) problems.push(message) }

const team = await read('team.json')
const roster = await read('roster.json')
const active = roster.filter((p) => p.roster === 'active')
const rec = team.team?.record

check(roster.length >= 60 && roster.length <= 100, `roster size looks wrong: ${roster.length}`)
check(active.length >= 45 && active.length <= 62, `active roster size looks wrong: ${active.length}`)
check(roster.every((p) => p.name && p.slug && p.group && p.unit), 'a roster entry is missing its name, slug, group or unit')
check(new Set(roster.map((p) => p.slug)).size === roster.length, 'duplicate player slugs')
check(active.filter((p) => p.depth).length >= active.length - 3, 'several active players have no depth-chart slot')
check(['qb', 'rb', 'c', 'lt', 'rt', 'wr1', 'mlb', 'lcb', 'pk', 'p'].every((s) => team.depth?.slots?.[s]?.length), 'a core depth-chart slot is empty')
check(rec && Number.isInteger(rec.wins) && Number.isInteger(rec.losses), 'team record is missing')
check((team.schedule || []).length >= 17, `schedule has ${team.schedule?.length} games`)
check((team.schedule || []).filter((g) => g.result).length === (rec?.wins ?? 0) + (rec?.losses ?? 0) + (rec?.ties ?? 0), 'record does not match the results in the schedule')
check(Object.keys(team.ranks?.teams || {}).length === 32, 'league ranks do not cover 32 teams')
check(roster.filter((p) => p.lens?.cap !== undefined).length >= 40, 'fewer than 40 players have a cap number')
check(roster.filter((p) => p.line?.length).length >= 35, 'fewer than 35 players have a stat line')
check(team.cap?.committed > 100 && team.cap?.committed < 400, `committed cap looks wrong: ${team.cap?.committed}`)
check(team.standings?.length === 8, 'standings do not cover 8 divisions')

let wiki = 0
for (const p of roster) {
  try {
    const d = await read(`players/${p.slug}.json`)
    if (d.wiki?.intro) wiki++
    check(d.name === p.name, `dossier/roster mismatch for ${p.slug}`)
  } catch {
    problems.push(`missing dossier file for ${p.slug}`)
  }
}
check(wiki >= roster.length * 0.6, `only ${wiki} of ${roster.length} players have background text`)

if (problems.length) {
  console.error(`Data check failed:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`Data check passed: ${roster.length} players (${active.length} active), record ${rec.wins}-${rec.losses}${rec.ties ? `-${rec.ties}` : ''}, week ${team.week}, ${wiki} with background text.`)
