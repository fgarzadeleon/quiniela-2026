import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

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

function heatLabel(score: number): { emoji: string; label: string; color: string } {
  if (score >= 70) return { emoji: '🔴', label: 'Must-watch',  color: '#D72638' }
  if (score >= 40) return { emoji: '🟠', label: 'High impact', color: '#F97316' }
  if (score >= 20) return { emoji: '🟡', label: 'Moderate',    color: '#F5C518' }
  return             { emoji: '⚪', label: 'Very low',    color: 'rgba(255,255,255,0.3)' }
}

export async function GET() {
  const supabase = createServerClient()

  const [{ data: picks }, fdRes] = await Promise.all([
    supabase
      .from('picks')
      .select('name, team1, team2, team3, team4, team5')
      .not('name', 'ilike', 'test%'),
    FD_KEY
      ? fetch(`${FD_BASE}/competitions/WC/matches`, {
          headers: { 'X-Auth-Token': FD_KEY },
          next: { revalidate: 120 },
        }).then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] }))
      : Promise.resolve({ matches: [] }),
  ])

  const realPicks = (picks ?? [])
  const totalPlayers = realPicks.length

  // Build team → player count map
  const teamPickCounts = new Map<string, number>()
  for (const p of realPicks) {
    const teams = [p.team1, p.team2, p.team3, p.team4, p.team5].filter(Boolean) as string[]
    for (const t of teams) teamPickCounts.set(t, (teamPickCounts.get(t) ?? 0) + 1)
  }

  const now = Date.now()
  const in48h = now + 48 * 60 * 60 * 1000

  // Filter to upcoming matches in next 48 hours
  const upcoming = ((fdRes.matches ?? []) as Array<Record<string, unknown>>)
    .filter(m => {
      const kickoff = new Date(m.utcDate as string).getTime()
      return kickoff > now && kickoff < in48h && m.status === 'TIMED'
    })
    .map(m => {
      const homeTeam = m.homeTeam as Record<string, string>
      const awayTeam = m.awayTeam as Record<string, string>
      const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
      const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
      const homePickers = teamPickCounts.get(home) ?? 0
      const awayPickers = teamPickCounts.get(away) ?? 0
      // Players with either team (avoid double-counting players with both)
      const affectedSet = new Set<string>()
      for (const p of realPicks) {
        const teams = [p.team1, p.team2, p.team3, p.team4, p.team5]
        if (teams.includes(home) || teams.includes(away)) affectedSet.add(p.name)
      }
      const affected = affectedSet.size
      const heatScore = Math.min(100, Math.round((affected / totalPlayers) * 135))
      const { emoji, label, color } = heatLabel(heatScore)
      return {
        id: m.id,
        utcDate: m.utcDate as string,
        homeTeam: home,
        awayTeam: away,
        homePickers,
        awayPickers,
        affected,
        totalPlayers,
        heatScore,
        emoji,
        label,
        color,
      }
    })
    .sort((a, b) => b.heatScore - a.heatScore)

  return NextResponse.json({ matches: upcoming, totalPlayers })
}
