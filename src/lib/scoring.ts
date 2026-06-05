import { Match, Pick, MatchStage } from '@/types'
import { getTeam, SCORING, STAGE_ORDER } from './teams'

// Round start dates (UTC) — used to determine wildcard effective round
const ROUND_STARTS: Array<[MatchStage, Date]> = [
  ['GROUP_STAGE',    new Date('2026-06-12T00:00:00Z')],
  ['ROUND_OF_32',    new Date('2026-06-27T00:00:00Z')],
  ['ROUND_OF_16',    new Date('2026-07-03T00:00:00Z')],
  ['QUARTER_FINALS', new Date('2026-07-08T00:00:00Z')],
  ['SEMI_FINALS',    new Date('2026-07-13T00:00:00Z')],
  ['FINAL',          new Date('2026-07-19T00:00:00Z')],
]

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

export function calculatePickPoints(pick: Pick, matches: Match[]): number {
  const finishedMatches = matches.filter(m => m.status === 'FINISHED')

  // Only apply split scoring if wildcard was used with the new tracking fields
  const hasWildcardData =
    pick.wildcard_used &&
    pick.wildcard_effective_from &&
    pick.wildcard_old_team1

  function teamsForStage(stage: string): string[] {
    if (!hasWildcardData) {
      return [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]
    }
    const stageIdx = STAGE_ORDER.indexOf(stage)
    const effectiveIdx = STAGE_ORDER.indexOf(pick.wildcard_effective_from!)
    // Before effective round → use old teams; at or after → use new teams
    if (stageIdx < effectiveIdx) {
      return [
        pick.wildcard_old_team1!,
        pick.wildcard_old_team2!,
        pick.wildcard_old_team3!,
        pick.wildcard_old_team4!,
        pick.wildcard_old_team5!,
      ]
    }
    return [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]
  }

  let total = 0

  for (const stage of STAGE_ORDER) {
    const stageMatches = finishedMatches.filter(m => m.stage === stage)
    if (stageMatches.length === 0) continue

    const teams = teamsForStage(stage)

    for (const teamName of teams) {
      const team = getTeam(teamName)
      if (!team) continue
      const scoring = SCORING[team.tier]

      const teamMatches = stageMatches.filter(
        m => m.home_team === teamName || m.away_team === teamName
      )
      if (teamMatches.length === 0) continue

      for (const match of teamMatches) {
        const isHome = match.home_team === teamName
        const goalsFor = isHome ? match.home_score : match.away_score
        const goalsAgainst = isHome ? match.away_score : match.home_score

        if (goalsFor > goalsAgainst) total += scoring.win
        else if (goalsFor === goalsAgainst) total += scoring.draw
        else total += scoring.loss

        total += goalsFor * scoring.goalFor
        total += goalsAgainst * scoring.goalAgainst
      }

      // Advancement bonus once per KO stage reached
      if (stage !== 'GROUP_STAGE') {
        if (stage === 'FINAL') {
          const finalMatch = teamMatches[0]
          const isHome = finalMatch.home_team === teamName
          const gf = isHome ? finalMatch.home_score : finalMatch.away_score
          const ga = isHome ? finalMatch.away_score : finalMatch.home_score
          if (gf > ga) total += scoring.champion
        }
        total += scoring.advanceRound
      }
    }
  }

  return total
}
