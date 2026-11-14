// Biographical background from Wikidata (structured family links, official social accounts)
// and English Wikipedia (sourced prose, CC BY-SA 4.0). Only what those projects already
// publish is carried over, always with a link back; children are deliberately not collected.
import { getJSON, pool } from './lib/http.mjs'

const SPARQL = 'https://query.wikidata.org/sparql'
const WP = 'https://en.wikipedia.org/w/api.php'

const RELATION = { P22: 'Father', P25: 'Mother', P3373: 'Sibling', P26: 'Spouse', P451: 'Partner', P1038: 'Relative' }

function query(prop, ids) {
  return `SELECT ?item ?key ?dob ?article ?desc ?twitter ?instagram ?prop ?rel ?relLabel ?relDesc ?relArticle WHERE {
  VALUES ?key { ${ids.map((i) => JSON.stringify(String(i))).join(' ')} }
  ?item wdt:${prop} ?key .
  OPTIONAL { ?item wdt:P569 ?dob }
  OPTIONAL { ?item wdt:P2002 ?twitter }
  OPTIONAL { ?item wdt:P2003 ?instagram }
  OPTIONAL { ?item schema:description ?desc . FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  OPTIONAL {
    VALUES ?prop { wdt:P22 wdt:P25 wdt:P3373 wdt:P26 wdt:P451 wdt:P1038 }
    ?item ?prop ?rel .
    OPTIONAL { ?rel schema:description ?relDesc . FILTER(LANG(?relDesc) = "en") }
    OPTIONAL { ?relArticle schema:about ?rel ; schema:isPartOf <https://en.wikipedia.org/> . }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`
}

async function sparql(prop, ids) {
  if (!ids.length) return []
  const j = await getJSON(`${SPARQL}?format=json&query=${encodeURIComponent(query(prop, ids))}`, { ttlHours: 24, headers: { accept: 'application/sparql-results+json' } })
  return j?.results?.bindings || []
}

function collect(rows, into) {
  for (const b of rows) {
    const key = b.key.value
    const rec = (into[key] ||= { wikidataId: b.item.value.split('/').pop(), family: [], social: {} })
    if (b.dob) rec.dob = b.dob.value.slice(0, 10)
    if (b.desc) rec.description = b.desc.value
    if (b.article) rec.title = decodeURIComponent(b.article.value.split('/wiki/')[1])
    if (b.twitter) rec.social.x = b.twitter.value
    if (b.instagram) rec.social.instagram = b.instagram.value
    if (b.prop && b.rel) {
      const relation = RELATION[b.prop.value.split('/').pop()]
      const name = b.relLabel?.value
      // Skip unlabeled entities (label falls back to the Q-id).
      if (relation && name && !/^Q\d+$/.test(name) && !rec.family.some((f) => f.name === name && f.relation === relation)) {
        rec.family.push({ relation, name, description: b.relDesc?.value || null, url: b.relArticle?.value || null })
      }
    }
  }
}

const SECTION_RULES = [
  ['early', /^(early (life|years).*|high school.*|background|youth)$/i],
  ['college', /^(college.*|collegiate career|amateur career)$/i],
  ['career', /^(professional career|nfl career|career)$/i],
  ['awards', /^(awards.*|honors.*|career highlights.*|nfl records.*|records.*)$/i],
  ['personal', /^(personal( life)?|family|off the field|outside (of )?football|philanthropy|charity|business.*|legal.*|controvers.*|suspension.*|arrest.*|in popular culture|media.*|other ventures)$/i],
]
const LIMIT = { early: 1800, college: 1600, career: 7000, awards: 1500, personal: 4000 }

function parseExtract(text) {
  const parts = text.split(/^==\s*([^=].*?)\s*==\s*$/m)
  const intro = parts[0].trim()
  const sections = []
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i].trim()
    const rule = SECTION_RULES.find(([, re]) => re.test(title))
    if (!rule) continue
    let body = parts[i + 1]
      .replace(/^={3,}\s*(.+?)\s*={3,}\s*$/gm, (_, h) => `\n${h.toUpperCase()}`)
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (body.length < 40) continue
    const max = LIMIT[rule[0]]
    if (body.length > max) body = `${body.slice(0, body.lastIndexOf('. ', max) + 1 || max).trim()} …`
    sections.push({ key: rule[0], title, text: body })
  }
  return { intro: intro.length > 1600 ? `${intro.slice(0, intro.lastIndexOf('. ', 1600) + 1)}` : intro, sections }
}

async function fetchPage(title) {
  const u = `${WP}?action=query&prop=extracts%7Cinfo%7Cdescription&explaintext=1&exsectionformat=wiki&inprop=url&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`
  const j = await getJSON(u, { ttlHours: 24, politeMs: 350 })
  const page = j?.query?.pages?.[0]
  if (!page || page.missing || !page.extract) return null
  return { title: page.title, url: page.fullurl, description: page.description || null, touched: page.touched || null, ...parseExtract(page.extract) }
}

async function searchPage(player) {
  const u = `${WP}?action=query&list=search&srlimit=3&format=json&formatversion=2&srsearch=${encodeURIComponent(`"${player.name}" American football`)}`
  const j = await getJSON(u, { ttlHours: 24, politeMs: 350 })
  const year = player.birthDate?.slice(0, 4)
  for (const hit of j?.query?.search || []) {
    const page = await fetchPage(hit.title)
    if (!page) continue
    // Accept only when the article is clearly this person: a football bio with the same birth year.
    if (/football/i.test(page.intro) && year && page.intro.slice(0, 400).includes(year)) return page
  }
  return null
}

/** @param {{key:string, espnId?:string, pfrId?:string, name:string, birthDate?:string}[]} players */
export async function loadWiki(players) {
  const byEspn = {}
  const byPfr = {}
  collect(await sparql('P3686', players.map((p) => p.espnId).filter(Boolean)), byEspn)
  collect(await sparql('P3561', players.filter((p) => p.pfrId && !byEspn[p.espnId]).map((p) => p.pfrId)), byPfr)

  const out = {}
  // Wikipedia asks API clients to make requests one at a time.
  await pool(players, 1, async (p) => {
    const wd = byEspn[p.espnId] || byPfr[p.pfrId] || null
    try {
      // A Wikidata hit must agree on date of birth when both sides have one.
      const trusted = wd && (!wd.dob || !p.birthDate || wd.dob === p.birthDate)
      let page = trusted && wd.title ? await fetchPage(wd.title.replace(/_/g, ' ')) : null
      if (!page) page = await searchPage(p)
      if (!page && !trusted) return
      out[p.key] = {
        ...(page || {}),
        wikidataId: trusted ? wd.wikidataId : null,
        description: page?.description || (trusted ? wd.description : null) || null,
        family: trusted ? wd.family : [],
        social: trusted ? wd.social : {},
      }
    } catch (err) {
      console.warn(`  wiki: ${p.name}: ${err.message}`)
    }
  })
  return out
}
