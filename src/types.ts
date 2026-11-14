// Shapes of the JSON produced by the data pipeline (see /pipeline). Deep, rarely-typed
// branches are left loose on purpose: the pipeline drops empty values, so every optional
// field has to be handled as possibly missing anyway.

export type Unit = 'offense' | 'defense' | 'special'
export type Group = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'ST'
export type RosterStatus = 'active' | 'reserve' | 'practice'
export type Tone = 'ok' | 'warn' | 'out' | 'muted'

export interface RosterPlayer {
  id: string
  slug: string
  name: string
  first?: string
  last?: string
  number?: number
  position?: string
  group: Group
  unit: Unit
  roster: RosterStatus
  rosterDetail: string
  depth?: { slot: string; label: string; rank: number; starter: boolean }
  roles?: string[]
  height?: number
  weight?: number
  age?: number
  experience?: number
  college?: string
  draft?: { year: number; round?: number; pick: number }
  availability: { status: string; tone: Tone; injury?: string }
  line?: { label: string; value: string | number }[]
  lens?: { cap?: number; apy?: number; through?: number; snaps?: number; index?: number }
}

export interface Metric {
  key: string
  label: string
  format: 'int' | 'pct' | 'share' | 'dec1' | 'dec2' | 'dec3'
  direction: 'high' | 'low' | 'neutral'
  value: number
  pct?: number
  rank?: number
  of?: number
}

export interface ContractSeason {
  year: number
  team?: string
  base?: number
  prorated?: number
  option?: number
  roster?: number
  workout?: number
  perGame?: number
  other?: number
  guaranteed?: number
  cap?: number
  capPct?: number
  cash?: number
  void?: boolean
}

export interface Contract {
  otcPosition?: string
  type?: string
  yearSigned?: number
  years?: number
  value?: number
  apy?: number
  guaranteed?: number
  apyCapPct?: number
  apyRank?: { rank: number; of: number; position: string }
  throughYear?: number
  freeAgentYear?: number
  capHit?: number
  capRank?: number
  cashThisYear?: number
  careerCash?: number
  seasons?: ContractSeason[]
  history?: { team?: string; type?: string; status?: string; yearSigned?: number; years?: number; total?: number; apy?: number; guarantees?: number; earned?: number; pctEarned?: number }[]
}

export type StatLine = Record<string, any>

export interface Play {
  week: number
  opp: string
  qtr: number
  time?: string
  down?: number
  togo?: number
  spot?: string
  text: string
  epa?: number
  wpa?: number
  yards?: number
  td?: boolean
  role?: string
  score?: string
  t?: number
}

export interface Dossier extends Omit<RosterPlayer, 'draft' | 'availability'> {
  gsis?: string
  espnId?: string
  pfrId?: string
  positionName?: string
  bio: {
    birthDate?: string
    age?: number
    birthPlace?: { city?: string; state?: string; country?: string }
    birthPlaceText?: string
    height?: number
    weight?: number
    college?: string
    colleges?: string[]
    conference?: string
    experience?: number
    rookieYear?: number
    draft?: { year: number; round?: number; pick: number; team?: string }
  }
  availability: { status: string; tone: Tone; injury?: string; practice?: string; week?: number; returnDate?: string }
  stats: { seasons?: StatLine[]; career?: StatLine; games?: StatLine[] }
  snaps?: { season: { games: number; off: number; def: number; st: number; offPct: number; defPct: number; stPct: number }; games?: { week: number; opp: string; off: number; offPct?: number; def: number; defPct?: number; st: number; stPct?: number }[] }
  percentiles?: { pool: string; poolLabel: string; qualified: boolean; qualifier: string; poolSize: number; index?: number; metrics: Metric[] }
  advanced?: { ngs?: Record<string, Record<string, StatLine>>; pfr?: Record<string, Record<string, StatLine>>; qbr?: Record<string, StatLine> }
  combine?: { year: number; position: string; school?: string; poolNote: string; drills: { key: string; label: string; unit: string; value: number; pct?: number }[] }
  draft?: { season: number; round: number; pick: number; team: string; age?: number; allPro?: number; proBowls?: number; seasonsStarted?: number; weightedAv?: number; careerAv?: number }
  contract?: Contract
  plays?: Play[]
  zones?: { pass?: Record<string, Zone>; recv?: Record<string, Zone>; rush?: Record<string, Lane> }
  splits?: Record<string, Record<string, { plays: number; yds: number; td: number; epa: number; first: number; cmp: number }>>
  reports?: { week: number; injury?: string; gameStatus?: string; practice?: string }[]
  weeklyStatus?: { week: number; status: string; detail: string }[]
  espn?: { summaryLabel?: string; summary?: { name: string; label: string; value: string; rank?: string }[]; birthPlace?: string; draftText?: string }
  news?: NewsItem[]
  wiki?: {
    title?: string
    url?: string
    description?: string
    touched?: string
    intro?: string
    sections?: { key: string; title: string; text: string }[]
    family?: { relation: string; name: string; description?: string; url?: string }[]
    social?: { x?: string; instagram?: string }
  }
  transactions?: { date: string; text: string }[]
  links?: Record<string, string>
  insights?: string[]
  listed?: { chart: string; slot: string; label: string; rank: number }[]
}

