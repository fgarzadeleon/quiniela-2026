import { NextResponse } from 'next/server'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

const FDIO_BASE = 'https://footballdata.io/api/v1'
const FDIO_KEY = process.env.FDIO_API_KEY

const FDIO_TO_OURS: Record<string, string> = {
  'United States': 'USA',
  'South Korea': 'South Korea',
  'Korea Republic': 'South Korea',
  'Ivory Coast': 'Ivory Coast',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cape Verde': 'Cape Verde',
  'Bosnia and Herzegovina': 'Bosnia and Herzegovina',
  'Czech Republic': 'Czech Republic',
  'DR Congo': 'DR Congo',
  'Congo DR': 'DR Congo',
  'Curacao': 'Curacao',
  'Turkey': 'Turkey',
  'Türkiye': 'Turkey',
}

export const dynamic = 'force-dynamic'

async function fetchFDIOToday() {
  if (!FDIO_KEY) return []
  try {
    const res = await fetch(`${FDIO_BASE}/fixtures/today`, {
      headers: { Authorization: `Bearer ${FDIO_KEY}` },
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const { data } = await res.json()
    return (data?.matches ?? []) as Array<{
      match_id: number
      match_date: string
      date_unix: number
      status: 'complete' | 'incomplete'
      game_week: number
      round_id: number
      home_team: { team_name: string; team_logo: string }
      away_team: { team_name: string; team_logo: string }
      score: { home: number | null; away: number | null }
    }>
  } catch { return [] }
}

export async function GET() {
  const now = Date.now()

  // Fetch FDIO today's matches and FD historical in parallel
  const [fdioMatches, fdRes] = await Promise.all([
    fetchFDIOToday(),
    FD_KEY
      ? fetch(`${FD_BASE}/competitions/WC/matches?status=FINISHED`, {
          headers: { 'X-Auth-Token': FD_KEY },
          next: { revalidate: 120 },
        }).then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] }))
      : Promise.resolve({ matches: [] }),
  ])

  // Convert FDIO matches to our display format
  const todayMatches = fdioMatches.map(m => {
    const kickoff = m.date_unix * 1000
    const isStarted = now > kickoff
    const isOver = now > kickoff + 130 * 60 * 1000 // 130 min after kickoff

    let status: string
    if (m.status === 'complete') {
      status = 'FINISHED'
    } else if (isStarted && !isOver) {
      status = 'IN_PLAY'
    } else if (m.status === 'incomplete' && isOver) {
      status = 'FINISHED' // FDIO may lag on flipping to complete
    } else {
      status = 'TIMED'
    }

    return {
      id: m.match_id,
      utcDate: new Date(kickoff).toISOString(),
      status,
      stage: 'GROUP_STAGE',
      matchday: m.game_week,
      homeTeam: {
        name: FDIO_TO_OURS[m.home_team.team_name] ?? m.home_team.team_name,
        crest: m.home_team.team_logo,
      },
      awayTeam: {
        name: FDIO_TO_OURS[m.away_team.team_name] ?? m.away_team.team_name,
        crest: m.away_team.team_logo,
      },
      score: {
        fullTime: {
          home: (status === 'FINISHED' || status === 'IN_PLAY') ? (m.score.home ?? null) : null,
          away: (status === 'FINISHED' || status === 'IN_PLAY') ? (m.score.away ?? null) : null,
        },
        halfTime: { home: null, away: null },
      },
    }
  })

  // FD finished matches (historical, excluding today to avoid duplication)
  const todayStr = new Date().toISOString().slice(0, 10)
  const historicalMatches = ((fdRes.matches ?? []) as Array<Record<string, unknown>>)
    .filter((m: Record<string, unknown>) => {
      const d = (m.utcDate as string | undefined)?.slice(0, 10)
      return d && d < todayStr
    })

  return NextResponse.json({ matches: [...todayMatches, ...historicalMatches] })
}
