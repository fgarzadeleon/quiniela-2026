import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculatePickPoints } from '@/lib/scoring'
import { FD_TO_OURS, getTeam } from '@/lib/teams'
import { Match, Pick } from '@/types'

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

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
const SCOREABLE_STATUSES = new Set([...LIVE_STATUSES, 'FINISHED'])

interface FdMatch {
  status: string
  homeTeam: { name: string }
  awayTeam: { name: string }
  stage: string
  utcDate: string
  score: { fullTime: { home: number | null; away: number | null }; duration?: string; penalties?: { home: number; away: number }; winner?: string | null }
  group?: string
}

async function fetchAll(): Promise<{ matches: Match[]; finalHome: string | null; finalAway: string | null }> {
  if (!FD_KEY) return { matches: [], finalHome: null, finalAway: null }
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 30 },
    })
    if (!res.ok) return { matches: [], finalHome: null, finalAway: null }
    const { matches = [] } = await res.json() as { matches: FdMatch[] }

    let finalHome: string | null = null
    let finalAway: string | null = null
    const result: Match[] = []

    for (const m of matches) {
      const homeTeam = m.homeTeam
      const awayTeam = m.awayTeam
      const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
      const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
      if (!home || !away) continue

      if (m.stage === 'FINAL') { finalHome = home; finalAway = away }

      const fdStatus = m.status
      if (!SCOREABLE_STATUSES.has(fdStatus)) continue
      const score = m.score
      const duration = score?.duration
      const isPSO = duration === 'PENALTY_SHOOTOUT'
      const homeScore = isPSO ? (score?.fullTime?.home ?? 0) - (score?.penalties?.home ?? 0) : score?.fullTime?.home
      const awayScore = isPSO ? (score?.fullTime?.away ?? 0) - (score?.penalties?.away ?? 0) : score?.fullTime?.away
      const winner = score?.winner ?? null
      const stage = STAGE_MAP[m.stage]
      if (homeScore == null || awayScore == null || !stage) continue

      result.push({
        id: '',
        home_team: home,
        away_team: away,
        home_score: homeScore,
        away_score: awayScore,
        status: LIVE_STATUSES.has(fdStatus) ? 'IN_PLAY' : 'FINISHED',
        match_date: m.utcDate,
        stage,
        group_name: m.group?.replace('GROUP_', ''),
        winner,
      } as Match)
    }
    return { matches: result, finalHome, finalAway }
  } catch { return { matches: [], finalHome: null, finalAway: null } }
}

const HOST_KEYS = ['dirtiest', 'best', 'worst', 'most_goals_for', 'most_goals_against']

export async function GET() {
  const supabase = createServerClient()
  const [{ data: rawPicks }, { matches, finalHome, finalAway }, { data: hostPreds }, { data: hostAnswers }] = await Promise.all([
    supabase.from('picks').select('*'),
    fetchAll(),
    supabase.from('host_predictions').select('pick_id, dirtiest, best, worst, most_goals_for, most_goals_against'),
    supabase.from('host_answers').select('key, value'),
  ])

  if (!finalHome || !finalAway) {
    return NextResponse.json({ available: false })
  }

  const picks = ((rawPicks ?? []) as Pick[]).filter(p => !p.name.toLowerCase().startsWith('test'))
  const alreadyPlayed = matches.some(m => m.stage === 'FINAL')

  // Host-challenge bonus is fixed regardless of the final's result — fold it in
  // so the predicted ranking matches /api/ranking's total_points ordering.
  type AnswerRow = { key: string; value: string | null }
  type PredRow = { pick_id: string } & Record<string, string>
  const answers = Object.fromEntries((hostAnswers ?? [] as AnswerRow[]).map((a: AnswerRow) => [a.key, a.value]))
  const predMap = Object.fromEntries((hostPreds ?? [] as PredRow[]).map((p: PredRow) => [p.pick_id, p]))
  const hostBonusByPick = new Map<string, number>(
    picks.map(p => {
      const pred = predMap[p.id] as PredRow | undefined
      const bonus = pred ? HOST_KEYS.reduce((sum, k) => sum + (answers[k] && pred[k] === answers[k] ? 100 : 0), 0) : 0
      return [p.id, bonus]
    })
  )

  const homeTeam = getTeam(finalHome)
  const awayTeam = getTeam(finalAway)

  // Both finalists are the same tier, so the exact scoreline never changes who ends up where —
  // only the result (win/draw/loss) does. A representative scoreline per outcome is enough.
  function topFourFor(homeScore: number, awayScore: number, winner: 'HOME_TEAM' | 'AWAY_TEAM' | null): string[] {
    const finalMatch: Match = {
      id: 'hypothetical-final',
      home_team: finalHome!,
      away_team: finalAway!,
      home_score: homeScore,
      away_score: awayScore,
      status: 'FINISHED',
      match_date: new Date().toISOString(),
      stage: 'FINAL',
      winner: winner ?? (homeScore > awayScore ? 'HOME_TEAM' : homeScore < awayScore ? 'AWAY_TEAM' : null),
    }
    const withFinal = [...matches, finalMatch]
    const totals = picks
      .map(p => ({ name: p.name, total: calculatePickPoints(p, withFinal) + (hostBonusByPick.get(p.id) ?? 0) }))
      .sort((a, b) => b.total - a.total)
    return totals.slice(0, 4).map(t => t.name)
  }

  const outcomes = {
    homeWin: topFourFor(1, 0, null),
    drawHomePens: topFourFor(0, 0, 'HOME_TEAM'),
    drawAwayPens: topFourFor(0, 0, 'AWAY_TEAM'),
    awayWin: topFourFor(0, 1, null),
  }

  return NextResponse.json({
    available: true,
    alreadyPlayed,
    home: { name: finalHome, code: homeTeam?.code ?? '' },
    away: { name: finalAway, code: awayTeam?.code ?? '' },
    outcomes,
  })
}