export interface Zone { att: number; cmp: number; yds: number; td: number; int: number; epa: number }
export interface Lane { att: number; yds: number; td: number; epa: number; success: number; first: number }
export interface NewsItem { headline: string; description?: string; published?: string; url?: string; type?: string; byline?: string; source: string }

export interface Game {
  id: string
  week: number
  type: string
  date: string
  weekday: string
  timeET: string
  kickoff?: string
  opp: string
  oppName: string
  oppColor?: string
  oppAltColor?: string
  home: boolean
  neutral?: boolean
  venue?: string
  city?: string
  roof?: string
  surface?: string
  tv?: string[]
  divisionGame?: boolean
  line?: number
  total?: number
  rest?: number
  oppCoach?: string
  oppQb?: string
  note?: string
  result?: { us: number; them: number; outcome: 'W' | 'L' | 'T'; overtime?: boolean }
  wp?: [number, number][]
  turningPoints?: Play[]
}

export interface CompareRow { label: string; det: number; detRank: number; opp: number; oppRank: number }

export interface TeamData {
  generatedAt: string
  season: number
  week: number
  team: {
    abbr: string
    name: string
    coach?: { name: string; seasons?: number }
    record: { wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; home: number[]; road: number[]; division: number[]; streak?: string; last5: string[] }
    standing?: string
    seed?: number
    division?: string
    bye?: number
  }
  standings: { conference: string; name: string; teams: { abbr: string; name: string; wins: number; losses: number; ties: number; pct?: number; pointsFor?: number; pointsAgainst?: number; diff?: number; streak?: string; seed?: number; home?: string; road?: string; division?: string; conferenceRecord?: string }[] }[]
  schedule: Game[]
  matchup?: any
  ranks: { labels: { off: Record<string, string>; def: Record<string, string> }; teams: Record<string, { games: number; off: Record<string, number>; def: Record<string, number>; offRank: Record<string, number>; defRank: Record<string, number> }> }
  zones?: { offense: { pass?: Record<string, Zone>; rush?: Record<string, Lane> }; defense: { pass?: Record<string, Zone>; rush?: Record<string, Lane> } }
  cap: any
  injuries?: { slug: string; name: string; position?: string; roster: string; status: string; tone: Tone; injury?: string; practice?: string; returnDate?: string }[]
  transactions?: { date: string; text: string }[]
  news?: NewsItem[]
  depth: { slots: Record<string, string[]>; charts: string[] }
  teams: Record<string, { abbr: string; name: string; location: string; nickname: string; color: string; altColor: string }>
  sources: { id: string; name: string; what: string; url: string; license?: string }[]
}
