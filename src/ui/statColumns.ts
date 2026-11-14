// Which columns a stat table shows for each kind of player, and how each value is printed.
import type { Dossier, StatLine } from '../types'
import { num } from '../lib/format'

export interface Col { key: string; label: string; title: string; digits?: number; share?: boolean }

const G: Col = { key: 'games', label: 'G', title: 'Games played' }
const c = (key: string, label: string, title: string, digits?: number, share?: boolean): Col => ({ key, label, title, digits, share })

const SETS: Record<string, Col[]> = {
  QB: [G, c('completions', 'CMP', 'Completions'), c('attempts', 'ATT', 'Pass attempts'), c('cmp_pct', 'CMP%', 'Completion percentage', 1), c('passing_yards', 'YDS', 'Passing yards'), c('passing_tds', 'TD', 'Passing touchdowns'), c('passing_interceptions', 'INT', 'Interceptions thrown'), c('passer_rating', 'RTG', 'Passer rating', 1), c('ypa', 'Y/A', 'Yards per attempt', 1), c('sacks_suffered', 'SK', 'Times sacked'), c('passing_epa', 'EPA', 'Expected points added on dropbacks', 1), c('rushing_yards', 'RUSH', 'Rushing yards'), c('rushing_tds', 'R TD', 'Rushing touchdowns')],
  RB: [G, c('carries', 'ATT', 'Carries'), c('rushing_yards', 'YDS', 'Rushing yards'), c('ypc', 'AVG', 'Yards per carry', 1), c('rushing_tds', 'TD', 'Rushing touchdowns'), c('rushing_first_downs', '1D', 'Rushing first downs'), c('targets', 'TGT', 'Targets'), c('receptions', 'REC', 'Receptions'), c('receiving_yards', 'R YDS', 'Receiving yards'), c('receiving_tds', 'R TD', 'Receiving touchdowns'), c('scrimmage_yards', 'SCRIM', 'Yards from scrimmage'), c('fumbles_lost_total', 'FL', 'Fumbles lost')],
  REC: [G, c('targets', 'TGT', 'Targets'), c('receptions', 'REC', 'Receptions'), c('receiving_yards', 'YDS', 'Receiving yards'), c('ypr', 'AVG', 'Yards per reception', 1), c('receiving_tds', 'TD', 'Receiving touchdowns'), c('receiving_first_downs', '1D', 'Receiving first downs'), c('catch_pct', 'CTCH%', 'Catch percentage', 1), c('receiving_yards_after_catch', 'YAC', 'Yards after the catch'), c('target_share', 'TGT%', 'Share of team targets', 1, true), c('receiving_epa', 'EPA', 'Expected points added on targets', 1)],
  OL: [G, c('penalties', 'PEN', 'Penalties'), c('penalty_yards', 'PEN YDS', 'Penalty yards')],
  DEF: [G, c('tackles', 'TKL', 'Total tackles'), c('def_tackles_solo', 'SOLO', 'Solo tackles'), c('def_tackles_for_loss', 'TFL', 'Tackles for loss'), c('def_sacks', 'SACK', 'Sacks', 1), c('def_qb_hits', 'QBH', 'Quarterback hits'), c('def_interceptions', 'INT', 'Interceptions'), c('def_pass_defended', 'PD', 'Passes defended'), c('def_fumbles_forced', 'FF', 'Forced fumbles'), c('fumble_recovery_opp', 'FR', 'Fumble recoveries')],
  K: [G, c('fg_made', 'FGM', 'Field goals made'), c('fg_att', 'FGA', 'Field goals attempted'), c('fg_pct', 'FG%', 'Field-goal percentage', 1), c('fg_long', 'LNG', 'Longest field goal'), c('pat_made', 'XPM', 'Extra points made'), c('pat_att', 'XPA', 'Extra points attempted')],
  P: [G, c('pt_att', 'PUNTS', 'Punts'), c('pt_yards', 'YDS', 'Punt yards'), c('punt_avg', 'AVG', 'Gross average', 1), c('punt_net', 'NET', 'Net average', 1), c('pt_inside_20', 'IN 20', 'Punts downed inside the 20'), c('pt_long', 'LNG', 'Longest punt')],
}

export function columnsFor(d: Pick<Dossier, 'group' | 'position'>): Col[] {
  switch (d.group) {
    case 'QB': return SETS.QB
    case 'RB': return SETS.RB
    case 'WR': case 'TE': return SETS.REC
    case 'OL': return SETS.OL
    case 'DL': case 'LB': case 'DB': return SETS.DEF
    default: return d.position === 'P' ? SETS.P : d.position === 'LS' ? SETS.OL : SETS.K
  }
}

