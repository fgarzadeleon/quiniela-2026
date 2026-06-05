// Costs recalculated from OddsChecker avg across 27 bookmakers (07/06/2026):
// cost = round5(-35.64 * log10(avg_decimal_odds) + 126.54), min 10
// Tiers updated to match new cost brackets.

import { Team, ScoringTable, Tier } from '@/types'

export const TEAMS: Team[] = [
  // ── TIER A — Elite Favorites (85–100 pts) — pick at most 1 ──
  { name: 'France',    flag: '🇫🇷', cost: 100, tier: 'A' },
  { name: 'Spain',     flag: '🇪🇸', cost: 100, tier: 'A' },
  { name: 'England',   flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', cost: 95,  tier: 'A' },
  { name: 'Brazil',    flag: '🇧🇷', cost: 90,  tier: 'A' },
  { name: 'Argentina', flag: '🇦🇷', cost: 90,  tier: 'A' },
  { name: 'Portugal',  flag: '🇵🇹', cost: 90,  tier: 'A' },
  { name: 'Germany',   flag: '🇩🇪', cost: 85,  tier: 'A' },

  // ── TIER B — Strong Contenders (55–80 pts) ──
  { name: 'Netherlands', flag: '🇳🇱', cost: 80, tier: 'B' },
  { name: 'Norway',      flag: '🇳🇴', cost: 75, tier: 'B' },
  { name: 'Belgium',     flag: '🇧🇪', cost: 70, tier: 'B' },
  { name: 'Colombia',    flag: '🇨🇴', cost: 70, tier: 'B' },
  { name: 'Japan',       flag: '🇯🇵', cost: 65, tier: 'B' },
  { name: 'Morocco',     flag: '🇲🇦', cost: 65, tier: 'B' },
  { name: 'USA',         flag: '🇺🇸', cost: 65, tier: 'B' },
  { name: 'Mexico',      flag: '🇲🇽', cost: 60, tier: 'B' },
  { name: 'Uruguay',     flag: '🇺🇾', cost: 60, tier: 'B' },
  { name: 'Switzerland', flag: '🇨🇭', cost: 60, tier: 'B' },
  { name: 'Croatia',     flag: '🇭🇷', cost: 60, tier: 'B' },
  { name: 'Turkey',      flag: '🇹🇷', cost: 60, tier: 'B' },
  { name: 'Ecuador',     flag: '🇪🇨', cost: 55, tier: 'B' },
  { name: 'Senegal',     flag: '🇸🇳', cost: 55, tier: 'B' },
  { name: 'Sweden',      flag: '🇸🇪', cost: 55, tier: 'B' },

  // ── TIER C — Dark Horses (30–50 pts) ──
  { name: 'Austria',               flag: '🇦🇹', cost: 50, tier: 'C' },
  { name: 'Canada',                flag: '🇨🇦', cost: 50, tier: 'C' },
  { name: 'Paraguay',              flag: '🇵🇾', cost: 45, tier: 'C' },
  { name: 'Scotland',              flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', cost: 45, tier: 'C' },
  { name: 'Ivory Coast',           flag: '🇨🇮', cost: 45, tier: 'C' },
  { name: 'Czech Republic',        flag: '🇨🇿', cost: 40, tier: 'C' },
  { name: 'Bosnia and Herzegovina', flag: '🇧🇦', cost: 35, tier: 'C' },
  { name: 'Egypt',                 flag: '🇪🇬', cost: 35, tier: 'C' },
  { name: 'South Korea',           flag: '🇰🇷', cost: 35, tier: 'C' },
  { name: 'Algeria',               flag: '🇩🇿', cost: 35, tier: 'C' },
  { name: 'Ghana',                 flag: '🇬🇭', cost: 35, tier: 'C' },
  { name: 'Australia',             flag: '🇦🇺', cost: 30, tier: 'C' },
  { name: 'Tunisia',               flag: '🇹🇳', cost: 30, tier: 'C' },
  { name: 'Iran',                  flag: '🇮🇷', cost: 30, tier: 'C' },

  // ── TIER D — Underdogs (10–25 pts) ──
  { name: 'DR Congo',    flag: '🇨🇩', cost: 25, tier: 'D' },
  { name: 'South Africa',flag: '🇿🇦', cost: 25, tier: 'D' },
  { name: 'Saudi Arabia',flag: '🇸🇦', cost: 20, tier: 'D' },
  { name: 'Qatar',       flag: '🇶🇦', cost: 20, tier: 'D' },
  { name: 'New Zealand', flag: '🇳🇿', cost: 20, tier: 'D' },
  { name: 'Panama',      flag: '🇵🇦', cost: 20, tier: 'D' },
  { name: 'Iraq',        flag: '🇮🇶', cost: 15, tier: 'D' },
  { name: 'Cape Verde',  flag: '🇨🇻', cost: 15, tier: 'D' },
  { name: 'Uzbekistan',  flag: '🇺🇿', cost: 15, tier: 'D' },
  { name: 'Jordan',      flag: '🇯🇴', cost: 15, tier: 'D' },
  { name: 'Curacao',     flag: '🇨🇼', cost: 10, tier: 'D' },
  { name: 'Haiti',       flag: '🇭🇹', cost: 10, tier: 'D' },
]

export const TEAM_MAP = new Map(TEAMS.map(t => [t.name, t]))

export const MAX_BUDGET = 300
export const TEAMS_TO_PICK = 5
export const MAX_A_TIER = 1

export const SCORING: Record<Tier, ScoringTable> = {
  A: { win: 70,  draw: 10, loss: -60, goalFor: 10, goalAgainst: -5, advanceRound: 120, champion: 500 },
  B: { win: 85,  draw: 30, loss: -45, goalFor: 10, goalAgainst: -5, advanceRound: 150, champion: 500 },
  C: { win: 100, draw: 40, loss: -30, goalFor: 10, goalAgainst: -5, advanceRound: 200, champion: 500 },
  D: { win: 120, draw: 60, loss: -10, goalFor: 10, goalAgainst: -5, advanceRound: 250, champion: 500 },
}

export const TIER_LABELS: Record<Tier, string> = {
  A: 'Elite Favorites',
  B: 'Strong Contenders',
  C: 'Dark Horses',
  D: 'Underdogs',
}

export const STAGE_ORDER = [
  'GROUP_STAGE',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'FINAL',
]

export function getTeam(name: string): Team | undefined {
  return TEAM_MAP.get(name)
}

export function getTeamsByTier(tier: Tier): Team[] {
  return TEAMS.filter(t => t.tier === tier)
}
