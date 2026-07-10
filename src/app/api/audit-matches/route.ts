import { NextResponse } from 'next/server'
import { getTeam, FD_TO_OURS, STAGE_ORDER } from '@/lib/teams'
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
}

export interface TeamAuditRow {
  name: string
  code: string
  tier: string
  cost: number
  group: string | null
  results: TeamMatchResult[]
  group_qualified: boolean
  early_qual_date: string | null
  advance_rounds: number
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

    const processed: Match[] = []
    const matchdayMap = new Map<string, number>() // match id → matchday

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

      const id = String(m.id)
      if (m.matchday != null) matchdayMap.set(id, m.matchday as number)

      const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
      processed.push({
        id,
        home_team: home,
        away_team: away,
        home_score: homeScore,
        away_score: awayScore,
        status: LIVE.has(fdStatus) ? 'IN_PLAY' : 'FINISHED',
        match_date: m.utcDate as string,
        stage,
        group_name: (m.group as string | undefined)?.replace('GROUP_', ''),
        winner,
      } as Match)
    }

    const groupQualifiers = computeGroupQualifiers(processed.filter(m => m.stage === 'GROUP_STAGE'))

    // Build per-team results
    const teamData = new Map<string, TeamAuditRow>()

    for (const m of processed) {
      for (const [teamName, isHome] of [[m.home_team, true], [m.away_team, false]] as [string, boolean][]) {
        const team = getTeam(teamName)
        if (!team) continue

        if (!teamData.has(teamName)) {
          teamData.set(teamName, {
            name: teamName,
            code: team.code,
            tier: team.tier,
            cost: team.cost,
            group: m.stage === 'GROUP_STAGE' ? (m.group_name ?? null) : null,
            results: [],
            group_qualified: false,
            early_qual_date: null,
            advance_rounds: 0,
          })
        }
        const row = teamData.get(teamName)!
        if (!row.group && m.stage === 'GROUP_STAGE' && m.group_name) row.group = m.group_name

        const gf = isHome ? m.home_score : m.away_score
        const ga = isHome ? m.away_score : m.home_score
        const result: 'W' | 'D' | 'L' =
          gf > ga ? 'W' :
          gf < ga ? 'L' :
          (m.winner === (isHome ? 'HOME_TEAM' : 'AWAY_TEAM') ? 'W' : 'D')

        row.results.push({
          stage: m.stage,
          matchday: m.stage === 'GROUP_STAGE' ? (matchdayMap.get(m.id) ?? null) : null,
          opponent: isHome ? m.away_team : m.home_team,
          gf,
          ga,
          result,
          date: m.match_date,
          winner: m.winner ?? null,
        })
      }
    }

    // Annotate group qualification and count advance rounds
    for (const [teamName, row] of teamData) {
      const qualDate = groupQualifiers.get(teamName)
      row.group_qualified = !!qualDate
      row.early_qual_date = qualDate ? qualDate.toISOString() : null

      // Count advance rounds: group qualify + each knockout stage they appeared in
      let ar = 0
      if (qualDate) ar++ // group stage advance
      for (const stage of STAGE_ORDER) {
        if (stage === 'GROUP_STAGE') continue
        if (row.results.some(r => r.stage === stage)) ar++
      }
      row.advance_rounds = ar

      // Sort results chronologically
      row.results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }

    // Sort teams: by group then name, then by advance rounds desc
    const teams = [...teamData.values()].sort((a, b) => {
      if (a.group && b.group && a.group !== b.group) return a.group.localeCompare(b.group)
      return b.advance_rounds - a.advance_rounds || a.name.localeCompare(b.name)
    })

    return NextResponse.json({ teams })
  } catch (e) {
    console.error('audit-matches error', e)
    return NextResponse.json({ teams: [] })
  }
}
