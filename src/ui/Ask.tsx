import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { ASK_USES_VIEWER_ACCOUNT, ask as askBackend } from '../lib/askBackend'
import { IconClose, IconSend, IconSpark } from './icons'

interface Msg { role: 'user' | 'assistant'; text: string; error?: boolean }

const TEAM_PROMPTS = [
  'Who is giving Detroit the most production per cap dollar?',
  'What are the biggest matchup edges against this week’s opponent?',
  'Which contracts expire after this season?',
  'Who is hurt right now, and who is next on the depth chart?',
]
const playerPrompts = (name: string) => [
  `How is ${name} playing this season compared with last year?`,
  `Walk me through ${name}’s contract. When does it get expensive?`,
  `What was ${name}’s best game this season?`,
  `Tell me about ${name}’s background and family.`,
]

/** Minimal formatting for model replies: paragraphs, bullet lists and bold. */
function Rich({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part))
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{bold(l)}</li>)}</ul>); list = [] } }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const m = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/)
    if (m) { list.push(m[1]); continue }
    flush()
    blocks.push(<p key={blocks.length}>{bold(line.replace(/^#+\s*/, ''))}</p>)
  }
  flush()
  return <>{blocks}</>
}

export function AskPanel({ slug, name }: { slug?: string; name?: string }) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => { setMessages([]); setInput(''); abort.current?.abort(); setBusy(false) }, [slug])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages])

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    const history = messages.filter((m) => !m.error && m.text).slice(-8).map(({ role, text }) => ({ role, text }))
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '' }])
    setInput(''); setBusy(true)
    const patch = (fn: (last: Msg) => Msg) => setMessages((m) => [...m.slice(0, -1), fn(m[m.length - 1])])
    abort.current = new AbortController()
    const result = await askBackend({ question: q, slug, history, signal: abort.current.signal, onText: (whole) => patch((last) => ({ ...last, text: whole })) })
    if (!result.ok) patch((last) => (result.keepPartial && last.text ? { ...last, text: `${last.text}\n\n(${result.error})` } : { role: 'assistant', text: result.error, error: true }))
    setBusy(false)
  }

  const prompts = name ? playerPrompts(name) : TEAM_PROMPTS
  return (
    <div className="ask">
      {messages.length === 0 && (
        <div className="ask-intro">
          <div className="ask-mark"><IconSpark /></div>
          <h3>{name ? `Ask about ${name}` : 'Ask about the 2026 Lions'}</h3>
          <p className="muted">Answers are written by Claude from this site’s data: stats, league ranks, contracts, the injury report and sourced background. It will say so when something is not in the data.{ASK_USES_VIEWER_ACCOUNT ? ' Questions run on your own Claude account, so the first one asks for your permission.' : ''}</p>
          <div className="ask-prompts">{prompts.map((p) => <button key={p} onClick={() => ask(p)}>{p}</button>)}</div>
        </div>
      )}
      <div className="ask-thread" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}${m.error ? ' error' : ''}`}>
            {m.role === 'assistant' && !m.text ? <span className="typing"><i /><i /><i /></span> : m.role === 'assistant' ? <Rich text={m.text} /> : m.text}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); ask(input) }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={name ? `Ask anything about ${name.split(' ')[0]}…` : 'Ask anything about the roster…'} maxLength={400} aria-label="Your question" />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send"><IconSend /></button>
      </form>
    </div>
  )
}

export function AskDrawer() {
  const open = useStore((s) => s.askOpen)
  const setAsk = useStore((s) => s.setAsk)
  if (!open) return null
  return (
    <div className="scrim side" onPointerDown={(e) => { if (e.target === e.currentTarget) setAsk(false) }}>
      <div className="ask-drawer glass" role="dialog" aria-label="Ask about the team">
        <div className="drawer-head"><span className="eyebrow">Ask the Atlas</span><button onClick={() => setAsk(false)} aria-label="Close"><IconClose /></button></div>
        <AskPanel />
      </div>
    </div>
  )
}
