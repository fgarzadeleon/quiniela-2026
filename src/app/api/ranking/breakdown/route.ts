import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculatePickPoints } from '@/lib/scoring'
import { Match, Pick } from '@/types'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

const FD_TO_OURS: Record<string, string> = {
  'United States':      'USA',
  'Korea Republic':     'South Korea',
  "Côte d'Ivoire":      'Ivory Coast',
  'Ivory Coast':        'Ivory Coast',
  'Cape Verde Islands': 'Cape Verde',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Czechia':            'Czech Republic',
  'Congo DR':           'DR Congo',
  'Curaçao':            'Curacao',
  'Türkiye':            'Turkey',
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

// Period boundaries (UTC) — matches are attributed to the period they fall in
const PERIODS = [
  { label: 'MD1', end: new Date('2026-06-18T16:00:00Z') },
  { label: 'MD2', end: new Date('2026-06-24T19:00:00Z') },
  { label: 'MD3', end: new Date('2026-06-28T19:00:00Z') },
  { label: 'R32', end: new Date('2026-07-04T17:00:00Z') },
  { label: 'R16', end: new Date('2026-07-09T20:00:00Z') },
  { label: 'QF',  end: new Date('2026-07-14T19:00:00Z') },
  { label: 'SF',  end: new Date('2026-07-19T19:00:00Z') },
  { label: 'Final', end: new Date('2026-07-22T00:00:00Z') },
]

export async function GET() {
  if (!FD_KEY) return NextResponse.json({ periods: [], players: [] })

  const supabase = createServerClient()
  const [fdRes, { data: picks }] = await Promise.all([
    fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 60 },
    }).then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] })),
    supabase.from('picks').select('*').not('name', 'ilike', 'test%'),
  ])

  const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
  const allMatches: Match[] = []

  for (const m of (fdRes.matches ?? []) as Record<string, unknown>[]) {
    const status = m.status as string
    if (status !== 'FINISHED' && !LIVE.has(status)) continue
    const score = m.score as Record<string, Record<string, number | null>>
    const hg = score?.extraTime?.home ?? score?.fullTime?.home
    const ag = score?.extraTime?.away ?? score?.fullTime?.away
    if (hg == null || ag == null) continue
    const homeTeam = m.homeTeam as Record<string, string>
    const awayTeam = m.awayTeam as Record<string, string>
    const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
    const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
    const stage = STAGE_MAP[m.stage as string]
    if (!home || !away || !stage) continue
    allMatches.push({
      id: String(m.id),
      home_team: home,
      away_team: away,
      home_score: hg,
      away_score: ag,
      status: LIVE.has(status) ? 'IN_PLAY' : 'FINISHED',
      match_date: m.utcDate as string,
      stage,
      group_name: (m.group as string | undefined)?.replace('GROUP_', ''),
    } as Match)
  }

  // Only include periods that have at least one finished match
  const activePeriods = PERIODS.filter(p =>
    allMatches.some(m => new Date(m.match_date) < p.end)
  )

  // For each player, compute cumulative points at each period boundary
  // then diff to get points earned per period
  const players = (picks ?? []).map(pick => {
    const p = pick as Pick

    // Cumulative points at each period end
    const cumulative = activePeriods.map(period => {
      const matchesUpTo = allMatches.filter(m => new Date(m.match_date) < period.end)
      return calculatePickPoints(p, matchesUpTo)
    })

    // Points earned in each period = cumulative[i] - cumulative[i-1]
    const earned = cumulative.map((pts, i) => i === 0 ? pts : pts - cumulative[i - 1])

    return {
      name: p.name,
      total: cumulative[cumulative.length - 1] ?? 0,
      earned, // points per period
    }
  })
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    periods: activePeriods.map(p => p.label),
    players,
  })
}
