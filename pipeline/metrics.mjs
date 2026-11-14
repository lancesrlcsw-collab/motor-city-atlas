// Derived rate stats and league-wide percentile ranks by position.
import { round, div, percentileOf } from './lib/util.mjs'

/** Add the standard rate stats to a season/weekly stat line (mutates and returns it). */
export function derive(s) {
  const att = s.attempts || 0
  if (att > 0) {
    const cmp = s.completions || 0, yds = s.passing_yards || 0, td = s.passing_tds || 0, int = s.passing_interceptions || 0
    const sacks = s.sacks_suffered || 0, sackYds = Math.abs(s.sack_yards_lost || 0)
    const clamp = (v) => Math.max(0, Math.min(2.375, v))
    s.cmp_pct = round((cmp / att) * 100, 1)
    s.ypa = round(yds / att, 2)
    s.td_pct = round((td / att) * 100, 1)
    s.int_pct = round((int / att) * 100, 1)
    s.passer_rating = round(((clamp((cmp / att - 0.3) * 5) + clamp((yds / att - 3) * 0.25) + clamp((td / att) * 20) + clamp(2.375 - (int / att) * 25)) / 6) * 100, 1)
    s.sack_pct = round((sacks / (att + sacks)) * 100, 1)
    s.anya = round((yds + 20 * td - 45 * int - sackYds) / (att + sacks), 2)
    if (s.passing_epa !== undefined) s.epa_per_dropback = round(s.passing_epa / (att + sacks), 3)
  }
  if ((s.carries || 0) > 0) {
    s.ypc = round((s.rushing_yards || 0) / s.carries, 2)
    if (s.rushing_epa !== undefined) s.rush_epa_per_att = round(s.rushing_epa / s.carries, 3)
  }
  if ((s.targets || 0) > 0) {
    s.catch_pct = round(((s.receptions || 0) / s.targets) * 100, 1)
    s.ypt = round((s.receiving_yards || 0) / s.targets, 2)
    s.adot = round((s.receiving_air_yards || 0) / s.targets, 1)
    if (s.receiving_epa !== undefined) s.rec_epa_per_target = round(s.receiving_epa / s.targets, 3)
  }
  if ((s.receptions || 0) > 0) {
    s.ypr = round((s.receiving_yards || 0) / s.receptions, 1)
    s.yac_per_rec = round((s.receiving_yards_after_catch || 0) / s.receptions, 1)
  }
  const scrim = (s.rushing_yards || 0) + (s.receiving_yards || 0)
  if (scrim) s.scrimmage_yards = scrim
  const tds = (s.rushing_tds || 0) + (s.receiving_tds || 0) + (s.special_teams_tds || 0) + (s.def_tds || 0) + (s.fumble_recovery_tds || 0)
  if (tds) s.total_tds = tds
  const tackles = (s.def_tackles_solo || 0) + (s.def_tackles_with_assist || 0) + (s.def_tackle_assists || 0)
  if (tackles) s.tackles = tackles
  if ((s.fg_att || 0) > 0) s.fg_pct = round(((s.fg_made || 0) / s.fg_att) * 100, 1)
  if ((s.pat_att || 0) > 0) s.pat_pct = round(((s.pat_made || 0) / s.pat_att) * 100, 1)
  if ((s.pt_att || 0) > 0) {
    s.punt_avg = round((s.pt_yards || 0) / s.pt_att, 1)
    s.punt_net = round((s.pt_net_yards || 0) / s.pt_att, 1)
    s.punt_in20_pct = round(((s.pt_inside_20 || 0) / s.pt_att) * 100, 1)
  }
  return s
}

