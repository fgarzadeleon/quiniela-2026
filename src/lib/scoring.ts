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
  // Last wildcard window: submissions stay open until the Final kickoff (not the 3rd place
  // kickoff — players shouldn't be locked out early). Anyone wildcarding after the 3rd place
  // match has already been played forfeits that match's points and goalscorer goals — see
  // THIRD_PLACE_FORFEIT_CUTOFF below, checked against wildcard_used_at at scoring time.
  { label: 'Final',                   deadline: new Date('2026-07-19T19:00:00Z'), stage: 'FINAL',        effectiveStage: 'THIRD_PLACE'     },
]

// Kickoff of the 3rd place match — the actual forfeiture cutoff. Anyone whose wildcard_used_at
// is after this already knew the 3rd place result before swapping, so neither their old nor
// new team gets credit for that match (see the forfeit check in computePoints below).
export const THIRD_PLACE_FORFEIT_CUTOFF = new Date('2026-07-18T21:00:00Z')

// Picks that wildcarded through this deadline before the THIRD_PLACE fix shipped had
// 'FINAL' written to wildcard_effective_from instead of 'THIRD_PLACE'. Since one deadline
// covers both the 3rd place match and the Final, the two values mean the same thing —
// normalize here so old records behave identically to new ones without a DB migration.
export function normalizeEffectiveStage<T extends string>(stage: T): T | 'THIRD_PLACE' {
  return stage === 'FINAL' ? 'THIRD_PLACE' : stage
}

// When a wildcarded pick's new teams/scorers should stop being hidden as "pending" and start
// showing for real. For every other window this is simply the matching deadline (submission
// cutoff and stage kickoff were the same moment). But the last window decouples them — you
// can still submit up until the Final kickoff, while THIRD_PLACE's own kickoff (and its
// result) is already in the past — so picks effective from THIRD_PLACE should reveal at that
// earlier moment, not wait for the unrelated Final submission deadline.
export function revealMoment(effectiveStage: string): Date {
  if (normalizeEffectiveStage(effectiveStage) === 'THIRD_PLACE') return THIRD_PLACE_FORFEIT_CUTOFF
  return WILDCARD_DEADLINES.find(d => d.effectiveStage === effectiveStage)?.deadline ?? new Date(8640000000000000)
}

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

