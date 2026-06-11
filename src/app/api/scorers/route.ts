import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
const DEADLINE = new Date('2026-06-11T19:00:00Z')

// football-data.org team name → our name
const FD_TO_OURS: Record<string, string> = {
  'United States':      'USA',
  'Korea Republic':     'South Korea',
  "Côte d'Ivoire":      'Ivory Coast',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Czechia':            'Czech Republic',
  'Congo DR':           'DR Congo',
}

function norm(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export async function GET() {
  const tournamentStarted = new Date() >= DEADLINE

  let topScorers: Array<{ name: string; team: string; goals: number; assists: number; penalties: number }> = []

  if (FD_KEY) {
    try {
      const res = await fetch(`${FD_BASE}/competitions/WC/scorers?limit=50`, {
        headers: { 'X-Auth-Token': FD_KEY },
        next: { revalidate: 60 },
      })
      if (res.ok) {
        const data = await res.json()
        topScorers = (data.scorers ?? []).map((s: {
          player?: { name?: string }
          team?: { name?: string }
          goals?: number
          assists?: number
          penalties?: number
        }) => ({
          name: s.player?.name ?? '',
          team: FD_TO_OURS[s.team?.name ?? ''] ?? s.team?.name ?? '',
          goals: s.goals ?? 0,
          assists: s.assists ?? 0,
          penalties: s.penalties ?? 0,
        }))
      }
    } catch { /* fall through with empty list */ }
  }

  // Build goals lookup keyed by normalised name
  const goalsMap = new Map<string, number>()
  for (const s of topScorers) {
    goalsMap.set(norm(s.name), s.goals)
  }

  const supabase = createServerClient()
  const { data: picks } = await supabase
    .from('picks')
    .select('name, scorer1, scorer2, scorer3')
    .not('name', 'ilike', 'test%')
    .order('created_at', { ascending: true })

  const quinielaScorers = (picks ?? [])
    .filter(p => p.scorer1 || p.scorer2 || p.scorer3)
    .map(p => {
      const scorerPicks = [p.scorer1, p.scorer2, p.scorer3]
        .filter(Boolean)
        .map(name => ({ name: name!, goals: goalsMap.get(norm(name!)) ?? 0 }))
      return {
        playerName: p.name,
        picks: scorerPicks,
        total: scorerPicks.reduce((s, x) => s + x.goals, 0),
      }
    })
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ tournamentStarted, topScorers, quinielaScorers })
}
