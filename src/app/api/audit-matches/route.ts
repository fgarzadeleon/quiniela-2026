import { NextResponse } from 'next/server'
import { getTeam, FD_TO_OURS, SCORING, STAGE_ORDER } from '@/lib/teams'
import { computeGroupQualifiers } from '@/lib/scoring'
import { Match } from '@/types'

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
  stage_pts: Record<string, StagePts>   // keyed by stage+matchday e.g. "GS_MD1", "R32", "R16"…
  group_qualified: boolean
  early_qual_date: string | null
  advance_rounds: number
  total_pts: number
}

function matchPts(teamName: string, gf: number, ga: number): number {
  const team = getTeam(teamName)
  if (!team) return 0
  const s = SCORING[team.tier]
  const base = gf > ga ? s.win : gf < ga ? s.loss : s.draw
  return base + gf * s.goalFor + ga * s.goalAgainst
}

export async function GET() {
  if (!FD_KEY) return NextResponse.json({ teams: [] })
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 60 },
    })
    if (!res.ok) return NextResponse.json({ teams: [] })
    const { matches: fdMatches = [] } = await res.json()

    const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
    const processed: (Match & { matchday?: number | null })[] = []

    for (const m of fdMatches as Record<string, unknown>[]) {
      const fdStatus = m.status as string
      if (fdStatus === 'TIMED' || fdStatus === 'SCHEDULED' || fdStatus === 'POSTPONED') continue
      const homeTeam = m.homeTeam as Record<string, string>
      const awayTeam = m.awayTeam as Record<string, string>
      const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
      const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
      if (!home || !away) continue
      const score = m.score as Record<string, Record<string, number | null>>
      const homeScore = score?.extraTime?.home ?? score?.fullTime?.home
      const awayScore = score?.extraTime?.away ?? score?.fullTime?.away
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
        const mPts = matchPts(teamName, gf, ga)

        // Stage key for per-matchday breakdown
        const md = (m as { matchday?: number | null }).matchday
        const stageKey = m.stage === 'GROUP_STAGE'
          ? `GS_MD${md ?? '?'}`
          : m.stage

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

    // Now compute advance round bonuses using the same logic as computeTeamTable
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

      // Group advance
      const qualDate = groupQualifiers.get(teamName)
      row.group_qualified = !!qualDate
      row.early_qual_date = qualDate ? qualDate.toISOString() : null
      if (qualDate) addAdvance('GROUP_ADV', scoring.advanceRound)

      // Match points already in total_pts from stage_pts, add them now
      for (const sp of Object.values(row.stage_pts)) {
        row.total_pts += sp.match_pts
      }
      // Remove double-count (advance already added above in addAdvance)
      // Actually I need to initialize total_pts from match_pts correctly
      // Let me fix this: zero out total_pts and recompute
      row.total_pts = 0
      for (const sp of Object.values(row.stage_pts)) {
        row.total_pts += sp.match_pts + sp.advance_pts
      }
      // Reset advance_rounds for the knockout calculation below
      row.advance_rounds = qualDate ? 1 : 0

      // Knockout advance — mirrors computeTeamTable exactly
      const NEXT_STAGE: Partial<Record<string, Match['stage']>> = {
        ROUND_OF_32:    'ROUND_OF_16',
        ROUND_OF_16:    'QUARTER_FINALS',
        QUARTER_FINALS: 'SEMI_FINALS',
        SEMI_FINALS:    'FINAL',
      }

      for (const stage of STAGE_ORDER) {
        if (stage === 'GROUP_STAGE') continue
        const stageMatches = processed.filter(m => m.stage === stage && (m.home_team === teamName || m.away_team === teamName))
        if (stageMatches.length === 0) continue

        // Reaching R16+ = won previous round = +1 AR
        if (stage !== 'ROUND_OF_32') {
          addAdvance(stage, scoring.advanceRound)
        }

        // For R32/R16/QF/SF: check proactive advance for winning when next stage hasn't started
        if (stage === 'ROUND_OF_32' || stage === 'ROUND_OF_16' || stage === 'QUARTER_FINALS' || stage === 'SEMI_FINALS') {
          const nextStage = NEXT_STAGE[stage]!
          const hasNextStage = processed.some(m => m.stage === nextStage && (m.home_team === teamName || m.away_team === teamName))
          if (!hasNextStage) {
            const wonStage = stageMatches.some(m => {
              const isHome = m.home_team === teamName
              const gf = isHome ? m.home_score : m.away_score
              const ga = isHome ? m.away_score : m.home_score
              return gf > ga || (gf === ga && m.winner === (isHome ? 'HOME_TEAM' : 'AWAY_TEAM'))
            })
            if (wonStage) addAdvance(stage, scoring.advanceRound)
          }
        }

        // Champion bonus
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

      // Sort results chronologically
      row.results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }

    // Sort: by group (A-L) then total_pts desc
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
