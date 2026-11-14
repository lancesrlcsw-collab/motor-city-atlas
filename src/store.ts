import { create } from 'zustand'
import type { Dossier, RosterPlayer, TeamData } from './types'
import type { LensId } from './lib/lens'

export type Focus = 'all' | 'offense' | 'defense' | 'bench'
export type Panel = 'matchup' | 'season' | 'cap' | 'health' | 'news' | 'sources'
export type DossierTab = 'overview' | 'stats' | 'advanced' | 'contract' | 'story' | 'news' | 'ask'
export type FieldOverlay = 'pass' | 'recv' | 'rush' | null

interface State {
  status: 'loading' | 'ready' | 'error'
  error?: string
  team: TeamData | null
  roster: RosterPlayer[]
  bySlug: Map<string, RosterPlayer>
  dossiers: Record<string, Dossier | 'loading' | 'error'>

  selected: string | null // slug
  hovered: string | null // id
  lens: LensId
  focus: Focus
  panel: Panel | null
  tab: DossierTab
  overlay: FieldOverlay
  searchOpen: boolean
  askOpen: boolean
  introDone: boolean
  touring: boolean

  load: () => Promise<void>
  select: (slug: string | null, opts?: { tab?: DossierTab; push?: boolean }) => void
  hover: (id: string | null) => void
  setLens: (lens: LensId) => void
  setFocus: (focus: Focus) => void
  openPanel: (panel: Panel | null, push?: boolean) => void
  setTab: (tab: DossierTab) => void
  setOverlay: (o: FieldOverlay) => void
  setSearch: (open: boolean) => void
  setAsk: (open: boolean) => void
  finishIntro: () => void
  setTouring: (on: boolean) => void
  step: (dir: 1 | -1) => void
}

const PANELS: Panel[] = ['matchup', 'season', 'cap', 'health', 'news', 'sources']

/** Hosted as a Claude artifact the page cannot own URL paths, so views are named in the hash instead. */
export const HASH_ROUTING = import.meta.env.VITE_TARGET === 'artifact'
const DATA = `${import.meta.env.BASE_URL}data/`

function parseLocation(): { selected: string | null; panel: Panel | null } {
  if (HASH_ROUTING) {
    const h = window.location.hash.replace(/^#/, '')
    if (h.startsWith('p-')) return { selected: h.slice(2), panel: null }
    if (h.startsWith('t-') && PANELS.includes(h.slice(2) as Panel)) return { selected: null, panel: h.slice(2) as Panel }
    return { selected: null, panel: null }
  }
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] === 'player' && parts[1]) return { selected: decodeURIComponent(parts[1]), panel: null }
  if (parts[0] === 'team' && PANELS.includes(parts[1] as Panel)) return { selected: null, panel: parts[1] as Panel }
  return { selected: null, panel: null }
}