export function cell(row: StatLine, col: Col): string {
  const v = row[col.key]
  if (v === undefined || v === null) return col.key === 'games' ? '0' : '–'
  if (col.share) return `${(v * 100).toFixed(col.digits ?? 0)}%`
  return num(v, col.digits ?? (Number.isInteger(v) ? 0 : 1))
}

// Friendly names for the tracking and charting tables.
export const NGS_LABELS: Record<string, [string, string, number?][]> = {
  passing: [['avg_time_to_throw', 'Time to throw (sec)', 2], ['avg_intended_air_yards', 'Intended air yards', 1], ['avg_completed_air_yards', 'Completed air yards', 1], ['avg_air_yards_to_sticks', 'Air yards vs. the sticks', 1], ['aggressiveness', 'Tight-window throws %', 1], ['expected_completion_percentage', 'Expected completion %', 1], ['completion_percentage_above_expectation', 'Completion % over expected', 1], ['max_completed_air_distance', 'Longest throw completed (yd in air)', 1]],
  receiving: [['avg_separation', 'Separation at the catch (yd)', 2], ['avg_cushion', 'Cushion at the snap (yd)', 2], ['avg_intended_air_yards', 'Average target depth (yd)', 1], ['percent_share_of_intended_air_yards', 'Share of team air yards %', 1], ['catch_percentage', 'Catch %', 1], ['avg_yac', 'YAC per reception', 1], ['avg_expected_yac', 'Expected YAC per reception', 1], ['avg_yac_above_expectation', 'YAC over expected', 2]],
  rushing: [['rush_yards_over_expected', 'Rush yards over expected', 0], ['rush_yards_over_expected_per_att', 'Yards over expected per carry', 2], ['efficiency', 'Efficiency (lower = more direct)', 2], ['percent_attempts_gte_eight_defenders', 'Stacked-box rate %', 1], ['avg_time_to_los', 'Time to the line (sec)', 2], ['expected_rush_yards', 'Expected rush yards', 0]],
}

export const PFR_LABELS: Record<string, [string, string, number?][]> = {
  passing: [['on_tgt_pct', 'On-target throws %', 1], ['bad_throws', 'Bad throws'], ['bad_throw_pct', 'Bad-throw %', 1], ['drops', 'Passes dropped by receivers'], ['times_pressured', 'Times pressured'], ['pressure_pct', 'Pressure rate %', 1], ['times_blitzed', 'Times blitzed'], ['times_hurried', 'Times hurried'], ['times_hit', 'Times hit'], ['pocket_time', 'Time in pocket (sec)', 1], ['scrambles', 'Scrambles']],
  rushing: [['ybc', 'Yards before contact'], ['ybc_att', 'Before contact per carry', 1], ['yac', 'Yards after contact'], ['yac_att', 'After contact per carry', 1], ['brk_tkl', 'Broken tackles']],
  receiving: [['drop', 'Drops'], ['drop_percent', 'Drop %', 1], ['brk_tkl', 'Broken tackles after the catch'], ['adot', 'Average depth of target', 1], ['ybc', 'Yards before the catch'], ['yac', 'Yards after the catch'], ['int', 'Interceptions when targeted'], ['rat', 'Passer rating when targeted', 1]],
  defense: [['prss', 'Pressures'], ['hrry', 'Hurries'], ['qbkd', 'Quarterback knockdowns'], ['sk', 'Sacks', 1], ['bltz', 'Blitzes'], ['comb', 'Combined tackles'], ['m_tkl', 'Missed tackles'], ['m_tkl_percent', 'Missed-tackle %', 1], ['tgt', 'Targets in coverage'], ['cmp', 'Completions allowed'], ['cmp_percent', 'Completion % allowed', 1], ['yds', 'Yards allowed in coverage'], ['yds_tgt', 'Yards allowed per target', 1], ['td', 'Touchdowns allowed'], ['rat', 'Passer rating allowed', 1], ['int', 'Interceptions']],
}

export const SPLIT_ROWS: [string, string][] = [['down1', '1st down'], ['down2', '2nd down'], ['down3', '3rd down'], ['down4', '4th down'], ['redZone', 'Red zone'], ['q1', '1st quarter'], ['q2', '2nd quarter'], ['q3', '3rd quarter'], ['q4', '4th quarter'], ['q5', 'Overtime'], ['leading', 'When leading'], ['tied', 'When tied'], ['trailing', 'When trailing']]
export const SPLIT_ROLE: Record<string, { title: string; plays: string }> = { pass: { title: 'Passing', plays: 'Att' }, recv: { title: 'Receiving', plays: 'Tgt' }, rush: { title: 'Rushing', plays: 'Car' } }
