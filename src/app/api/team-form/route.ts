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

    // Build form entries — sort by utcDate (not matchday, which resets to 1 in knockout rounds)
    type MatchEntry = { result: 'W' | 'D' | 'L'; utcDate: string; pts: number; knockout: boolean; won: boolean }
    const formEntries = new Map<string, MatchEntry[]>()

    for (const m of matches as Record<string, unknown>[]) {
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
      const utcDate = m.utcDate as string
      const stage = m.stage as string
      const isKnockout = stage !== 'GROUP_STAGE'

      if (!formEntries.has(home)) formEntries.set(home, [])
      if (!formEntries.has(away)) formEntries.set(away, [])

      const homeResult: 'W' | 'D' | 'L' = hg > ag ? 'W' : hg === ag ? 'D' : 'L'
      const awayResult: 'W' | 'D' | 'L' = hg < ag ? 'W' : hg === ag ? 'D' : 'L'

      // For penalty shootouts: ET score is level (both get D for match result),
      // but the winner field tells us who actually advanced (gets gold ring)
      const winner = (m.score as Record<string, unknown>)?.winner as string | null
      const homeAdvanced = isKnockout && (homeResult === 'W' || (homeResult === 'D' && winner === 'HOME_TEAM'))
      const awayAdvanced = isKnockout && (awayResult === 'W' || (awayResult === 'D' && winner === 'AWAY_TEAM'))

      formEntries.get(home)!.push({ result: homeResult, utcDate, pts: homeResult === 'W' ? 3 : homeResult === 'D' ? 1 : 0, knockout: isKnockout, won: homeAdvanced })
      formEntries.get(away)!.push({ result: awayResult, utcDate, pts: awayResult === 'W' ? 3 : awayResult === 'D' ? 1 : 0, knockout: isKnockout, won: awayAdvanced })
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
    const result: Record<string, { results: Array<'W' | 'D' | 'L'>; qualifiedAtIndex: number | null; qualifiedIndices: number[] }> = {}

    for (const [team, entries] of formEntries) {
      // Sort by actual match date — matchday resets to 1 in knockout rounds so can't use it
      const sorted = entries.sort((a, b) => a.utcDate.localeCompare(b.utcDate))
      const results = sorted.map(e => e.result)

      // Build qualifiedAtIndex: every match where the team advanced gets a ring
      // For group stage: the qualifying match (6pts early or last group match)
      // For knockouts: every win = advancing, so ring on that dot
      const qualifiedIndices = new Set<number>()

      // Knockout wins
      sorted.forEach((e, i) => { if (e.knockout && e.won) qualifiedIndices.add(i) })

      // Group stage qualification (only if no knockout wins yet, i.e. still in group stage)
      if (qualifiedIndices.size === 0 && qualifiedTeams.has(team)) {
        let cumPts = 0
        let found = false
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].knockout) continue // skip knockout entries for group pts calc
          cumPts += sorted[i].pts
          if (cumPts >= 6) { qualifiedIndices.add(i); found = true; break }
        }
        if (!found) {
          // Qualified on fewer than 6pts — mark last group match
          const lastGroupIdx = sorted.map((e, i) => ({ e, i })).filter(({ e }) => !e.knockout).at(-1)?.i
          if (lastGroupIdx !== undefined) qualifiedIndices.add(lastGroupIdx)
        }
      }

      result[team] = { results, qualifiedAtIndex: qualifiedIndices.size > 0 ? Math.max(...qualifiedIndices) : null, qualifiedIndices: [...qualifiedIndices] }
    }

    return NextResponse.json({ form: result }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    })
  } catch {
    return NextResponse.json({ form: {} })
  }
}
