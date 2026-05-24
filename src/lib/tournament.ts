// 2026 FIFA World Cup tournament structure
// 12 groups × 4 teams = 48 teams
// Top 2 per group (24) + 8 best 3rd-place (8) → Round of 32

export const GROUPS: Record<string, string[]> = {
  A: ['France',      'Colombia',     'Scotland',     'Tunisia'],
  B: ['Spain',       'Croatia',      'Senegal',      'DR Congo'],
  C: ['England',     'Belgium',      'Turkey',       'Haiti'],
  D: ['Brazil',      'Switzerland',  'Ghana',        'Qatar'],
  E: ['Argentina',   'USA',          'Egypt',        'Curacao'],
  F: ['Portugal',    'Japan',        'Algeria',      'Saudi Arabia'],
  G: ['Germany',     'Morocco',      'Austria',      'New Zealand'],
  H: ['Netherlands', 'Ecuador',      'South Africa', 'Iran'],
  I: ['Norway',      'Sweden',       'Canada',       'Australia'],
  J: ['Uruguay',     'Czech Republic','Bosnia',      'Iraq'],
  K: ['Mexico',      'Ivory Coast',  'Paraguay',     'Panama'],
  L: ['South Korea', 'Cape Verde',   'Jordan',       'Uzbekistan'],
}

// Which group each team belongs to
export const TEAM_GROUP = Object.fromEntries(
  Object.entries(GROUPS).flatMap(([g, teams]) => teams.map(t => [t, g]))
)

// Round 1: T0 v T1, T2 v T3
// Round 2: T0 v T2, T1 v T3
// Round 3: T0 v T3, T1 v T2
export function groupMatchups(group: string): Array<[string, string, string, number]> {
  const [t0, t1, t2, t3] = GROUPS[group]
  const base = new Date('2026-06-11T16:00:00Z')
  const day = (d: number) => new Date(base.getTime() + d * 86400_000).toISOString()
  return [
    [t0, t1, day(0),  1],
    [t2, t3, day(0),  1],
    [t0, t2, day(4),  2],
    [t1, t3, day(4),  2],
    [t0, t3, day(9),  3],
    [t1, t2, day(9),  3],
  ]
}

// All 72 group-stage matches
export function allGroupMatches() {
  return Object.keys(GROUPS).flatMap(g =>
    groupMatchups(g).map(([home, away, date, round]) => ({
      home_team: home, away_team: away,
      match_date: date,
      stage: 'GROUP_STAGE' as const,
      group_name: `Group ${g}`,
      status: 'SCHEDULED' as const,
      home_score: 0, away_score: 0,
      _round: round,
    }))
  )
}
