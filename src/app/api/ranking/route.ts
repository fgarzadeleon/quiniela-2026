import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculatePickPoints, calculatePickPointsBreakdown } from '@/lib/scoring'
import { Match, Pick } from '@/types'

export const dynamic = 'force-dynamic'

const DEADLINE = new Date('2026-06-11T19:00:00Z')
const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

function norm(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Fuzzy match: exact normalized, last-name match, or FD name contains pick name
function lookupScorer(pickName: string, goalsMap: Map<string, number>): { goals: number; matched: boolean } {
  const pn = norm(pickName)
  if (goalsMap.has(pn)) return { goals: goalsMap.get(pn)!, matched: true }
  const pLast = pn.split(/\s+/).at(-1) ?? ''
  for (const [fdNorm, goals] of goalsMap) {
    const fdLast = fdNorm.split(/\s+/).at(-1) ?? ''
    if (pLast.length > 3 && pLast === fdLast) return { goals, matched: true }
    if (pn.length > 4 && fdNorm.includes(pn)) return { goals, matched: true }
  }
  return { goals: 0, matched: false }
}

async function fetchScorerGoals(): Promise<Map<string, number>> {
  if (!FD_KEY) return new Map()
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/scorers?limit=200`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 60 },
    })
    if (!res.ok) return new Map()
    const { scorers = [] } = await res.json()
    const map = new Map<string, number>()
    for (const s of scorers as Array<{ player?: { name?: string }; goals?: number }>) {
      const name = s.player?.name
      if (name) map.set(norm(name), s.goals ?? 0)
    }
    return map
  } catch { return new Map() }
}

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

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
const SCOREABLE_STATUSES = new Set([...LIVE_STATUSES, 'FINISHED'])

async function fetchMatches(): Promise<{ matches: Match[]; liveTeams: Set<string> }> {
  if (!FD_KEY) return { matches: [], liveTeams: new Set() }
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 30 },
    })
    if (!res.ok) return { matches: [], liveTeams: new Set() }
    const { matches = [] } = await res.json()
    const liveTeams = new Set<string>()
    const result: Match[] = []
    for (const m of matches as Record<string, unknown>[]) {
      const fdStatus = m.status as string
      if (!SCOREABLE_STATUSES.has(fdStatus)) continue
      const homeTeam = m.homeTeam as Record<string, string>
      const awayTeam = m.awayTeam as Record<string, string>
      const score = m.score as Record<string, Record<string, number | null>>
      const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
      const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
      const homeScore = score?.fullTime?.home
      const awayScore = score?.fullTime?.away
      const stage = STAGE_MAP[m.stage as string]
      if (!home || !away || homeScore == null || awayScore == null || !stage) continue
      const isLive = LIVE_STATUSES.has(fdStatus)
      if (isLive) { liveTeams.add(home); liveTeams.add(away) }
      result.push({
        id: String(m.id),
        home_team: home,
        away_team: away,
        home_score: homeScore,
        away_score: awayScore,
        status: isLive ? 'IN_PLAY' : 'FINISHED',
        match_date: m.utcDate as string,
        stage,
        group_name: (m.group as string | undefined)?.replace('GROUP_', ''),
      } as Match)
    }
    return { matches: result, liveTeams }
  } catch {
    return { matches: [], liveTeams: new Set() }
  }
}

export async function GET() {
  const supabase = createServerClient()
  const tournamentStarted = new Date() >= DEADLINE

  const [
    { data: picks, error: pe },
    { matches, liveTeams },
    { data: hostPreds },
    { data: hostAnswers },
    scorerGoals,
  ] = await Promise.all([
    supabase.from('picks').select('*'),
    fetchMatches(),
    supabase.from('host_predictions').select('pick_id, dirtiest, best, worst, most_goals_for, most_goals_against'),
    supabase.from('host_answers').select('key, value'),
    fetchScorerGoals(),
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
      const matchPoints = calculatePickPoints(p, matches)
      const team_points = tournamentStarted ? calculatePickPointsBreakdown(p, matches) : []
      const live_teams = tournamentStarted
        ? [p.team1, p.team2, p.team3, p.team4, p.team5].filter(t => t && liveTeams.has(t))
        : []
      return {
        ...p,
        host_bonus,
        total_points: matchPoints + host_bonus,
        team_points,
        live_teams,
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
