import { NextResponse } from 'next/server'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

// FDIO kept as fallback only — FD now has live subscription
const FDIO_BASE = 'https://footballdata.io/api/v1'
const FDIO_KEY = process.env.FDIO_API_KEY

const FDIO_TO_OURS: Record<string, string> = {
  'United States': 'USA',
  'Korea Republic': 'South Korea',
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

export async function GET() {
  const now = Date.now()

  // FD is now primary — has live subscription, returns IN_PLAY/PAUSED/TIMED/FINISHED
  if (FD_KEY) {
    try {
      const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
        headers: { 'X-Auth-Token': FD_KEY },
        next: { revalidate: 30 },
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json(data)
      }
    } catch { /* fall through to FDIO */ }
  }

  // FDIO fallback — only if FD is unavailable
  if (!FDIO_KEY) return NextResponse.json({ matches: [] })

  try {
    const fdioRes = await fetch(`${FDIO_BASE}/fixtures/today`, {
      headers: { Authorization: `Bearer ${FDIO_KEY}` },
      next: { revalidate: 60 },
    })
    if (!fdioRes.ok) return NextResponse.json({ matches: [] })
    const { data } = await fdioRes.json()
    const fdioMatches = (data?.matches ?? []) as Array<{
      match_id: number; date_unix: number; status: string; game_week: number
      home_team: { team_name: string; team_logo: string }
      away_team: { team_name: string; team_logo: string }
      score: { home: number | null; away: number | null }
    }>

    const matches = fdioMatches.map(m => {
      const kickoff = m.date_unix * 1000
      const isStarted = now > kickoff
      const isOver = now > kickoff + 130 * 60 * 1000
      const status = m.status === 'complete' ? 'FINISHED'
        : isStarted && !isOver ? 'IN_PLAY'
        : isOver ? 'FINISHED'
        : 'TIMED'
      return {
        id: m.match_id,
        utcDate: new Date(kickoff).toISOString(),
        status,
        stage: 'GROUP_STAGE',
        homeTeam: { name: FDIO_TO_OURS[m.home_team.team_name] ?? m.home_team.team_name, crest: m.home_team.team_logo },
        awayTeam: { name: FDIO_TO_OURS[m.away_team.team_name] ?? m.away_team.team_name, crest: m.away_team.team_logo },
        score: {
          fullTime: {
            home: (status === 'FINISHED' || status === 'IN_PLAY') ? m.score.home ?? null : null,
            away: (status === 'FINISHED' || status === 'IN_PLAY') ? m.score.away ?? null : null,
          },
          halfTime: { home: null, away: null },
        },
      }
    })
    return NextResponse.json({ matches })
  } catch {
    return NextResponse.json({ matches: [] })
  }
}