function pushUrl(path: string) {
  if (HASH_ROUTING) {
    const parts = path.split('/').filter(Boolean)
    const hash = parts[0] === 'player' ? `p-${parts[1]}` : parts[0] === 'team' ? `t-${parts[1]}` : ''
    if (window.location.hash.replace(/^#/, '') !== hash) {
      try { window.location.hash = hash } catch { /* some hosts lock the hash */ }
    }
    return
  }
  if (window.location.pathname !== path) window.history.pushState({}, '', path)
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.json()
}

export const useStore = create<State>((set, get) => ({
  status: 'loading',
  team: null,
  roster: [],
  bySlug: new Map(),
  dossiers: {},
  selected: null,
  hovered: null,
  lens: 'roster',
  focus: 'all',
  panel: null,
  tab: 'overview',
  overlay: null,
  searchOpen: false,
  askOpen: false,
  introDone: false,
  touring: false,

  async load() {
    try {
      const [team, roster] = await Promise.all([fetchJson<TeamData>(`${DATA}team.json`), fetchJson<RosterPlayer[]>(`${DATA}roster.json`)])
      const bySlug = new Map(roster.map((p) => [p.slug, p]))
      const loc = parseLocation()
      set({ status: 'ready', team, roster, bySlug, panel: loc.panel })
      if (loc.selected && bySlug.has(loc.selected)) get().select(loc.selected, { push: false })
      window.addEventListener(HASH_ROUTING ? 'hashchange' : 'popstate', () => {
        const l = parseLocation()
        if (l.selected && get().bySlug.has(l.selected)) { if (get().selected !== l.selected) get().select(l.selected, { push: false }) }
        else { if (get().selected) get().select(null, { push: false }); if (get().panel !== l.panel) get().openPanel(l.panel, false) }
      })
    } catch (err) {
      set({ status: 'error', error: String((err as Error).message || err) })
    }
  },

  select(slug, opts = {}) {
    const { dossiers } = get()
    if (!slug) {
      set({ selected: null, overlay: null })
      if (opts.push !== false) pushUrl(get().panel ? `/team/${get().panel}` : '/')
      return
    }
    set({ selected: slug, panel: null, tab: opts.tab || (get().selected ? get().tab : 'overview'), overlay: null, searchOpen: false, touring: false })
    if (opts.push !== false) pushUrl(`/player/${slug}`)
    if (!dossiers[slug]) {
      set({ dossiers: { ...dossiers, [slug]: 'loading' } })
      fetchJson<Dossier>(`${DATA}players/${slug}.json`)
        .then((d) => set((s) => ({ dossiers: { ...s.dossiers, [slug]: d } })))
        .catch(() => set((s) => ({ dossiers: { ...s.dossiers, [slug]: 'error' } })))
    }
  },

  hover: (id) => { if (get().hovered !== id) set({ hovered: id }) },
  setLens: (lens) => set({ lens }),
  setFocus: (focus) => set({ focus, touring: false }),
  openPanel(panel, push = true) {
    set({ panel, selected: panel ? null : get().selected, overlay: null, searchOpen: false })
    if (push) pushUrl(panel ? `/team/${panel}` : get().selected ? `/player/${get().selected}` : '/')
  },
  setTab: (tab) => set({ tab }),
  setOverlay: (overlay) => set({ overlay }),
  setSearch: (searchOpen) => set({ searchOpen }),
  setAsk: (askOpen) => set({ askOpen }),
  finishIntro: () => set({ introDone: true }),
  setTouring: (touring) => set({ touring }),

  step(dir) {
    const { roster, selected } = get()
    if (!roster.length) return
    const order = orderedRoster(roster)
    const i = order.findIndex((p) => p.slug === selected)
    const next = order[(i + dir + order.length) % order.length]
    get().select(next.slug)
  },
}))

const UNIT_ORDER = { offense: 0, defense: 1, special: 2 } as const
const ROSTER_ORDER = { active: 0, reserve: 1, practice: 2 } as const
const SLOT_ORDER = ['qb', 'rb', 'wr1', 'wr2', 'wr3', 'te', 'lt', 'lg', 'c', 'rg', 'rt', 'lde', 'ldt', 'rdt', 'rde', 'wlb', 'mlb', 'slb', 'lcb', 'rcb', 'nb', 'ss', 'fs', 'pk', 'p', 'ls']

/** Reading order used for keyboard stepping and lists: starters first, by unit and position. */
export function orderedRoster(roster: RosterPlayer[]): RosterPlayer[] {
  const slot = (p: RosterPlayer) => { const i = SLOT_ORDER.indexOf(p.depth?.slot || ''); return i < 0 ? 99 : i }
  return [...roster].sort((a, b) =>
    ROSTER_ORDER[a.roster] - ROSTER_ORDER[b.roster] ||
    (a.depth?.rank ?? 9) - (b.depth?.rank ?? 9) ||
    UNIT_ORDER[a.unit] - UNIT_ORDER[b.unit] ||
    slot(a) - slot(b) ||
    (a.number ?? 99) - (b.number ?? 99))
}
