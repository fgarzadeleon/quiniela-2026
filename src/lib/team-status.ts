import { FD_TO_OURS } from './teams'

const FD_BASE = 'https://api.football-data.org/v4'

export async function getEliminatedTeamNames(revalidate = 300): Promise<Set<string>> {
  const key = process.env.FOOTBALL_DATA_API_KEY
  if (!key) return new Set()

  try {
    const [matchesRes, standingsRes] = await Promise.all([
      fetch(`${FD_BASE}/competitions/WC/matches`, {
        headers: { 'X-Auth-Token': key },
        next: { revalidate },
      }),
      fetch(`${FD_BASE}/competitions/WC/standings`, {
        headers: { 'X-Auth-Token': key },
        next: { revalidate },
      }),
    ])
    if (!matchesRes.ok || !standingsRes.ok) return new Set()

    const { matches = [] } = await matchesRes.json()
    const { standings = [] } = await standingsRes.json()

    const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])

    // Per-team match history
    type Entry = { knockout: boolean; won: boolean; finished: boolean; utcDate: string }
    const history = new Map<string, Entry[]>()

    for (const m of matches as Record<string, unknown>[]) {
      const status = m.status as string
      if (status !== 'FINISHED' && !LIVE.has(status)) continue
      const score = m.score as Record<string, Record<string, number | null>>
      const hg = score?.extraTime?.home ?? score?.fullTime?.home
      const ag = score?.extraTime?.away ?? score?.fullTime?.away
      if (hg == null || ag == null) continue

      const homeName = (m.homeTeam as Record<string, string>)?.name ?? ''
      const awayName = (m.awayTeam as Record<string, string>)?.name ?? ''
      const home = (FD_TO_OURS as Record<string, string>)[homeName] ?? homeName
      const away = (FD_TO_OURS as Record<string, string>)[awayName] ?? awayName
      const utcDate = m.utcDate as string
      const isKnockout = (m.stage as string) !== 'GROUP_STAGE'
      const isFinished = status === 'FINISHED'
      const winner = (m.score as Record<string, unknown>)?.winner as string | null

      const homeWon = isKnockout && (hg > ag || (hg === ag && winner === 'HOME_TEAM'))
      const awayWon = isKnockout && (ag > hg || (hg === ag && winner === 'AWAY_TEAM'))

      if (!history.has(home)) history.set(home, [])
      if (!history.has(away)) history.set(away, [])
      history.get(home)!.push({ knockout: isKnockout, won: homeWon, finished: isFinished, utcDate })
      history.get(away)!.push({ knockout: isKnockout, won: awayWon, finished: isFinished, utcDate })
    }

    // Qualified teams from standings (top 2 per group + best 8 third-place)
    const qualified = new Set<string>()
    const thirdPlace: Array<{ team: string; pts: number; gd: number; gf: number }> = []

    for (const g of standings as Array<Record<string, unknown>>) {
      const table = g.table as Array<Record<string, unknown>>
      if (!table?.length) continue
      const allPlayed3 = table.every(r => (r.playedGames as number) >= 3)
      for (const row of table) {
        const fdName = (row.team as Record<string, string>)?.name ?? ''
        const name = (FD_TO_OURS as Record<string, string>)[fdName] ?? fdName
        const pos = row.position as number
        const pts = row.points as number
        const gd = row.goalDifference as number
        const gf = row.goalsFor as number
        const played = row.playedGames as number
        if (pos <= 2 && (allPlayed3 || (pts >= 6 && played >= 2))) qualified.add(name)
        else if (pos === 3 && allPlayed3) thirdPlace.push({ team: name, pts, gd, gf })
      }
    }
    const remainingGroups = 12 - thirdPlace.length
    const guaranteedSpots = Math.max(0, 8 - remainingGroups)
    thirdPlace
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
      .slice(0, thirdPlace.length === 12 ? 8 : guaranteedSpots)
      .forEach(t => qualified.add(t.team))

    // Eliminated = didn't qualify from groups OR lost their last knockout match
    const eliminated = new Set<string>()
    for (const [team, entries] of history) {
      const groupGames = entries.filter(e => !e.knockout)
      const knockoutGames = entries.filter(e => e.knockout).sort((a, b) => a.utcDate.localeCompare(b.utcDate))
      if (groupGames.length >= 3 && !qualified.has(team)) eliminated.add(team)
      const lastKo = knockoutGames.at(-1)
      if (lastKo?.finished && !lastKo.won) eliminated.add(team)
    }

    return eliminated
  } catch {
    return new Set()
  }
}
