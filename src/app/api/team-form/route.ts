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

    // team → ordered array of { result: 'W'|'D'|'L', matchday: number, utcDate: string }
    const form = new Map<string, Array<{ result: 'W' | 'D' | 'L'; matchday: number }>>()

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
      const matchday = m.matchday as number ?? 0

      if (!form.has(home)) form.set(home, [])
      if (!form.has(away)) form.set(away, [])

      if (hg > ag) {
        form.get(home)!.push({ result: 'W', matchday })
        form.get(away)!.push({ result: 'L', matchday })
      } else if (hg === ag) {
        form.get(home)!.push({ result: 'D', matchday })
        form.get(away)!.push({ result: 'D', matchday })
      } else {
        form.get(home)!.push({ result: 'L', matchday })
        form.get(away)!.push({ result: 'W', matchday })
      }
    }

    // Sort each team's form by matchday
    const result: Record<string, Array<'W' | 'D' | 'L'>> = {}
    for (const [team, entries] of form) {
      result[team] = entries.sort((a, b) => a.matchday - b.matchday).map(e => e.result)
    }

    return NextResponse.json({ form: result }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    })
  } catch {
    return NextResponse.json({ form: {} })
  }
}
