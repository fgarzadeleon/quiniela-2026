import { NextResponse } from 'next/server'

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

export async function GET() {
  if (!FD_KEY) return NextResponse.json({ form: {} })

  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 60 },
    })
    if (!res.ok) return NextResponse.json({ form: {} })

    const { matches = [] } = await res.json()
    const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])

    type MatchEntry = { result: 'W' | 'D' | 'L'; matchday: number; pts: number }
    const formEntries = new Map<string, MatchEntry[]>()

    for (const m of matches as Record<string, unknown>[]) {
      const status = m.status as string
      if (status !== 'FINISHED' && !LIVE.has(status)) continue

      const score = m.score as Record<string, Record<string, number | null>>
      const hg = score?.fullTime?.home
      const ag = score?.fullTime?.away
      if (hg == null || ag == null) continue

      const homeTeam = m.homeTeam as Record<string, string>
      const awayTeam = m.awayTeam as Record<string, string>
      const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
      const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
      const matchday = (m.matchday as number) ?? 0
      const stage = m.stage as string

      // Only track group stage for qualification badge
      if (stage !== 'GROUP_STAGE') continue

      if (!formEntries.has(home)) formEntries.set(home, [])
      if (!formEntries.has(away)) formEntries.set(away, [])

      const homeResult: 'W' | 'D' | 'L' = hg > ag ? 'W' : hg === ag ? 'D' : 'L'
      const awayResult: 'W' | 'D' | 'L' = hg < ag ? 'W' : hg === ag ? 'D' : 'L'
      const homePts = homeResult === 'W' ? 3 : homeResult === 'D' ? 1 : 0
      const awayPts = awayResult === 'W' ? 3 : awayResult === 'D' ? 1 : 0

      formEntries.get(home)!.push({ result: homeResult, matchday, pts: homePts })
      formEntries.get(away)!.push({ result: awayResult, matchday, pts: awayPts })
    }

    // For each team, determine which matchday index earned the qualification bonus.
    // 6pts from 2+ games = mathematically confirmed top-2 (same rule as scoring.ts).
    // Mark the index of the match that pushed them to 6pts.
    const result: Record<string, { results: Array<'W' | 'D' | 'L'>; qualifiedAtIndex: number | null }> = {}

    for (const [team, entries] of formEntries) {
      const sorted = entries.sort((a, b) => a.matchday - b.matchday)
      const results = sorted.map(e => e.result)

      let cumPts = 0
      let qualifiedAtIndex: number | null = null
      for (let i = 0; i < sorted.length; i++) {
        cumPts += sorted[i].pts
        if (cumPts >= 6 && qualifiedAtIndex === null) {
          qualifiedAtIndex = i
        }
      }

      result[team] = { results, qualifiedAtIndex }
    }

    return NextResponse.json({ form: result }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    })
  } catch {
    return NextResponse.json({ form: {} })
  }
}
