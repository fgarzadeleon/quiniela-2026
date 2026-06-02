// 2026 FIFA World Cup — real groups and schedule
// 12 groups × 4 teams = 48 teams
// Top 2 per group (24) + 8 best 3rd-place (8) → Round of 32

const GROUP_SCHEDULE: Record<string, { teams: [string, string, string, string]; dates: [string, string, string] }> = {
  A: { teams: ['Mexico',      'South Africa',           'South Korea', 'Czech Republic'],      dates: ['2026-06-11', '2026-06-18', '2026-06-24'] },
  B: { teams: ['Canada',      'Bosnia and Herzegovina', 'Qatar',       'Switzerland'],          dates: ['2026-06-12', '2026-06-18', '2026-06-24'] },
  C: { teams: ['Brazil',      'Morocco',                'Haiti',       'Scotland'],             dates: ['2026-06-13', '2026-06-19', '2026-06-24'] },
  D: { teams: ['USA',         'Paraguay',               'Australia',   'Turkey'],               dates: ['2026-06-12', '2026-06-19', '2026-06-25'] },
  E: { teams: ['Germany',     'Curacao',                'Ivory Coast', 'Ecuador'],              dates: ['2026-06-14', '2026-06-20', '2026-06-25'] },
  F: { teams: ['Netherlands', 'Japan',                  'Sweden',      'Tunisia'],              dates: ['2026-06-14', '2026-06-20', '2026-06-25'] },
  G: { teams: ['Belgium',     'Egypt',                  'Iran',        'New Zealand'],          dates: ['2026-06-15', '2026-06-21', '2026-06-26'] },
  H: { teams: ['Spain',       'Cape Verde',             'Saudi Arabia','Uruguay'],              dates: ['2026-06-15', '2026-06-21', '2026-06-26'] },
  I: { teams: ['France',      'Senegal',                'Iraq',        'Norway'],               dates: ['2026-06-16', '2026-06-22', '2026-06-26'] },
  J: { teams: ['Argentina',   'Algeria',                'Austria',     'Jordan'],               dates: ['2026-06-16', '2026-06-22', '2026-06-27'] },
  K: { teams: ['Portugal',    'DR Congo',               'Uzbekistan',  'Colombia'],             dates: ['2026-06-17', '2026-06-23', '2026-06-27'] },
  L: { teams: ['England',     'Croatia',                'Ghana',       'Panama'],               dates: ['2026-06-17', '2026-06-23', '2026-06-27'] },
}

// Derived GROUPS constant for use across the codebase
export const GROUPS: Record<string, string[]> = Object.fromEntries(
  Object.entries(GROUP_SCHEDULE).map(([g, { teams }]) => [g, teams])
)

// Which group each team belongs to
export const TEAM_GROUP = Object.fromEntries(
  Object.entries(GROUPS).flatMap(([g, teams]) => teams.map(t => [t, g]))
)

// Round 1: T0 v T1 + T2 v T3 (first matchday for the group)
// Round 2: T0 v T2 + T1 v T3 (second matchday)
// Round 3: T0 v T3 + T1 v T2 (final matchday — concurrent for fairness)
export function allGroupMatches() {
  return Object.entries(GROUP_SCHEDULE).flatMap(([g, { teams: [t0, t1, t2, t3], dates: [d1, d2, d3] }]) => [
    { home_team: t0, away_team: t1, match_date: `${d1}T16:00:00Z`, stage: 'GROUP_STAGE' as const, group_name: `Group ${g}`, status: 'SCHEDULED' as const, home_score: 0, away_score: 0, _round: 1 },
    { home_team: t2, away_team: t3, match_date: `${d1}T19:00:00Z`, stage: 'GROUP_STAGE' as const, group_name: `Group ${g}`, status: 'SCHEDULED' as const, home_score: 0, away_score: 0, _round: 1 },
    { home_team: t0, away_team: t2, match_date: `${d2}T16:00:00Z`, stage: 'GROUP_STAGE' as const, group_name: `Group ${g}`, status: 'SCHEDULED' as const, home_score: 0, away_score: 0, _round: 2 },
    { home_team: t1, away_team: t3, match_date: `${d2}T19:00:00Z`, stage: 'GROUP_STAGE' as const, group_name: `Group ${g}`, status: 'SCHEDULED' as const, home_score: 0, away_score: 0, _round: 2 },
    { home_team: t0, away_team: t3, match_date: `${d3}T20:00:00Z`, stage: 'GROUP_STAGE' as const, group_name: `Group ${g}`, status: 'SCHEDULED' as const, home_score: 0, away_score: 0, _round: 3 },
    { home_team: t1, away_team: t2, match_date: `${d3}T20:00:00Z`, stage: 'GROUP_STAGE' as const, group_name: `Group ${g}`, status: 'SCHEDULED' as const, home_score: 0, away_score: 0, _round: 3 },
  ])
}
