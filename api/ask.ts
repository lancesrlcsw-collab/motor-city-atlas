// POST /api/ask — answers a question about the team or one player, grounded in the JSON
// files the site itself serves. Streams plain text back as the model writes it.
//
// Configuration (set as environment variables on the host, never in the repo):
//   ANTHROPIC_API_KEY   required — without it the endpoint answers 503 and the site says so
//   ASK_MODEL           optional — defaults to claude-opus-5-5
//   ASK_EFFORT          optional — low | medium | high (default low: quick, conversational answers)
import Anthropic from '@anthropic-ai/sdk'

const MODEL = process.env.ASK_MODEL || 'claude-opus-5-5'
const EFFORT = (['low', 'medium', 'high', 'xhigh', 'max'] as const).find((e) => e === process.env.ASK_EFFORT) ?? 'low'
const MAX_QUESTION = 400
const MAX_TURNS = 8

const INSTRUCTIONS = `You are the analyst inside Motor City Atlas, an unofficial fan site that models the 2026 Detroit Lions roster in 3D. People ask you about the team and its players, and you answer from the site's own data files, which are included below.

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

// ---------------------------------------------------------------- data loading (cached per instance)
const cache = new Map<string, { at: number; text: string }>()
async function loadText(origin: string, path: string): Promise<string | null> {
  const key = origin + path
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.text
  const res = await fetch(origin + path, { headers: { accept: 'application/json' } })
  if (!res.ok) return null
  const text = await res.text()
  cache.set(key, { at: Date.now(), text })
  return text
}

/** Keep the dossier's substance and drop fields that only the interface needs. */
function trimDossier(raw: string): string {
  const d = JSON.parse(raw)
  for (const k of ['id', 'gsis', 'espnId', 'pfrId', 'pffId', 'otcId', 'links', 'listed', 'slug', 'weeklyStatus']) delete d[k]
  if (d.wiki) { delete d.wiki.wikidataId; delete d.wiki.touched }
  return JSON.stringify(d)
}

// ---------------------------------------------------------------- simple per-instance rate limit
const hits = new Map<string, number[]>()
function limited(ip: string): boolean {
  const now = Date.now()
  const windowMs = 5 * 60_000
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > 12
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return json(503, { error: 'The assistant is not configured on this deployment.' })

  let body: { question?: unknown; slug?: unknown; history?: unknown }
  try { body = await request.json() } catch { return json(400, { error: 'Send a JSON body.' }) }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : ''
  if (!question) return json(400, { error: 'Ask a question.' })
  const slug = typeof body.slug === 'string' && /^[a-z0-9-]{2,60}$/.test(body.slug) ? body.slug : null
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((m): m is { role: 'user' | 'assistant'; text: string } => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim().length > 0)
    .slice(-MAX_TURNS)

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local'
  if (limited(ip)) return json(429, { error: 'Too many questions in a short time.' })

  const origin = new URL(request.url).origin
  const [teamText, dossierText] = await Promise.all([loadText(origin, '/data/ask-team.json'), slug ? loadText(origin, `/data/players/${slug}.json`) : Promise.resolve(null)])
  if (!teamText) return json(502, { error: 'The data files could not be loaded.' })

  // Stable content first so repeated questions reuse the cached prefix: instructions, then the
  // team file, then (when asking about one player) his dossier. The conversation comes last.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: INSTRUCTIONS },
    { type: 'text', text: `<team_file>\n${teamText}\n</team_file>`, cache_control: { type: 'ephemeral' } },
  ]
  if (dossierText) system.push({ type: 'text', text: `<player_dossier>\n${trimDossier(dossierText)}\n</player_dossier>\nThe person is asking from this player's page, so "he" and "his" refer to this player unless they name someone else.`, cache_control: { type: 'ephemeral' } })

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.text.slice(0, 4000) })),
    { role: 'user' as const, content: question },
  ]
  // The API needs the conversation to open with a user turn.
  while (messages.length && messages[0].role !== 'user') messages.shift()

  const client = new Anthropic()
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wrote = false
      try {
        const run = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 6000,
          // If a safety classifier declines a request, let the API retry it on its default fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: EFFORT },
          system,
          messages,
        })
        for await (const event of run) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            wrote = true
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        const final = await run.finalMessage()
        if (final.stop_reason === 'refusal' && !wrote) controller.enqueue(encoder.encode('I can’t help with that one. Try asking about a player’s stats, contract, role or this week’s matchup.'))
        else if (final.stop_reason === 'max_tokens') controller.enqueue(encoder.encode('\n\n(That answer was cut short — ask a narrower follow-up for the rest.)'))
      } catch (err) {
        let msg = 'The assistant ran into a problem. Try again in a moment.'
        if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) msg = 'The assistant’s API key was rejected. The site owner needs to check it.'
        else if (err instanceof Anthropic.RateLimitError) msg = 'The assistant is busy right now. Give it a minute and ask again.'
        else if (err instanceof Anthropic.APIConnectionError) msg = 'The assistant could not be reached. Try again in a moment.'
        else if (err instanceof Anthropic.APIError) console.error('ask: API error', err.status, err.message)
        else console.error('ask: unexpected error', err)
        controller.enqueue(encoder.encode(wrote ? `\n\n(${msg})` : msg))
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } })
}

export function GET(): Response {
  return json(200, { ok: true, configured: !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), model: MODEL })
}
