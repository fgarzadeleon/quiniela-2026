const FD_BASE = 'https://api.football-data.org/v4'

// Our team name → football-data.org team name
const OURS_TO_FD: Record<string, string> = {
  'USA':                    'United States',
  'South Korea':            'Korea Republic',
  'Ivory Coast':            "Côte d'Ivoire",
  'Bosnia and Herzegovina': 'Bosnia-Herzegovina',
  'Czech Republic':         'Czechia',
  'DR Congo':               'Congo DR',
  'Curacao':                'Curaçao',
  'Turkey':                 'Türkiye',
  'Cape Verde':             'Cape Verde Islands',
}

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Returns Map<ourTeamName → player names[]>
export async function fetchSquadMap(fdKey: string): Promise<Map<string, string[]>> {
  const res = await fetch(`${FD_BASE}/competitions/WC/teams?season=2026`, {
    headers: { 'X-Auth-Token': fdKey },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return new Map()

  const { teams = [] } = await res.json() as {
    teams: Array<{ name: string; shortName: string; squad: Array<{ name: string }> }>
  }

  // Invert the name map so we can look up by FD name
  const fdToOurs: Record<string, string> = {}
  for (const [ours, fd] of Object.entries(OURS_TO_FD)) fdToOurs[fd] = ours

  const map = new Map<string, string[]>()
  for (const t of teams) {
    const ourName = fdToOurs[t.name] ?? t.name
    map.set(ourName, (t.squad ?? []).map(p => p.name))
  }
  return map
}

// Fuzzy-match a scorer name against a flat list of player names
export function matchesPlayer(scorerName: string, playerNames: string[]): boolean {
  const sn = norm(scorerName)
  const sLast = sn.split(/\s+/).at(-1) ?? ''
  for (const player of playerNames) {
    const pn = norm(player)
    const pLast = pn.split(/\s+/).at(-1) ?? ''
    if (pn === sn) return true
    if (sn.length > 3 && pn.includes(sn)) return true
    if (sn.length > 3 && sn.includes(pn)) return true
    if (sLast.length > 3 && sLast === pLast) return true
  }
  return false
}

// Returns true if scorer plays for at least one of the given teams
export function isValidScorer(
  scorerName: string,
  teamNames: string[],
  squadMap: Map<string, string[]>
): boolean {
  const allPlayers = teamNames.flatMap(t => squadMap.get(t) ?? [])
  if (allPlayers.length === 0) return true // squad data unavailable — don't block
  return matchesPlayer(scorerName, allPlayers)
}

// Returns names of scorers that are invalid for the given teams
export function invalidScorers(
  scorers: (string | null | undefined)[],
  teamNames: string[],
  squadMap: Map<string, string[]>
): string[] {
  return scorers
    .filter((s): s is string => !!s)
    .filter(s => !isValidScorer(s, teamNames, squadMap))
}
