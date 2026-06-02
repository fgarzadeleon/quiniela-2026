import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

// Our team names → football-data.org team names
const NAME_MAP: Record<string, string> = {
  'USA':                      'United States',
  'South Korea':              'Korea Republic',
  'Ivory Coast':              "Côte d'Ivoire",
  'Bosnia and Herzegovina':   'Bosnia-Herzegovina',
  'Czech Republic':           'Czechia',
  'DR Congo':                 'Congo DR',
}

export interface PlayerInfo {
  id: number
  name: string
  position: string
}

export interface TeamSquad {
  team: string
  flag: string
  players: PlayerInfo[]
}

export async function GET(req: NextRequest) {
  const teamsParam = req.nextUrl.searchParams.get('teams')
  if (!teamsParam) {
    return NextResponse.json({ error: 'teams param required' }, { status: 400 })
  }

  const requestedTeams = teamsParam.split(',').map(t => t.trim()).filter(Boolean)

  if (!FD_KEY) {
    // Return empty squads so the UI can fall back gracefully
    return NextResponse.json(
      requestedTeams.map(team => ({ team, flag: '', players: [] as PlayerInfo[] })),
      { status: 200 }
    )
  }

  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/teams?season=2026`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }

    const data = await res.json()
    const fdTeams: Array<{
      id: number
      name: string
      shortName: string
      crest: string
      squad: Array<{ id: number; name: string; position: string }>
    }> = data.teams ?? []

    const result: TeamSquad[] = requestedTeams.map(ourName => {
      const fdName = NAME_MAP[ourName] ?? ourName
      const fdTeam = fdTeams.find(
        t => t.name === fdName || t.shortName === fdName || t.name === ourName
      )
      const players: PlayerInfo[] = (fdTeam?.squad ?? [])
        .filter(p => p.position !== 'Goalkeeper')
        .sort((a, b) => {
          const order: Record<string, number> = { Midfielder: 0, Forward: 1, Defender: 2 }
          return (order[a.position] ?? 3) - (order[b.position] ?? 3)
        })
        .map(p => ({ id: p.id, name: p.name, position: p.position }))

      return { team: ourName, flag: '', players }
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
