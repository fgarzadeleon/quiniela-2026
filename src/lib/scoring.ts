import { Match, Pick } from '@/types'
import { getTeam, SCORING, STAGE_ORDER } from './teams'

export function calculatePickPoints(pick: Pick, matches: Match[]): number {
  const teamNames = [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]
  let total = 0

  for (const teamName of teamNames) {
    const team = getTeam(teamName)
    if (!team) continue
    const scoring = SCORING[team.tier]

    const teamMatches = matches.filter(
      m =>
        (m.home_team === teamName || m.away_team === teamName) &&
        m.status === 'FINISHED'
    )

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

    // Round advancement bonuses — one bonus per knockout stage the team reached
    const stages = teamMatches.map(m => m.stage)
    const uniqueStages = new Set(stages)

    // Award advancement bonus once per stage beyond group (each KO round)
    for (const stage of STAGE_ORDER.slice(1)) {
      if (uniqueStages.has(stage as Match['stage'])) {
        // Champion bonus applies only in FINAL if team won
        if (stage === 'FINAL') {
          const finalMatch = teamMatches.find(m => m.stage === 'FINAL' && m.status === 'FINISHED')
          if (finalMatch) {
            const isHome = finalMatch.home_team === teamName
            const goalsFor = isHome ? finalMatch.home_score : finalMatch.away_score
            const goalsAgainst = isHome ? finalMatch.away_score : finalMatch.home_score
            if (goalsFor > goalsAgainst) total += scoring.champion
          }
        }
        total += scoring.advanceRound
      }
    }
  }

  return total
}