// [key, label, format, direction]  direction: 'high' (default) | 'low' | 'neutral'
// `core` metrics feed the composite index.
export const POOLS = {
  QB: {
    label: 'quarterbacks', qual: (m, f) => (m.attempts || 0) >= 200 * f, qualText: (f) => `${Math.round(200 * f)}+ pass attempts`,
    core: ['epa_per_dropback', 'passer_rating', 'anya', 'cmp_pct', 'passing_cpoe', 'qbr'],
    list: [['passing_yards', 'Passing yards', 'int'], ['passing_tds', 'Passing TDs', 'int'], ['cmp_pct', 'Completion %', 'pct'], ['ypa', 'Yards per attempt', 'dec2'], ['passer_rating', 'Passer rating', 'dec1'], ['anya', 'Adj. net yards / attempt', 'dec2'], ['passing_epa', 'Passing EPA', 'dec1'], ['epa_per_dropback', 'EPA per dropback', 'dec3'], ['passing_cpoe', 'Completion % over expected', 'dec1'], ['qbr', 'ESPN Total QBR', 'dec1'], ['int_pct', 'Interception %', 'pct', 'low'], ['sack_pct', 'Sack %', 'pct', 'low'], ['pfr_on_tgt_pct', 'On-target throw %', 'pct'], ['pfr_bad_throw_pct', 'Bad-throw %', 'pct', 'low'], ['pfr_pressure_pct', 'Pressured %', 'pct', 'neutral'], ['ngs_avg_time_to_throw', 'Time to throw (sec)', 'dec2', 'neutral'], ['ngs_aggressiveness', 'Tight-window throw %', 'pct', 'neutral'], ['ngs_avg_intended_air_yards', 'Intended air yards', 'dec1', 'neutral']],
  },
  RB: {
    label: 'running backs', qual: (m, f) => (m.carries || 0) >= 100 * f, qualText: (f) => `${Math.round(100 * f)}+ carries`,
    core: ['rushing_yards', 'ypc', 'rush_epa_per_att', 'scrimmage_yards', 'ngs_rush_yards_over_expected_per_att', 'rushing_first_downs'],
    list: [['rushing_yards', 'Rushing yards', 'int'], ['ypc', 'Yards per carry', 'dec2'], ['rushing_tds', 'Rushing TDs', 'int'], ['rushing_first_downs', 'Rushing first downs', 'int'], ['rushing_epa', 'Rushing EPA', 'dec1'], ['rush_epa_per_att', 'EPA per carry', 'dec3'], ['scrimmage_yards', 'Scrimmage yards', 'int'], ['receptions', 'Receptions', 'int'], ['receiving_yards', 'Receiving yards', 'int'], ['target_share', 'Target share', 'share'], ['ngs_rush_yards_over_expected_per_att', 'Rush yards over expected / att', 'dec2'], ['ngs_efficiency', 'NGS efficiency (lower = more direct)', 'dec2', 'low'], ['ngs_percent_attempts_gte_eight_defenders', 'Stacked-box rate %', 'pct', 'neutral'], ['pfr_yac_att', 'Yards after contact / att', 'dec1'], ['pfr_brk_tkl', 'Broken tackles', 'int']],
  },
  WR: {
    label: 'wide receivers', qual: (m, f) => (m.targets || 0) >= 50 * f, qualText: (f) => `${Math.round(50 * f)}+ targets`,
    core: ['receiving_yards', 'ypt', 'receiving_epa', 'target_share', 'receiving_first_downs', 'catch_pct'],
    list: [['targets', 'Targets', 'int'], ['receptions', 'Receptions', 'int'], ['receiving_yards', 'Receiving yards', 'int'], ['receiving_tds', 'Receiving TDs', 'int'], ['receiving_first_downs', 'Receiving first downs', 'int'], ['ypr', 'Yards per reception', 'dec1'], ['ypt', 'Yards per target', 'dec2'], ['catch_pct', 'Catch %', 'pct'], ['target_share', 'Target share', 'share'], ['air_yards_share', 'Air-yards share', 'share'], ['wopr', 'WOPR (weighted opportunity)', 'dec3'], ['receiving_epa', 'Receiving EPA', 'dec1'], ['yac_per_rec', 'YAC per reception', 'dec1'], ['adot', 'Average depth of target', 'dec1', 'neutral'], ['ngs_avg_separation', 'Average separation (yd)', 'dec2'], ['ngs_avg_yac_above_expectation', 'YAC over expected', 'dec2'], ['pfr_drop_percent', 'Drop %', 'pct', 'low']],
  },
  TE: {
    label: 'tight ends', qual: (m, f) => (m.targets || 0) >= 30 * f, qualText: (f) => `${Math.round(30 * f)}+ targets`,
    core: ['receiving_yards', 'ypt', 'receiving_epa', 'target_share', 'receiving_first_downs', 'catch_pct'],
    list: [['targets', 'Targets', 'int'], ['receptions', 'Receptions', 'int'], ['receiving_yards', 'Receiving yards', 'int'], ['receiving_tds', 'Receiving TDs', 'int'], ['receiving_first_downs', 'Receiving first downs', 'int'], ['ypr', 'Yards per reception', 'dec1'], ['ypt', 'Yards per target', 'dec2'], ['catch_pct', 'Catch %', 'pct'], ['target_share', 'Target share', 'share'], ['receiving_epa', 'Receiving EPA', 'dec1'], ['yac_per_rec', 'YAC per reception', 'dec1'], ['adot', 'Average depth of target', 'dec1', 'neutral'], ['ngs_avg_separation', 'Average separation (yd)', 'dec2'], ['ngs_avg_yac_above_expectation', 'YAC over expected', 'dec2'], ['pfr_drop_percent', 'Drop %', 'pct', 'low']],
  },
  EDGE: {
    label: 'edge defenders', qual: (m, f) => (m.snaps_def || 0) >= 300 * f, qualText: (f) => `${Math.round(300 * f)}+ defensive snaps`,
    core: ['def_sacks', 'def_qb_hits', 'pfr_prss', 'def_tackles_for_loss', 'tackles'],
    list: [['def_sacks', 'Sacks', 'dec1'], ['def_qb_hits', 'QB hits', 'int'], ['pfr_prss', 'Pressures', 'int'], ['pfr_hrry', 'Hurries', 'int'], ['def_tackles_for_loss', 'Tackles for loss', 'int'], ['tackles', 'Total tackles', 'int'], ['def_fumbles_forced', 'Forced fumbles', 'int'], ['def_pass_defended', 'Passes defended', 'int'], ['pfr_m_tkl_percent', 'Missed-tackle %', 'pct', 'low'], ['snaps_def_pct', 'Defensive snap share', 'share']],
  },
  IDL: {
    label: 'interior defensive linemen', qual: (m, f) => (m.snaps_def || 0) >= 250 * f, qualText: (f) => `${Math.round(250 * f)}+ defensive snaps`,
    core: ['def_sacks', 'def_qb_hits', 'pfr_prss', 'def_tackles_for_loss', 'tackles'],
    list: [['def_sacks', 'Sacks', 'dec1'], ['def_qb_hits', 'QB hits', 'int'], ['pfr_prss', 'Pressures', 'int'], ['pfr_hrry', 'Hurries', 'int'], ['def_tackles_for_loss', 'Tackles for loss', 'int'], ['tackles', 'Total tackles', 'int'], ['def_fumbles_forced', 'Forced fumbles', 'int'], ['def_pass_defended', 'Passes defended', 'int'], ['pfr_m_tkl_percent', 'Missed-tackle %', 'pct', 'low'], ['snaps_def_pct', 'Defensive snap share', 'share']],
  },
  LB: {
    label: 'linebackers', qual: (m, f) => (m.snaps_def || 0) >= 300 * f, qualText: (f) => `${Math.round(300 * f)}+ defensive snaps`,
    core: ['tackles', 'def_tackles_for_loss', 'def_pass_defended', 'pfr_m_tkl_percent', 'pfr_rat'],
    list: [['tackles', 'Total tackles', 'int'], ['def_tackles_solo', 'Solo tackles', 'int'], ['def_tackles_for_loss', 'Tackles for loss', 'int'], ['def_sacks', 'Sacks', 'dec1'], ['def_qb_hits', 'QB hits', 'int'], ['pfr_prss', 'Pressures', 'int'], ['def_pass_defended', 'Passes defended', 'int'], ['def_interceptions', 'Interceptions', 'int'], ['def_fumbles_forced', 'Forced fumbles', 'int'], ['pfr_m_tkl_percent', 'Missed-tackle %', 'pct', 'low'], ['pfr_cmp_percent', 'Completion % allowed', 'pct', 'low'], ['pfr_rat', 'Passer rating allowed', 'dec1', 'low'], ['snaps_def_pct', 'Defensive snap share', 'share']],
  },
  CB: {
    label: 'cornerbacks', qual: (m, f) => (m.snaps_def || 0) >= 300 * f, qualText: (f) => `${Math.round(300 * f)}+ defensive snaps`,
    core: ['pfr_rat', 'pfr_cmp_percent', 'pfr_yds_tgt', 'def_pass_defended', 'pfr_m_tkl_percent'],
    list: [['def_pass_defended', 'Passes defended', 'int'], ['def_interceptions', 'Interceptions', 'int'], ['pfr_tgt', 'Times targeted', 'int', 'neutral'], ['pfr_cmp_percent', 'Completion % allowed', 'pct', 'low'], ['pfr_yds_tgt', 'Yards allowed per target', 'dec1', 'low'], ['pfr_rat', 'Passer rating allowed', 'dec1', 'low'], ['pfr_td', 'TDs allowed', 'int', 'low'], ['tackles', 'Total tackles', 'int'], ['def_tackles_for_loss', 'Tackles for loss', 'int'], ['pfr_m_tkl_percent', 'Missed-tackle %', 'pct', 'low'], ['snaps_def_pct', 'Defensive snap share', 'share']],
  },
  S: {
    label: 'safeties', qual: (m, f) => (m.snaps_def || 0) >= 300 * f, qualText: (f) => `${Math.round(300 * f)}+ defensive snaps`,
    core: ['tackles', 'def_pass_defended', 'pfr_rat', 'pfr_m_tkl_percent', 'def_interceptions'],
    list: [['tackles', 'Total tackles', 'int'], ['def_pass_defended', 'Passes defended', 'int'], ['def_interceptions', 'Interceptions', 'int'], ['def_tackles_for_loss', 'Tackles for loss', 'int'], ['def_sacks', 'Sacks', 'dec1'], ['def_fumbles_forced', 'Forced fumbles', 'int'], ['pfr_tgt', 'Times targeted', 'int', 'neutral'], ['pfr_cmp_percent', 'Completion % allowed', 'pct', 'low'], ['pfr_rat', 'Passer rating allowed', 'dec1', 'low'], ['pfr_m_tkl_percent', 'Missed-tackle %', 'pct', 'low'], ['snaps_def_pct', 'Defensive snap share', 'share']],
  },
  K: {
    label: 'kickers', qual: (m, f) => (m.fg_att || 0) >= 14 * f, qualText: (f) => `${Math.round(14 * f)}+ field-goal attempts`,
    core: ['fg_pct', 'fg_made', 'fg_long', 'pat_pct'],
    list: [['fg_made', 'Field goals made', 'int'], ['fg_pct', 'Field-goal %', 'pct'], ['fg_long', 'Longest make', 'int'], ['pat_pct', 'Extra-point %', 'pct']],
  },
  P: {
    label: 'punters', qual: (m, f) => (m.pt_att || 0) >= 30 * f, qualText: (f) => `${Math.round(30 * f)}+ punts`,
    core: ['punt_net', 'punt_avg', 'punt_in20_pct'],
    list: [['punt_avg', 'Gross average', 'dec1'], ['punt_net', 'Net average', 'dec1'], ['punt_in20_pct', 'Inside-20 %', 'pct'], ['pt_long', 'Longest punt', 'int']],
  },
}

