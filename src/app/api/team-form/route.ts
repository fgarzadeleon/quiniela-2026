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
    // Fetch matches and standings in parallel
    const [matchesRes, standingsRes] = await Promise.all([
      fetch(`${FD_BASE}/competitions/WC/matches`, {
        headers: { 'X-Auth-Token': FD_KEY },
        next: { revalidate: 60 },
      }).then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] })),
      fetch(`${FD_BASE}/competitions/WC/standings`, {
        headers: { 'X-Auth-Token': FD_KEY },
        next: { revalidate: 60 },
      }).then(r => r.ok ? r.json() : { standings: [] }).catch(() => ({ standings: [] })),
    ])

    const { matches = [] } = matchesRes
    const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])

    // Build form entries from group stage matches
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
      if (m.stage !== 'GROUP_STAGE') continue

      if (!formEntries.has(home)) formEntries.set(home, [])
      if (!formEntries.has(away)) formEntries.set(away, [])

      const homeResult: 'W' | 'D' | 'L' = hg > ag ? 'W' : hg === ag ? 'D' : 'L'
      const awayResult: 'W' | 'D' | 'L' = hg < ag ? 'W' : hg === ag ? 'D' : 'L'
      formEntries.get(home)!.push({ result: homeResult, matchday, pts: homeResult === 'W' ? 3 : homeResult === 'D' ? 1 : 0 })
      formEntries.get(away)!.push({ result: awayResult, matchday, pts: awayResult === 'W' ? 3 : awayResult === 'D' ? 1 : 0 })
    }

    // Derive qualified teams from FD standings (top 2 per group + best 8 third-place)
    const qualifiedTeams = new Set<string>()
    const thirdPlace: Array<{ team: string; pts: number; gd: number; gf: number }> = []

    for (const g of (standingsRes.standings ?? []) as Array<Record<string, unknown>>) {
      const table = g.table as Array<Record<string, unknown>>
      if (!table?.length) continue
      const allPlayed3 = table.every(r => (r.playedGames as number) >= 3)

      for (const row of table) {
        const fdName = (row.team as Record<string, string>)?.name ?? ''
        const name = FD_TO_OURS[fdName] ?? fdName
        const pos = row.position as number
        const pts = row.points as number
        const gd = row.goalDifference as number
        const gf = row.goalsFor as number
        const played = row.playedGames as number

        if (pos <= 2) {
          // Top 2: confirmed once their group is complete, or early if 6pts from 2 games
          if (allPlayed3 || (pts >= 6 && played >= 2)) {
            qualifiedTeams.add(name)
          }
        } else if (pos === 3 && allPlayed3) {
          thirdPlace.push({ team: name, pts, gd, gf })
        }
      }
    }

    // Best 8 third-place qualify — rank by pts, GD, GF
    const remainingGroups = 12 - thirdPlace.length
    const guaranteedSpots = Math.max(0, 8 - remainingGroups)
    thirdPlace
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
      .slice(0, thirdPlace.length === 12 ? 8 : guaranteedSpots)
      .forEach(t => qualifiedTeams.add(t.team))

    // Build result: for each team, find which match index was the qualifying one
    // = last match played (they had to finish the group to know they qualified)
    const result: Record<string, { results: Array<'W' | 'D' | 'L'>; qualifiedAtIndex: number | null }> = {}

    for (const [team, entries] of formEntries) {
      const sorted = entries.sort((a, b) => a.matchday - b.matchday)
      const results = sorted.map(e => e.result)

      let qualifiedAtIndex: number | null = null
      if (qualifiedTeams.has(team)) {
        // Early 6pts: mark the match that pushed them to 6pts
        let cumPts = 0
        for (let i = 0; i < sorted.length; i++) {
          cumPts += sorted[i].pts
          if (cumPts >= 6) { qualifiedAtIndex = i; break }
        }
        // Otherwise (qualified on fewer pts): mark their last match
        if (qualifiedAtIndex === null) qualifiedAtIndex = sorted.length - 1
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
