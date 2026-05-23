import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { TEAM_MAP, MAX_BUDGET, TEAMS_TO_PICK, MAX_A_TIER } from '@/lib/teams'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, email, team1, team2, team3, team4, scorer1, scorer2, scorer3, total_cost } = body

  // Validate
  const teams = [team1, team2, team3, team4]
  if (!name || teams.some(t => !t)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
  const { data, error } = await supabase
    .from('picks')
    .insert({
      name, email: email || null,
      team1, team2, team3, team4,
      scorer1: scorer1 || null, scorer2: scorer2 || null, scorer3: scorer3 || null,
      total_cost: cost,
    })
    .select()
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
