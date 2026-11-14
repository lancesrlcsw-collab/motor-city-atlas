// Two ways to answer a question, chosen by where the site is running:
//  - on the web, POST to the /api/ask function (server-side API key);
//  - as a Claude artifact, ask Claude through the viewer's own account with the `sample`
//    capability, sending the same instructions and data from the browser.
import { HASH_ROUTING, useStore } from '../store'

export interface AskTurn { role: 'user' | 'assistant'; text: string }
export interface AskArgs { question: string; slug?: string; history: AskTurn[]; signal: AbortSignal; onText: (whole: string) => void }
/** `error` is viewer-facing copy; `partial` says whether text already on screen should stay. */
export type AskResult = { ok: true } | { ok: false; error: string; keepPartial?: boolean }

// Keep in step with the instructions in api/ask.ts.
const RULES = `You are the analyst inside Motor City Atlas, an unofficial fan site that models the 2026 Detroit Lions roster in 3D. People ask you about the team and its players, and you answer from the site's own data files, which are included below.

How to answer
- Use only the data provided: the team file and, when one is included, a single player's dossier. Rosters, statistics and contracts change every week, so the files are the source of truth and your own memory of past seasons is not. If the files do not contain something, say that plainly and offer what they do show.
- Quote numbers exactly as given. Contract figures are in millions of dollars and come from OverTheCap. "Percentile" compares a player with qualified players at his position this season; the composite of those is called the Atlas Index and is this site's own measure, not a PFF grade. PFF grades are not in the data.
- When you use an advanced measure (EPA, success rate, win probability, air yards), add a few plain words on what it means the first time.
- For judgment questions ("should they extend him?", "who wins Sunday?"), give a reasoned view built from the numbers and make clear it is analysis rather than fact.
- Personal background: you may relay what the dossier's wiki section and listed headlines say, since those are published, sourced material. Do not speculate about relationships, health beyond the listed injury report, or anything else that is not in the files, and do not give details about players' children. If asked for rumors or gossip, say this site only carries sourced reporting.

Style
- Conversational and direct, like a sharp friend who has the spreadsheet open. Lead with the answer.
- Keep it short: usually under 160 words. Use a brief bulleted list for comparisons or several items, otherwise plain sentences. No headings.
- Refer to "the data" or "this site's numbers", not to JSON, files or field names.`

let teamFile: Promise<string> | null = null
const loadTeamFile = () => (teamFile ||= fetch(`${import.meta.env.BASE_URL}data/ask-team.json`).then((r) => { if (!r.ok) throw new Error('team file'); return r.text() }).catch((e) => { teamFile = null; throw e }))

function dossierText(slug?: string): string | null {
  if (!slug) return null
  const d = useStore.getState().dossiers[slug]
  if (!d || typeof d === 'string') return null
  const { id, gsis, espnId, pfrId, links, listed, weeklyStatus, ...rest } = d as any
  return JSON.stringify(rest)
}

const SAMPLE_COPY: Record<string, string> = {
  not_granted: 'The assistant needs your permission to use Claude from this page. Reload and allow it to ask questions here.',
  sampling_disabled: 'Claude is not available for this account, so the assistant is switched off here.',
  rate_limited: 'You have reached a usage limit for now. Try again a little later.',
  session_expired: 'Sign in to Claude again, then ask once more.',
  refused: 'I can’t help with that one. Try asking about a player’s stats, contract, role or this week’s matchup.',
  prompt_too_large: 'That conversation has grown too long. Close the panel and start a fresh question.',
  empty_completion: 'No answer came back. Try rephrasing the question.',
}

async function askViaArtifact(a: AskArgs): Promise<AskResult> {
  const claude = (window as any).claude
  const sample = typeof claude?.use === 'function' ? await claude.use('sample') : null
  if (!sample) return { ok: false, error: 'The assistant works when this page is opened inside Claude, signed in. Everything else on the site works without it.' }
  let lead = RULES
  try {
    lead += `\n\n<team_file>\n${await loadTeamFile()}\n</team_file>`
  } catch {
    return { ok: false, error: 'The data files could not be loaded. Reload the page and try again.' }
  }
  const dossier = dossierText(a.slug)
  if (dossier) lead += `\n\n<player_dossier>\n${dossier}\n</player_dossier>\nThe person is asking from this player's page, so "he" and "his" refer to this player unless they name someone else.`
  // `sample` takes alternating turns that open and close with the person, so merge neighbours
  // with the same role (an errored reply leaves two questions in a row) and put the
  // instructions and data at the head of the first turn.
  const turns: { role: 'user' | 'assistant'; content: string }[] = []
  for (const m of [...a.history, { role: 'user' as const, text: a.question }]) {
    const last = turns[turns.length - 1]
    if (!last && m.role !== 'user') continue
    if (last?.role === m.role) last.content += `\n\n${m.text}`
    else turns.push({ role: m.role, content: m.text })
  }
  turns[0].content = `${lead}\n\nEverything above is the site's instructions and data. The person's messages start here.\n\n${turns[0].content}`
  try {
    const res = await sample(turns, { cache: false, signal: a.signal, onText: ({ text }: { text: string }) => a.onText(text) })
    if (res?.truncated) a.onText(`${res.text}\n\n(That answer was cut short — ask a narrower follow-up for the rest.)`)
    return { ok: true }
  } catch (e: any) {
    if (e?.code === 'cancelled') return { ok: true }
    return { ok: false, error: SAMPLE_COPY[e?.code] || 'The answer was interrupted. Try again in a moment.', keepPartial: !!e?.text && e.code !== 'refused' }
  }
}

async function askViaApi(a: AskArgs): Promise<AskResult> {
  try {
    const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: a.question, slug: a.slug, history: a.history }), signal: a.signal })
    if (!res.ok || !res.body) {
      const detail = await res.json().catch(() => null)
      const error = res.status === 503 ? 'The assistant is not connected on this deployment yet. Everything else on the site works without it.'
        : res.status === 429 ? 'That is a lot of questions in a short time. Give it a minute and ask again.'
        : detail?.error || 'The assistant could not answer just now. Try again in a moment.'
      return { ok: false, error }
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let whole = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      whole += decoder.decode(value, { stream: true })
      a.onText(whole)
    }
    return { ok: true }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { ok: true }
    return { ok: false, error: 'The connection dropped before the answer finished. Try again.', keepPartial: true }
  }
}

export const ask = (a: AskArgs): Promise<AskResult> => (HASH_ROUTING ? askViaArtifact(a) : askViaApi(a))
export const ASK_USES_VIEWER_ACCOUNT = HASH_ROUTING
