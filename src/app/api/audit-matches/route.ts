import { NextResponse } from 'next/server'
import { getTeam, FD_TO_OURS, SCORING, STAGE_ORDER } from '@/lib/teams'
import { computeGroupQualifiers } from '@/lib/scoring'
import { createServerClient } from '@/lib/supabase'
import { AUDIT_STAGE_KEYS, activeTeamsForPick } from '@/lib/audit'
import { Match, Pick } from '@/types'

export { AUDIT_STAGE_KEYS, activeTeamsForPick }
export type { AuditStageKey } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

const STAGE_MAP: Record<string, Match['stage']> = {
  GROUP_STAGE:    'GROUP_STAGE',
  LAST_32:        'ROUND_OF_32',
  ROUND_OF_32:    'ROUND_OF_32',
  LAST_16:        'ROUND_OF_16',
  ROUND_OF_16:    'ROUND_OF_16',
  QUARTER_FINALS: 'QUARTER_FINALS',
  SEMI_FINALS:    'SEMI_FINALS',
  THIRD_PLACE:    'THIRD_PLACE',
  FINAL:          'FINAL',
}

export interface TeamMatchResult {
  stage: string
  matchday: number | null
  opponent: string
  gf: number
  ga: number
  result: 'W' | 'D' | 'L'
  date: string
  winner: string | null
  match_pts: number   // win/draw/loss + goals, no advance bonus
}

export interface StagePts {
  match_pts: number
  advance_pts: number
  total: number
}

export interface TeamAuditRow {
  name: string
  code: string
  tier: string
  cost: number
  group: string | null
  results: TeamMatchResult[]
  stage_pts: Record<string, StagePts>   // keyed by GS_MD1/GS_MD2/GS_MD3/ROUND_OF_32/…
  group_qualified: boolean
  early_qual_date: string | null
  advance_rounds: number
  total_pts: number
  picks_count: number                        // players who currently hold this team
  player_attribution: Record<string, string[]>  // stageKey → player names earning those pts
}

function matchPts(teamName: string, stage: string, gf: number, ga: number): number {
  const team = getTeam(teamName)
  if (!team) return 0
  const s = SCORING[team.tier]
  const base = gf > ga ? s.win : gf < ga ? s.loss : s.draw
  // 3rd place match: win/draw/loss counts for half, goals stay full value
  const resultPts = stage === 'THIRD_PLACE' ? base / 2 : base
  return resultPts + gf * s.goalFor + ga * s.goalAgainst
}

