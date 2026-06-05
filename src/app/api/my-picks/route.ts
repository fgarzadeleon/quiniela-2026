import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { TEAM_MAP, MAX_BUDGET, TEAMS_TO_PICK, MAX_A_TIER } from '@/lib/teams'
const DEADLINE = new Date('2026-06-11T16:00:00Z')
const SAFE_FIELDS = 'id, name, team1, team2, team3, team4, team5, scorer1, scorer2, scorer3, total_cost, wildcard_used, total_points, created_at'

function sortedKey(teams: string[]) {
  return [...teams].sort().join('|')
}

async function authenticate(supabase: ReturnType<typeof createServerClient>, name: string, password: string) {
  const { data, error } = await supabase
    .from('picks')
    .select('*')
    .ilike('name', name.trim())
    .single()

  if (error || !data) return { pick: null, error: 'No entry found with that name' }
  if (!data.password_hash) return { pick: null, error: 'This entry has no password set' }

  if (data.password_hash !== password.trim()) return { pick: null, error: 'Wrong password' }

  return { pick: data, error: null }
}

// POST — login
export async function POST(req: NextRequest) {
  const { name, password } = await req.json()
  if (!name || !password) {
    return NextResponse.json({ error: 'Name and password required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { pick, error } = await authenticate(supabase, name, password)
  if (!pick) return NextResponse.json({ error }, { status: 401 })

  const { password_hash: _, ...safe } = pick
  return NextResponse.json({ ...safe, tournamentStarted: new Date() >= DEADLINE })
}

// PATCH — edit picks (free before deadline) or wildcard (after deadline, once only)
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { name, password, type } = body
  if (!name || !password) {
    return NextResponse.json({ error: 'Name and password required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { pick, error } = await authenticate(supabase, name, password)
  if (!pick) return NextResponse.json({ error }, { status: 401 })

  const tournamentStarted = new Date() >= DEADLINE

  // ── PRE-DEADLINE: free full edit ──────────────────────────────────────────
  if (!tournamentStarted) {
    const { team1, team2, team3, team4, team5, scorer1, scorer2, scorer3, total_cost } = body
    const teams = [team1, team2, team3, team4, team5]
    if (teams.some(t => !t)) {
      return NextResponse.json({ error: 'All 5 teams required' }, { status: 400 })
    }

    const teamObjects = teams.map(n => TEAM_MAP.get(n))
    if (teamObjects.some(t => !t)) {
      return NextResponse.json({ error: 'Invalid team name' }, { status: 400 })
    }

    const cost = teamObjects.reduce((s, t) => s + t!.cost, 0)
    if (cost > MAX_BUDGET) {
      return NextResponse.json({ error: `Over budget — ${cost} / ${MAX_BUDGET} pts` }, { status: 400 })
    }
    if (cost !== total_cost) {
      return NextResponse.json({ error: 'Cost mismatch' }, { status: 400 })
    }
    if (teamObjects.filter(t => t!.tier === 'A').length > MAX_A_TIER) {
      return NextResponse.json({ error: 'Too many elite-tier teams' }, { status: 400 })
    }
    if (new Set(teams).size !== TEAMS_TO_PICK) {
      return NextResponse.json({ error: 'Duplicate teams not allowed' }, { status: 400 })
    }

    // Duplicate combo check (exclude this player's own current picks)
    const { data: existing } = await supabase
      .from('picks')
      .select('id, team1, team2, team3, team4, team5')
    const newKey = sortedKey(teams)
    const duplicate = existing?.find(p =>
      p.id !== pick.id &&
      sortedKey([p.team1, p.team2, p.team3, p.team4, p.team5]) === newKey
    )
    if (duplicate) {
      return NextResponse.json({ error: 'These 5 teams were already picked by someone else!' }, { status: 400 })
    }

    const { data: updated, error: updateErr } = await supabase
      .from('picks')
      .update({
        team1, team2, team3, team4, team5,
        scorer1: scorer1 || null, scorer2: scorer2 || null, scorer3: scorer3 || null,
        total_cost: cost,
      })
      .eq('id', pick.id)
      .select(SAFE_FIELDS)
      .single()

    if (updateErr) return NextResponse.json({ error: 'Failed to update picks' }, { status: 500 })
    return NextResponse.json({ ...updated, tournamentStarted: false })
  }

  // ── POST-DEADLINE: wildcard (one use only) ────────────────────────────────
  if (type !== 'wildcard') {
    return NextResponse.json({ error: 'Picks are locked — tournament has started' }, { status: 403 })
  }

  if (pick.wildcard_used) {
    return NextResponse.json({ error: 'Wildcard already used' }, { status: 400 })
  }

  const { keepTeams, newTeam1, newTeam2, newTeam3, scorer1, scorer2, scorer3 } = body
  const keepList: string[] = Array.isArray(keepTeams) ? keepTeams : []
  const newTeams = [newTeam1, newTeam2, newTeam3].filter(Boolean)

  if (keepList.length !== 2 || newTeams.length !== 3) {
    return NextResponse.json({ error: 'Must keep exactly 2 teams and pick 3 new ones' }, { status: 400 })
  }

  const originalTeams = [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]
  if (!keepList.every(t => originalTeams.includes(t))) {
    return NextResponse.json({ error: 'Kept teams must be from your original picks' }, { status: 400 })
  }

  const allFive = [...keepList, ...newTeams]
  if (new Set(allFive).size !== 5) {
    return NextResponse.json({ error: 'Duplicate teams not allowed' }, { status: 400 })
  }

  const teamObjects = allFive.map(n => TEAM_MAP.get(n))
  if (teamObjects.some(t => !t)) {
    return NextResponse.json({ error: 'Invalid team name' }, { status: 400 })
  }

  const cost = teamObjects.reduce((s, t) => s + t!.cost, 0)
  if (cost > MAX_BUDGET) {
    return NextResponse.json({ error: `Over budget — ${cost} / ${MAX_BUDGET} pts` }, { status: 400 })
  }
  if (teamObjects.filter(t => t!.tier === 'A').length > MAX_A_TIER) {
    return NextResponse.json({ error: 'Too many elite-tier teams' }, { status: 400 })
  }

  // Duplicate combo check (exclude own picks)
  const { data: existing } = await supabase
    .from('picks')
    .select('id, team1, team2, team3, team4, team5')
  const newKey = sortedKey(allFive)
  const duplicate = existing?.find(p =>
    p.id !== pick.id &&
    sortedKey([p.team1, p.team2, p.team3, p.team4, p.team5]) === newKey
  )
  if (duplicate) {
    return NextResponse.json({ error: 'These 5 teams were already picked by someone else!' }, { status: 400 })
  }

  const { data: updated, error: updateErr } = await supabase
    .from('picks')
    .update({
      team1: allFive[0], team2: allFive[1], team3: allFive[2],
      team4: allFive[3], team5: allFive[4],
      total_cost: cost,
      wildcard_used: true,
      scorer1: scorer1 || null, scorer2: scorer2 || null, scorer3: scorer3 || null,
    })
    .eq('id', pick.id)
    .select(SAFE_FIELDS)
    .single()

  if (updateErr) return NextResponse.json({ error: 'Failed to update picks' }, { status: 500 })
  return NextResponse.json({ ...updated, tournamentStarted: true })
}
