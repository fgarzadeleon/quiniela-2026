import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { TEAM_MAP, MAX_BUDGET, TEAMS_TO_PICK, MAX_A_TIER } from '@/lib/teams'
const DEADLINE = new Date('2026-06-11T16:00:00Z')

function sortedKey(teams: string[]) {
  return [...teams].sort().join('|')
}

export async function POST(req: NextRequest) {
  if (new Date() >= DEADLINE) {
    return NextResponse.json({ error: 'Submissions closed — the tournament has started!' }, { status: 403 })
  }

  const body = await req.json()
  const { name, team1, team2, team3, team4, team5, scorer1, scorer2, scorer3, total_cost, password } = body

  const teams = [team1, team2, team3, team4, team5]
  if (!name || teams.some(t => !t)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!password || password.trim().length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 })
  }

  const teamObjects = teams.map(n => TEAM_MAP.get(n))
  if (teamObjects.some(t => !t)) {
    return NextResponse.json({ error: 'Invalid team name' }, { status: 400 })
  }

  const cost = teamObjects.reduce((s, t) => s + t!.cost, 0)
  if (cost !== total_cost || cost > MAX_BUDGET) {
    return NextResponse.json({ error: 'Budget exceeded or cost mismatch' }, { status: 400 })
  }

  const aTierCount = teamObjects.filter(t => t!.tier === 'A').length
  if (aTierCount > MAX_A_TIER) {
    return NextResponse.json({ error: 'Too many elite-tier teams' }, { status: 400 })
  }

  if (new Set(teams).size !== TEAMS_TO_PICK) {
    return NextResponse.json({ error: 'Duplicate teams not allowed' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Duplicate combo check
  const { data: existing } = await supabase
    .from('picks')
    .select('team1, team2, team3, team4, team5')
  const newKey = sortedKey(teams)
  const duplicate = existing?.find(p =>
    sortedKey([p.team1, p.team2, p.team3, p.team4, p.team5]) === newKey
  )
  if (duplicate) {
    return NextResponse.json({ error: 'These 5 teams were already picked by someone else. Try a different combination!' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('picks')
    .insert({
      name,
      team1, team2, team3, team4, team5,
      scorer1: scorer1 || null, scorer2: scorer2 || null, scorer3: scorer3 || null,
      total_cost: cost,
      password_hash: password.trim(),
      wildcard_used: false,
    })
    .select('id, name, team1, team2, team3, team4, team5, total_cost, wildcard_used, created_at')
    .single()

  if (error) {
    console.error('Supabase error:', error)
    return NextResponse.json({ error: 'Failed to save pick' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('picks')
    .select('*')
    .order('total_points', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