export async function GET() {
  if (!FD_KEY) return NextResponse.json({ teams: [] })
  try {
    const supabase = createServerClient()
    const [fdRes, { data: rawPicks }] = await Promise.all([
      fetch(`${FD_BASE}/competitions/WC/matches`, {
        headers: { 'X-Auth-Token': FD_KEY },
        next: { revalidate: 60 },
      }).then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] })),
      supabase.from('picks').select('*'),
    ])
    const { matches: fdMatches = [] } = fdRes as { matches: Record<string, unknown>[] }

    const picks = ((rawPicks ?? []) as Pick[])
      .filter(p => !p.name.toLowerCase().startsWith('test'))

    const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
    const processed: (Match & { matchday?: number | null })[] = []

    for (const m of fdMatches) {
      const fdStatus = m.status as string
      if (fdStatus === 'TIMED' || fdStatus === 'SCHEDULED' || fdStatus === 'POSTPONED') continue
      const homeTeam = m.homeTeam as Record<string, string>
      const awayTeam = m.awayTeam as Record<string, string>
      const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
      const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
      if (!home || !away) continue
      const score = m.score as Record<string, Record<string, number | null>>
      const duration = (m.score as Record<string, unknown>)?.duration as string | undefined
      const isPSO = duration === 'PENALTY_SHOOTOUT'
      const homeScore = isPSO ? (score?.fullTime?.home ?? 0) - (score?.penalties?.home ?? 0) : score?.fullTime?.home
      const awayScore = isPSO ? (score?.fullTime?.away ?? 0) - (score?.penalties?.away ?? 0) : score?.fullTime?.away
      const winner = (m.score as Record<string, unknown>)?.winner as string | null
      const stage = STAGE_MAP[m.stage as string]
      if (homeScore == null || awayScore == null || !stage) continue

      processed.push({
        id: String(m.id),
        home_team: home,
        away_team: away,
        home_score: homeScore,
        away_score: awayScore,
        status: LIVE.has(fdStatus) ? 'IN_PLAY' : 'FINISHED',
        match_date: m.utcDate as string,
        stage,
        group_name: (m.group as string | undefined)?.replace('GROUP_', ''),
        winner,
        matchday: m.matchday as number | null ?? null,
      } as Match & { matchday?: number | null })
    }

    const groupMatches = processed.filter(m => m.stage === 'GROUP_STAGE')
    const groupQualifiers = computeGroupQualifiers(groupMatches)

    const teamData = new Map<string, TeamAuditRow>()

    function getOrCreate(teamName: string, groupName?: string | null): TeamAuditRow | null {
      const team = getTeam(teamName)
      if (!team) return null
      if (!teamData.has(teamName)) {
        teamData.set(teamName, {
          name: teamName, code: team.code, tier: team.tier, cost: team.cost,
          group: groupName ?? null,
          results: [], stage_pts: {},
          group_qualified: false, early_qual_date: null,
          advance_rounds: 0, total_pts: 0,
          picks_count: 0, player_attribution: {},
        })
      }
      const row = teamData.get(teamName)!
      if (!row.group && groupName) row.group = groupName
      return row
    }

    for (const m of processed) {
      for (const [teamName, isHome] of [[m.home_team, true], [m.away_team, false]] as [string, boolean][]) {
        const row = getOrCreate(teamName, m.group_name)
        if (!row) continue

        const gf = isHome ? m.home_score : m.away_score
        const ga = isHome ? m.away_score : m.home_score
        const wonMatch =
          gf > ga ? true : gf < ga ? false :
          (m.winner === (isHome ? 'HOME_TEAM' : 'AWAY_TEAM'))
        const result: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : (wonMatch ? 'W' : 'D')
        const mPts = matchPts(teamName, m.stage, gf, ga)

        const md = (m as { matchday?: number | null }).matchday
        const stageKey = m.stage === 'GROUP_STAGE' ? `GS_MD${md ?? '?'}` : m.stage

        row.results.push({
          stage: m.stage,
          matchday: m.stage === 'GROUP_STAGE' ? (md ?? null) : null,
          opponent: isHome ? m.away_team : m.home_team,
          gf, ga, result, date: m.match_date, winner: m.winner ?? null,
          match_pts: mPts,
        })

        if (!row.stage_pts[stageKey]) row.stage_pts[stageKey] = { match_pts: 0, advance_pts: 0, total: 0 }
        row.stage_pts[stageKey].match_pts += mPts
        row.stage_pts[stageKey].total += mPts
      }
    }

    // Compute advance round bonuses — mirrors computeTeamTable logic exactly
    for (const [teamName, row] of teamData) {
      const team = getTeam(teamName)
      if (!team) continue
      const scoring = SCORING[team.tier]

      function addAdvance(stageKey: string, amt: number) {
        if (!row.stage_pts[stageKey]) row.stage_pts[stageKey] = { match_pts: 0, advance_pts: 0, total: 0 }
        row.stage_pts[stageKey].advance_pts += amt
        row.stage_pts[stageKey].total += amt
        row.advance_rounds++
        row.total_pts += amt
      }

      // Group advance — place bonus in the matchday column where it was earned
      const qualDate = groupQualifiers.get(teamName)
      row.group_qualified = !!qualDate
      row.early_qual_date = qualDate ? qualDate.toISOString() : null
      if (qualDate) {
        const qualMs = qualDate.getTime()
        const qualResult = row.results
          .filter(r => r.stage === 'GROUP_STAGE' && r.matchday != null)
          .find(r => Math.abs(new Date(r.date).getTime() - qualMs) < 60_000)
        const groupAdvKey = qualResult ? `GS_MD${qualResult.matchday}` : 'GS_MD3'
        addAdvance(groupAdvKey, scoring.advanceRound)
      }

      // Re-sum total_pts from all stage match pts + group advance, then add KO advances below
      row.total_pts = 0
      for (const sp of Object.values(row.stage_pts)) {
        row.total_pts += sp.match_pts + sp.advance_pts
      }
      row.advance_rounds = qualDate ? 1 : 0

      for (const stage of STAGE_ORDER) {
        if (stage === 'GROUP_STAGE') continue
        const stageMatches = processed.filter(m => m.stage === stage && (m.home_team === teamName || m.away_team === teamName))
        if (stageMatches.length === 0) continue

        // Advance for WINNING this stage (points go in the round where earned)
        // 3rd place match is a consolation game, not an advancement — no bonus either way.
        if (stage !== 'FINAL' && stage !== 'THIRD_PLACE') {
          const wonStage = stageMatches.some(m => {
            const isHome = m.home_team === teamName
            const gf = isHome ? m.home_score : m.away_score
            const ga = isHome ? m.away_score : m.home_score
            return gf > ga || (gf === ga && m.winner === (isHome ? 'HOME_TEAM' : 'AWAY_TEAM'))
          })
          if (wonStage) addAdvance(stage, scoring.advanceRound)
        }

        if (stage === 'FINAL') {
          const finalMatch = stageMatches[0]
          const isHome = finalMatch.home_team === teamName
          const gf = isHome ? finalMatch.home_score : finalMatch.away_score
          const ga = isHome ? finalMatch.away_score : finalMatch.home_score
          const wonFinal = gf > ga || (gf === ga && finalMatch.winner === (isHome ? 'HOME_TEAM' : 'AWAY_TEAM'))
          if (wonFinal) {
            if (!row.stage_pts['FINAL']) row.stage_pts['FINAL'] = { match_pts: 0, advance_pts: 0, total: 0 }
            row.stage_pts['FINAL'].advance_pts += scoring.champion
            row.stage_pts['FINAL'].total += scoring.champion
            row.total_pts += scoring.champion
          }
        }
      }

      row.results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }

    // --- Player attribution ---
    // For each team and each stage key: which players earn that team's points at that stage.
    // Uses activeTeamsForPick() which handles all wildcard splits correctly.
    for (const [teamName, row] of teamData) {
      for (const stageKey of AUDIT_STAGE_KEYS) {
        if (!row.stage_pts[stageKey]) continue
        const earners = picks
          .filter(p => activeTeamsForPick(p, stageKey).includes(teamName))
          .map(p => p.name)
        if (earners.length > 0) row.player_attribution[stageKey] = earners
      }
      // Current picks count = players who hold this team at the latest active stage
      const latestStageKey = [...AUDIT_STAGE_KEYS].reverse().find(sk => row.stage_pts[sk]) ?? null
      if (latestStageKey && row.player_attribution[latestStageKey]) {
        row.picks_count = row.player_attribution[latestStageKey].length
      } else {
        // Fall back: count who currently has this team in their team1-5
        row.picks_count = picks.filter(p =>
          [p.team1, p.team2, p.team3, p.team4, p.team5].includes(teamName)
        ).length
      }
    }

    const teams = [...teamData.values()].sort((a, b) => {
      if (a.group && b.group && a.group !== b.group) return a.group.localeCompare(b.group)
      return b.total_pts - a.total_pts || a.name.localeCompare(b.name)
    })

    return NextResponse.json({ teams })
  } catch (e) {
    console.error('audit-matches error', e)
    return NextResponse.json({ teams: [] })
  }
}
