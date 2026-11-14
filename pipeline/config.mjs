// Project-level constants for the data build.
export const SEASON = Number(process.env.SEASON || 2026)
export const TEAM = 'DET'
export const TEAM_NAME = 'Detroit Lions'

// League-wide salary cap per club, in $ millions. These are announced once a year by the NFL,
// so they live here with their source rather than being scraped.
export const LEAGUE_CAP = {
  2022: 208.2,
  2023: 224.8,
  2024: 255.4,
  2025: 279.2,
  2026: 301.2,
}
export const LEAGUE_CAP_SOURCE = {
  label: 'NFL salary cap set at $301.2 million for 2026 (AP via ESPN, Feb. 27, 2026)',
  url: 'https://www.espn.com/nfl/story/_/id/48055711/nfl-salary-cap-hits-new-milestone-3012-million-2026',
}

export const SOURCES = [
  { id: 'nflverse', name: 'nflverse', what: 'Player and team statistics, snap counts, play-by-play, Next Gen Stats, combine and draft records', url: 'https://github.com/nflverse/nflverse-data', license: 'Open data (CC BY 4.0)' },
  { id: 'otc', name: 'OverTheCap (via nflverse)', what: 'Contract terms and year-by-year cap figures', url: 'https://overthecap.com' },
  { id: 'pfr', name: 'Pro Football Reference (via nflverse)', what: 'Advanced charting stats and snap counts', url: 'https://www.pro-football-reference.com' },
  { id: 'espn', name: 'ESPN', what: 'Current roster, depth chart, injuries, schedule, standings, matchup projections and headlines', url: 'https://www.espn.com/nfl/team/_/name/det/detroit-lions' },
  { id: 'wikipedia', name: 'Wikipedia', what: 'Biographical background text', url: 'https://en.wikipedia.org', license: 'CC BY-SA 4.0' },
  { id: 'wikidata', name: 'Wikidata', what: 'Family links and official social accounts', url: 'https://www.wikidata.org', license: 'CC0' },
]
