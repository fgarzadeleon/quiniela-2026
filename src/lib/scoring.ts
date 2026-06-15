import { Match, Pick, MatchStage } from '@/types'
import { getTeam, SCORING, STAGE_ORDER } from './teams'

// First match of each round (UTC) — used to determine the current scoring round
export const ROUND_STARTS: Array<[MatchStage, Date]> = [
  ['GROUP_STAGE',    new Date('2026-06-11T19:00:00Z')],
  ['ROUND_OF_32',    new Date('2026-06-28T19:00:00Z')],
  ['ROUND_OF_16',    new Date('2026-07-04T17:00:00Z')],
  ['QUARTER_FINALS', new Date('2026-07-09T20:00:00Z')],
  ['SEMI_FINALS',    new Date('2026-07-14T19:00:00Z')],
  ['FINAL',          new Date('2026-07-19T19:00:00Z')],
]

export interface WildcardDeadline {
  label: string
  deadline: Date
  stage: MatchStage         // scoring stage (for pills, scoring grouping)
  effectiveStage: MatchStage // stored in wildcard_effective_from
}

// Wildcard deadline windows — each row: "use before deadline → new teams effective from effectiveStage"
export const WILDCARD_DEADLINES: WildcardDeadline[] = [
  { label: 'Group Stage, Matchday 2', deadline: new Date('2026-06-18T16:00:00Z'), stage: 'GROUP_STAGE', effectiveStage: 'GROUP_STAGE_MD2' },
  { label: 'Group Stage, Matchday 3', deadline: new Date('2026-06-24T19:00:00Z'), stage: 'GROUP_STAGE', effectiveStage: 'GROUP_STAGE_MD3' },
  { label: 'Round of 32',             deadline: new Date('2026-06-28T19:00:00Z'), stage: 'ROUND_OF_32', effectiveStage: 'ROUND_OF_32'     },
  { label: 'Round of 16',             deadline: new Date('2026-07-04T17:00:00Z'), stage: 'ROUND_OF_16', effectiveStage: 'ROUND_OF_16'     },
  { label: 'Quarter Finals',          deadline: new Date('2026-07-09T20:00:00Z'), stage: 'QUARTER_FINALS', effectiveStage: 'QUARTER_FINALS' },
  { label: 'Semi Finals',             deadline: new Date('2026-07-14T19:00:00Z'), stage: 'SEMI_FINALS', effectiveStage: 'SEMI_FINALS'     },
  { label: 'Final',                   deadline: new Date('2026-07-19T19:00:00Z'), stage: 'FINAL',        effectiveStage: 'FINAL'           },
]

// Exact UTC start time for each matchday-level effective stage
const MD_SPLIT_DATES: Partial<Record<MatchStage, Date>> = {
  GROUP_STAGE_MD2: new Date('2026-06-18T16:00:00Z'),
  GROUP_STAGE_MD3: new Date('2026-06-24T19:00:00Z'),
}

export function getNextWildcardDeadline(now: Date = new Date()): WildcardDeadline | null {
  return WILDCARD_DEADLINES.find(d => now < d.deadline) ?? null
}

export function getCurrentRound(now: Date = new Date()): MatchStage {
  let current: MatchStage = 'GROUP_STAGE'
  for (const [stage, start] of ROUND_STARTS) {
    if (now >= start) current = stage
  }
  return current
}

export function getNextRound(stage: MatchStage): MatchStage | null {
  const idx = STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[idx + 1] as MatchStage
}

function scoreTeamMatches(teamName: string, teamMatches: Match[]): number {
  if (teamMatches.length === 0) return 0
  const team = getTeam(teamName)
  if (!team) return 0
  const scoring = SCORING[team.tier]
  let pts = 0
  for (const m of teamMatches) {
    const isHome = m.home_team === teamName
    const gf = isHome ? m.home_score : m.away_score
    const ga = isHome ? m.away_score : m.home_score
    if (gf > ga) pts += scoring.win
    else if (gf === ga) pts += scoring.draw
    else pts += scoring.loss
    pts += gf * scoring.goalFor + ga * scoring.goalAgainst
  }
  return pts
}