/** Which percentile pool a player belongs to. OverTheCap's position is the most specific where known. */
export function poolOf({ otcPosition, position }) {
  const p = (otcPosition || '').toUpperCase()
  if (p === 'ED') return 'EDGE'
  if (p === 'IDL') return 'IDL'
  if (['QB', 'WR', 'TE', 'LB', 'CB', 'S', 'K', 'P'].includes(p)) return p
  if (p === 'RB' || p === 'FB') return 'RB'
  const n = (position || '').toUpperCase()
  if (n === 'QB' || n === 'WR' || n === 'TE' || n === 'K' || n === 'P' || n === 'CB') return n
  if (n === 'RB' || n === 'FB' || n === 'HB') return 'RB'
  if (n === 'DE' || n === 'EDGE') return 'EDGE'
  if (n === 'DT' || n === 'NT' || n === 'DL') return 'IDL'
  if (['LB', 'OLB', 'ILB', 'MLB'].includes(n)) return 'LB'
  if (['S', 'SS', 'FS', 'DB', 'SAF'].includes(n)) return 'S'
  if (n === 'PK') return 'K'
  return null
}

/**
 * @param {object[]} bags  one flat metric bag per league player: { gsis, pool, ...metrics }
 * @param {number} f       fraction of a 17-game season played so far (scales thresholds)
 */
