import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculatePickPoints } from '@/lib/scoring'
import { Match, Pick } from '@/types'

export const dynamic = 'force-dynamic'

const DEADLINE = new Date('2026-06-11T19:00:00Z')
const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

const FD_TO_OURS: Record<string, string> = {
  'United States':      'USA',
  'Korea Republic':     'South Korea',
  "Côte d'Ivoire":      'Ivory Coast',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Czechia':            'Czech Republic',
  'Congo DR':           'DR Congo',
}

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

async function fetchFinishedMatches(): Promise<Match[]> {
  if (!FD_KEY) return []
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches?status=FINISHED`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const { matches = [] } = await res.json()
    return (matches as Record<string, unknown>[])
      .map(m => {
        const homeTeam = m.homeTeam as Record<string, string>
        const awayTeam = m.awayTeam as Record<string, string>
        const score = m.score as Record<string, Record<string, number | null>>
        const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
        const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
        const homeScore = score?.fullTime?.home
        const awayScore = score?.fullTime?.away
        const stage = STAGE_MAP[m.stage as string]
        if (!home || !away || homeScore == null || awayScore == null || !stage) return null
        return {
          id: String(m.id),
          home_team: home,
          away_team: away,
          home_score: homeScore,
          away_score: awayScore,
          status: 'FINISHED' as Match['status'],
          match_date: m.utcDate as string,
          stage,
          group_name: (m.group as string | undefined)?.replace('GROUP_', ''),
        } as Match
      })
      .filter((m): m is Match => m !== null)
  } catch {
    return []
  }
}

export async function GET() {
  const supabase = createServerClient()
  const tournamentStarted = new Date() >= DEADLINE

  const [
    { data: picks, error: pe },
    matches,
    { data: hostPreds },
    { data: hostAnswers },
  ] = await Promise.all([
    supabase.from('picks').select('*'),
    fetchFinishedMatches(),
    supabase.from('host_predictions').select('pick_id, dirtiest, best, worst, most_goals_for, most_goals_against'),
    supabase.from('host_answers').select('key, value'),
  ])

  if (pe) {
    return NextResponse.json({ error: pe.message }, { status: 500 })
  }

  const KEYS = ['dirtiest', 'best', 'worst', 'most_goals_for', 'most_goals_against']
  type AnswerRow = { key: string; value: string | null }
  type PredRow = { pick_id: string } & Record<string, string>
  const answers = Object.fromEntries((hostAnswers ?? [] as AnswerRow[]).map((a: AnswerRow) => [a.key, a.value]))
  const predMap = Object.fromEntries((hostPreds ?? [] as PredRow[]).map((p: PredRow) => [p.pick_id, p]))

  const ranked = (picks as Pick[])
    .filter(p => !p.name.toLowerCase().startsWith('test'))
    .map(p => {
      const pred = predMap[p.id] as PredRow | undefined
      const host_bonus = pred
        ? KEYS.reduce((sum, k) => sum + (answers[k] && pred[k] === answers[k] ? 100 : 0), 0)
        : 0
      return {
        ...p,
        host_bonus,
        total_points: calculatePickPoints(p, matches) + host_bonus,
        ...(!tournamentStarted && {
          team1: null, team2: null, team3: null, team4: null, team5: null,
          scorer1: null, scorer2: null, scorer3: null,
        }),
      }
    })
    .sort((a, b) => b.total_points - a.total_points)
    .map((p, i) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, email, ...safe } = p
      return { ...safe, rank: i + 1 }
    })

  return NextResponse.json({ ranked, tournamentStarted })
}