function computePoints(pick: Pick, matches: Match[]): { total: number; byTeam: Map<string, number>; byOldTeam: Map<string, number> } {
  const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
  const finishedMatches = matches.filter(m => m.status === 'FINISHED' || LIVE.has(m.status))

  const hasWildcardData = pick.wildcard_used && pick.wildcard_effective_from && pick.wildcard_old_team1
  const effectiveFrom = pick.wildcard_effective_from
  const isGroupStageWildcard = hasWildcardData && (
    effectiveFrom === 'GROUP_STAGE' || effectiveFrom === 'GROUP_STAGE_MD2' || effectiveFrom === 'GROUP_STAGE_MD3'
  )
  // Resolve the group-stage split date: prefer the matchday boundary, fall back to exact submission time
  const wcSplitDate: Date | null = isGroupStageWildcard
    ? (MD_SPLIT_DATES[effectiveFrom!] ?? (pick.wildcard_used_at ? new Date(pick.wildcard_used_at) : null))
    : null

  const currentSet = new Set([pick.team1, pick.team2, pick.team3, pick.team4, pick.team5].filter(Boolean))
  const swappedOutNames = hasWildcardData
    ? [pick.wildcard_old_team1!, pick.wildcard_old_team2!, pick.wildcard_old_team3!, pick.wildcard_old_team4!, pick.wildcard_old_team5!]
        .filter(t => t && !currentSet.has(t))
    : []

  function teamsForStage(stage: string): string[] {
    if (!hasWildcardData) return [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]
    const stageIdx = STAGE_ORDER.indexOf(stage)
    const effectiveIdx = STAGE_ORDER.indexOf(pick.wildcard_effective_from!)
    if (stageIdx < effectiveIdx) {
      return [pick.wildcard_old_team1!, pick.wildcard_old_team2!, pick.wildcard_old_team3!, pick.wildcard_old_team4!, pick.wildcard_old_team5!]
    }
    return [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]
  }

  const byTeam = new Map<string, number>()
  for (const t of [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]) {
    if (t) byTeam.set(t, 0)
  }
  const byOldTeam = new Map<string, number>()
  for (const t of swappedOutNames) byOldTeam.set(t, 0)

  let total = 0

  for (const stage of STAGE_ORDER) {
    const stageMatches = finishedMatches.filter(m => m.stage === stage)
    if (stageMatches.length === 0) continue

    // Group-stage wildcard: score each match against whichever teams were active at that time
    if (stage === 'GROUP_STAGE' && isGroupStageWildcard && wcSplitDate) {
      const preWc  = stageMatches.filter(m => new Date(m.match_date) <  wcSplitDate)
      const postWc = stageMatches.filter(m => new Date(m.match_date) >= wcSplitDate)
      const oldTeams = [pick.wildcard_old_team1!, pick.wildcard_old_team2!, pick.wildcard_old_team3!, pick.wildcard_old_team4!, pick.wildcard_old_team5!]
      const newTeams = [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]

      for (const teamName of oldTeams) {
        const pts = scoreTeamMatches(teamName, preWc.filter(m => m.home_team === teamName || m.away_team === teamName))
        total += pts
        if (byOldTeam.has(teamName)) {
          byOldTeam.set(teamName, (byOldTeam.get(teamName) ?? 0) + pts)
        } else if (byTeam.has(teamName)) {
          // Kept team: pre-wildcard group-stage points go into byTeam too
          byTeam.set(teamName, (byTeam.get(teamName) ?? 0) + pts)
        }
      }
      for (const teamName of newTeams) {
        const pts = scoreTeamMatches(teamName, postWc.filter(m => m.home_team === teamName || m.away_team === teamName))
        total += pts
        if (byTeam.has(teamName)) byTeam.set(teamName, (byTeam.get(teamName) ?? 0) + pts)
      }
      continue
    }

    const teams = teamsForStage(stage)
    const usingOldTeams = hasWildcardData && !isGroupStageWildcard &&
      STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf(pick.wildcard_effective_from!)

    for (const teamName of teams) {
      const team = getTeam(teamName)
      if (!team) continue
      const scoring = SCORING[team.tier]

      const teamMatches = stageMatches.filter(m => m.home_team === teamName || m.away_team === teamName)
      if (teamMatches.length === 0) continue

      let pts = scoreTeamMatches(teamName, teamMatches)

      if (stage !== 'GROUP_STAGE') {
        pts += scoring.advanceRound
        if (stage === 'FINAL') {
          const finalMatch = teamMatches[0]
          const isHome = finalMatch.home_team === teamName
          const gf = isHome ? finalMatch.home_score : finalMatch.away_score
          const ga = isHome ? finalMatch.away_score : finalMatch.home_score
          if (gf > ga) pts += scoring.champion
        }
      }

      total += pts
      if (usingOldTeams && byOldTeam.has(teamName)) {
        byOldTeam.set(teamName, (byOldTeam.get(teamName) ?? 0) + pts)
      } else if (!usingOldTeams && byTeam.has(teamName)) {
        byTeam.set(teamName, (byTeam.get(teamName) ?? 0) + pts)
      }
    }
  }

  return { total, byTeam, byOldTeam }
}

export function calculatePickPoints(pick: Pick, matches: Match[]): number {
  return computePoints(pick, matches).total
}

export function calculatePickPointsBreakdown(pick: Pick, matches: Match[]): Array<{ name: string; points: number }> {
  const { byTeam } = computePoints(pick, matches)
  return [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]
    .filter(Boolean)
    .map(name => ({ name: name!, points: byTeam.get(name!) ?? 0 }))
}

// Returns points earned by swapped-out teams before the wildcard took effect
export function calculateOldTeamPointsBreakdown(pick: Pick, matches: Match[]): Array<{ name: string; points: number }> {
  const { byOldTeam } = computePoints(pick, matches)
  return [...byOldTeam.entries()].map(([name, points]) => ({ name, points }))
}