export function buildPercentiles(bags, f) {
  const dist = {}
  for (const [pool, def] of Object.entries(POOLS)) {
    const qualified = bags.filter((b) => b.pool === pool && def.qual(b, f))
    dist[pool] = { n: qualified.length, ids: new Set(qualified.map((b) => b.gsis)), values: {} }
    for (const [key] of def.list) {
      dist[pool].values[key] = qualified.map((b) => b[key]).filter((v) => v !== null && v !== undefined && Number.isFinite(v)).sort((a, b) => a - b)
    }
  }
  return function rank(bag) {
    const def = POOLS[bag.pool]
    if (!def) return null
    const d = dist[bag.pool]
    const qualified = d.ids.has(bag.gsis)
    const metrics = []
    for (const [key, label, format, direction = 'high'] of def.list) {
      const value = bag[key]
      if (value === null || value === undefined || !Number.isFinite(value)) continue
      const sorted = d.values[key]
      let pct = null
      let rk = null
      if (qualified && sorted.length >= 8) {
        const raw = percentileOf(sorted, value)
        pct = direction === 'low' ? 100 - raw : raw
        const better = direction === 'low' ? sorted.filter((v) => v < value).length : sorted.filter((v) => v > value).length
        rk = better + 1
      }
      metrics.push({ key, label, format, direction, value, pct, rank: rk, of: rk ? sorted.length : null })
    }
    const corePcts = metrics.filter((m) => def.core.includes(m.key) && m.pct !== null).map((m) => m.pct)
    const index = qualified && corePcts.length >= 3 ? Math.round(corePcts.reduce((a, b) => a + b, 0) / corePcts.length) : null
    return { pool: bag.pool, poolLabel: def.label, qualified, qualifier: def.qualText(f), poolSize: d.n, index, metrics }
  }
}

export { div }