// Compute which teams have confirmed qualification from the group stage.
// Returns a map of teamName → date of their last group match (the "earned" date).
//
// Early confirmation: 6pts from 2+ games = mathematically guaranteed top 2 in a
// 4-team group (at most one other team can also reach 6pts alongside them).
// This ensures wildcarded players get the bonus at the right scoring split.
export function computeGroupQualifiers(groupMatches: Match[]): Map<string, Date> {
  const groups = new Map<string, Map<string, { pts: number; gd: number; gf: number; played: number; lastDate: Date; earlyQualDate?: Date }>>()

  // Process in chronological order so earlyQualDate is the actual match that clinched early qualification
  const sortedMatches = [...groupMatches].sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())

  for (const m of sortedMatches) {
    const g = m.group_name
    if (!g) continue
    if (!groups.has(g)) groups.set(g, new Map())
    const gMap = groups.get(g)!
    const matchDate = new Date(m.match_date)

    for (const [team, gf, ga] of [
      [m.home_team, m.home_score, m.away_score],
      [m.away_team, m.away_score, m.home_score],
    ] as [string, number, number][]) {
      if (!gMap.has(team)) gMap.set(team, { pts: 0, gd: 0, gf: 0, played: 0, lastDate: new Date(0) })
      const s = gMap.get(team)!
      s.pts    += gf > ga ? 3 : gf === ga ? 1 : 0
      s.gd     += gf - ga
      s.gf     += gf
      s.played += 1
      if (matchDate > s.lastDate) s.lastDate = matchDate
      // Record the first match that clinches early confirmation (6pts, 2+ games).
      // Used to correctly attribute group advance bonus across wildcard splits.
      if (s.pts >= 6 && s.played >= 2 && !s.earlyQualDate) s.earlyQualDate = matchDate
    }
  }

  const qualifiers = new Map<string, Date>()
  const thirdPlace: Array<{ team: string; pts: number; gd: number; gf: number; lastDate: Date }> = []
  let allComplete = true

  for (const [, gMap] of groups) {
    const matchCount = groupMatches.filter(m => {
      const teams = [m.home_team, m.away_team]
      return [...gMap.keys()].some(t => teams.includes(t))
    }).length

    const isComplete = matchCount >= 6 // 4-team group = 6 matches

    const standings = [...gMap.entries()]
      .map(([team, s]) => ({ team, ...s }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)

    if (isComplete) {
      // Full group done — top 2 confirmed, collect 3rd for best-of-12 calculation.
      // Use earlyQualDate (date they first hit 6pts) if available — this correctly places
      // group-stage wildcard advance bonuses on whichever side of the split the team qualified.
      const qualDate = (s: { lastDate: Date; earlyQualDate?: Date }) => s.earlyQualDate ?? s.lastDate
      qualifiers.set(standings[0].team, qualDate(standings[0]))
      qualifiers.set(standings[1].team, qualDate(standings[1]))
      thirdPlace.push(standings[2])
    } else {
      allComplete = false
      // Early confirmation: 6pts from 2+ games guarantees top 2 in a 4-team group
      // (only one other team can mathematically also reach 6pts alongside them)
      for (const s of standings) {
        if (s.pts === 6 && s.played >= 2 && !qualifiers.has(s.team)) {
          qualifiers.set(s.team, s.lastDate)
        }
      }
    }
  }

  // Best 8 third-place teams qualify.
  // Full determination requires all 12 groups complete.
  // Early guarantee: a team ranked N among complete-group 3rd-place teams is
  // mathematically confirmed if N ≤ (8 - remaining_groups_count), because
  // at most that many new 3rd-place teams can join above them.
  const remainingGroups = 12 - thirdPlace.length
  const guaranteedSpots = Math.max(0, 8 - remainingGroups)

  const sortedThird = [...thirdPlace].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)

  if (allComplete) {
    // All groups done — award all 8
    sortedThird.slice(0, 8).forEach(t => qualifiers.set(t.team, t.lastDate))
  } else if (guaranteedSpots > 0) {
    // Partial — award only mathematically confirmed spots
    sortedThird.slice(0, guaranteedSpots).forEach(t => qualifiers.set(t.team, t.lastDate))
  }

  return qualifiers
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
    const resultPts = gf > ga ? scoring.win : gf === ga ? scoring.draw : scoring.loss
    // 3rd place match is a consolation game: win/draw/loss counts for half, goals stay full value
    pts += m.stage === 'THIRD_PLACE' ? resultPts / 2 : resultPts
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
    const effectiveIdx = STAGE_ORDER.indexOf(normalizeEffectiveStage(pick.wildcard_effective_from!))
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

  // Group stage advancement bonus is computed from standings, not from R32 fixture availability.
  // This ensures the bonus is attributed to the correct scoring period for wildcard splits.
  const groupQualifiers = computeGroupQualifiers(finishedMatches.filter(m => m.stage === 'GROUP_STAGE'))

  function addGroupAdvancementBonus(teamName: string, targetMap: Map<string, number> | null) {
    if (!groupQualifiers.has(teamName)) return 0
    const team = getTeam(teamName)
    if (!team) return 0
    const bonus = SCORING[team.tier].advanceRound
    total += bonus
    if (targetMap?.has(teamName)) targetMap.set(teamName, (targetMap.get(teamName) ?? 0) + bonus)
    return bonus
  }

  let total = 0

  // Wildcarding after the 3rd place match was already played means the result was known —
  // forfeit that match's points entirely (neither old nor new team earns from it) so nobody
  // can wildcard into a team that already won it, or drop one that already lost it.
  const forfeitsThirdPlace = !!(
    hasWildcardData && pick.wildcard_used_at && new Date(pick.wildcard_used_at) > THIRD_PLACE_FORFEIT_CUTOFF
  )

  for (const stage of STAGE_ORDER) {
    const stageMatches = finishedMatches.filter(m => m.stage === stage)
    if (stageMatches.length === 0) continue
    if (stage === 'THIRD_PLACE' && forfeitsThirdPlace) continue

    // Group-stage wildcard: score each match against whichever teams were active at that time
    if (stage === 'GROUP_STAGE' && isGroupStageWildcard && wcSplitDate) {
      const preWc  = stageMatches.filter(m => new Date(m.match_date) <  wcSplitDate)
      const postWc = stageMatches.filter(m => new Date(m.match_date) >= wcSplitDate)
      const oldTeams = [pick.wildcard_old_team1!, pick.wildcard_old_team2!, pick.wildcard_old_team3!, pick.wildcard_old_team4!, pick.wildcard_old_team5!]
      const newTeams = [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]

      for (const teamName of oldTeams) {
        const pts = scoreTeamMatches(teamName, preWc.filter(m => m.home_team === teamName || m.away_team === teamName))
        total += pts
        const targetMap = byOldTeam.has(teamName) ? byOldTeam : byTeam.has(teamName) ? byTeam : null
        if (targetMap?.has(teamName)) targetMap.set(teamName, (targetMap.get(teamName) ?? 0) + pts)

        // Group advancement bonus for old team: only if their qualification date is before the split
        const qualDate = groupQualifiers.get(teamName)
        if (qualDate && qualDate < wcSplitDate) addGroupAdvancementBonus(teamName, targetMap)
      }
      for (const teamName of newTeams) {
        const pts = scoreTeamMatches(teamName, postWc.filter(m => m.home_team === teamName || m.away_team === teamName))
        total += pts
        if (byTeam.has(teamName)) byTeam.set(teamName, (byTeam.get(teamName) ?? 0) + pts)

        // Group advancement bonus for new team: only if their qualification date is on/after the split
        const qualDate = groupQualifiers.get(teamName)
        if (qualDate && qualDate >= wcSplitDate) addGroupAdvancementBonus(teamName, byTeam)
      }
      continue
    }

    const teams = teamsForStage(stage)
    const usingOldTeams = hasWildcardData && !isGroupStageWildcard &&
      STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf(normalizeEffectiveStage(pick.wildcard_effective_from!))

    for (const teamName of teams) {
      const team = getTeam(teamName)
      if (!team) continue
      const scoring = SCORING[team.tier]

      const teamMatches = stageMatches.filter(m => m.home_team === teamName || m.away_team === teamName)
      if (teamMatches.length === 0) continue

      let pts = scoreTeamMatches(teamName, teamMatches)

      if (stage !== 'GROUP_STAGE' && stage !== 'THIRD_PLACE') {
        // Advance for WINNING this knockout round, credited immediately in this stage's column.
        // Each KO round won earns exactly one advance — no deferred/arrival mechanism.
        // This ensures QF advance goes only to QF winners, not to both QF teams.
        // 3rd place match is a consolation game, not an advancement — no bonus either way.
        const wonStage = teamMatches.some(m => {
          const isHome = m.home_team === teamName
          const gf = isHome ? m.home_score : m.away_score
          const ga = isHome ? m.away_score : m.home_score
          return gf > ga || (gf === ga && m.winner === (isHome ? 'HOME_TEAM' : 'AWAY_TEAM'))
        })
        if (stage === 'FINAL') {
          if (wonStage) pts += scoring.champion
        } else if (wonStage) {
          pts += scoring.advanceRound
        }
      }

      total += pts
      // Swapped-out old teams go to byOldTeam; kept teams and current teams go to byTeam.
      if (usingOldTeams && byOldTeam.has(teamName)) {
        byOldTeam.set(teamName, (byOldTeam.get(teamName) ?? 0) + pts)
      } else if (byTeam.has(teamName)) {
        byTeam.set(teamName, (byTeam.get(teamName) ?? 0) + pts)
      }
    }

    // For non-wildcard or post-wildcard GROUP_STAGE: add group advancement bonus per qualified team
    if (stage === 'GROUP_STAGE' && !isGroupStageWildcard) {
      for (const teamName of teams) {
        if (!groupQualifiers.has(teamName)) continue
        // Swapped-out old teams → byOldTeam; kept/current teams → byTeam
        const targetMap = (usingOldTeams && byOldTeam.has(teamName)) ? byOldTeam : byTeam
        addGroupAdvancementBonus(teamName, targetMap)
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
