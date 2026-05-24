// Simulation engine: generates realistic WC results weighted by team strength (cost)

import { TEAM_MAP } from './teams'
import { GROUPS } from './tournament'

// ---------- Random helpers ----------

function rand() { return Math.random() }

// Poisson-distributed integer (lambda = expected goals)
function poisson(lambda: number): number {
  let L = Math.exp(-lambda), p = 1, k = 0
  do { k++; p *= rand() } while (p > L)
  return k - 1
}

// ---------- Single match simulation ----------

export interface SimResult {
  home_score: number
  away_score: number
}

export function simulateMatch(homeTeam: string, awayTeam: string): SimResult {
  const home = TEAM_MAP.get(homeTeam)
  const away = TEAM_MAP.get(awayTeam)

  // Strength proxy: inverse of cost (cheaper = weaker but more volatile)
  const hs = home?.cost ?? 20
  const as = away?.cost ?? 20

  // Expected goals scale: stronger teams score more on average
  // Base lambda: ~1.2 goals per team in WC, scaled by relative strength
  const ratio = hs / (hs + as)               // fraction 0–1
  const homeLambda = 0.5 + 2.0 * ratio       // 0.5–2.5 goals
  const awayLambda = 0.5 + 2.0 * (1 - ratio) // 0.5–2.5 goals

  return {
    home_score: poisson(homeLambda),
    away_score: poisson(awayLambda),
  }
}

// ---------- Group-stage standings ----------

interface TeamRecord {
  team: string
  group: string
  pts: number
  gf: number
  ga: number
  gd: number
  played: number
}

interface FinishedMatch {
  home_team: string
  away_team: string
  home_score: number
  away_score: number
  group_name?: string
}

export function buildStandings(matches: FinishedMatch[]): Record<string, TeamRecord[]> {
  const records: Record<string, TeamRecord> = {}

  for (const [g, teams] of Object.entries(GROUPS)) {
    for (const t of teams) {
      records[t] = { team: t, group: g, pts: 0, gf: 0, ga: 0, gd: 0, played: 0 }
    }
  }

  for (const m of matches) {
    const h = records[m.home_team], a = records[m.away_team]
    if (!h || !a) continue
    h.gf += m.home_score; h.ga += m.away_score; h.gd += m.home_score - m.away_score; h.played++
    a.gf += m.away_score; a.ga += m.home_score; a.gd += m.away_score - m.home_score; a.played++
    if (m.home_score > m.away_score) { h.pts += 3 }
    else if (m.home_score === m.away_score) { h.pts += 1; a.pts += 1 }
    else { a.pts += 3 }
  }

  const byGroup: Record<string, TeamRecord[]> = {}
  for (const g of Object.keys(GROUPS)) {
    byGroup[g] = Object.values(records)
      .filter(r => r.group === g)
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
  }
  return byGroup
}

// Returns the 32 teams that advance (top-2 per group + 8 best 3rd place)
export function advancing(standings: Record<string, TeamRecord[]>): string[] {
  const top2: string[] = []
  const thirds: TeamRecord[] = []

  for (const group of Object.values(standings)) {
    top2.push(group[0].team, group[1].team)
    if (group[2]) thirds.push(group[2])
  }

  const best8 = thirds
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
    .slice(0, 8)
    .map(r => r.team)

  return [...top2, ...best8]
}

// Simple seeded bracket for knockout rounds (pair winners sequentially)
export function makeKnockoutMatches(
  teams: string[],
  stage: string,
  startDate: Date
): Array<{ home_team: string; away_team: string; match_date: string; stage: string; status: 'SCHEDULED'; home_score: 0; away_score: 0 }> {
  const matches = []
  for (let i = 0; i < teams.length; i += 2) {
    matches.push({
      home_team: teams[i],
      away_team: teams[i + 1],
      match_date: startDate.toISOString(),
      stage,
      status: 'SCHEDULED' as const,
      home_score: 0 as const,
      away_score: 0 as const,
    })
  }
  return matches
}
