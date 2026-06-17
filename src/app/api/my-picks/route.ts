import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { TEAM_MAP, MAX_BUDGET, TEAMS_TO_PICK, MAX_A_TIER } from '@/lib/teams'
import { getCurrentRound, getNextRound, getNextWildcardDeadline } from '@/lib/scoring'
import { fetchSquadMap, invalidScorers } from '@/lib/squad-validation'
const DEADLINE = new Date('2026-06-11T19:00:00Z')
const SAFE_FIELDS = 'id, name, team1, team2, team3, team4, team5, scorer1, scorer2, scorer3, wildcard_used, wildcard_effective_from, wildcard_old_scorer1, wildcard_old_scorer2, wildcard_old_scorer3, total_cost, total_points, created_at'

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

    // Validate scorers belong to selected teams
    const fdKey = process.env.FOOTBALL_DATA_API_KEY
    if (fdKey) {
      try {
        const squadMap = await fetchSquadMap(fdKey)
        const bad = invalidScorers([scorer1, scorer2, scorer3], teams, squadMap)
        if (bad.length > 0) {
          return NextResponse.json(
            { error: `Scorer(s) not in your selected teams: ${bad.join(', ')}` },
            { status: 400 }
          )
        }
      } catch { /* FD unavailable — allow submission */ }
    }

    // Duplicate combo check — also check wildcarded-away lineups so no two players
    // ever share the same active team combination during any scoring period
    const { data: existing } = await supabase
      .from('picks')
      .select('id, name, team1, team2, team3, team4, team5, wildcard_used, wildcard_old_team1, wildcard_old_team2, wildcard_old_team3, wildcard_old_team4, wildcard_old_team5')
    const newKey = sortedKey(teams)
    const duplicate = existing?.find(p => {
      if (p.id === pick.id || p.name.toLowerCase().startsWith('test')) return false
      if (sortedKey([p.team1, p.team2, p.team3, p.team4, p.team5]) === newKey) return true
      if (p.wildcard_used && p.wildcard_old_team1 &&
          sortedKey([p.wildcard_old_team1, p.wildcard_old_team2, p.wildcard_old_team3, p.wildcard_old_team4, p.wildcard_old_team5]) === newKey) return true
      return false
    })
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

  // Duplicate combo check — also check wildcarded-away lineups
  const { data: existing } = await supabase
    .from('picks')
    .select('id, name, team1, team2, team3, team4, team5, wildcard_used, wildcard_old_team1, wildcard_old_team2, wildcard_old_team3, wildcard_old_team4, wildcard_old_team5')
  const newKey = sortedKey(allFive)
  const duplicate = existing?.find(p => {
    if (p.id === pick.id || p.name.toLowerCase().startsWith('test')) return false
    if (sortedKey([p.team1, p.team2, p.team3, p.team4, p.team5]) === newKey) return true
    if (p.wildcard_used && p.wildcard_old_team1 &&
        sortedKey([p.wildcard_old_team1, p.wildcard_old_team2, p.wildcard_old_team3, p.wildcard_old_team4, p.wildcard_old_team5]) === newKey) return true
    return false
  })
  if (duplicate) {
    return NextResponse.json({ error: 'These 5 teams were already picked by someone else!' }, { status: 400 })
  }

  // Validate scorers belong to the new team lineup
  const fdKey = process.env.FOOTBALL_DATA_API_KEY
  if (fdKey && (scorer1 || scorer2 || scorer3)) {
    try {
      const squadMap = await fetchSquadMap(fdKey)
      const bad = invalidScorers([scorer1, scorer2, scorer3], allFive, squadMap)
      if (bad.length > 0) {
        return NextResponse.json(
          { error: `Scorer(s) not in your new teams: ${bad.join(', ')}` },
          { status: 400 }
        )
      }
    } catch { /* FD unavailable — allow submission */ }
  }

  const now = new Date()
  // Use the next deadline's effectiveStage (GROUP_STAGE_MD2, GROUP_STAGE_MD3, ROUND_OF_32, etc.)
  const nextDeadline = getNextWildcardDeadline(now)
  const wildcardEffectiveFrom = nextDeadline?.effectiveStage ?? (getNextRound(getCurrentRound(now)) ?? getCurrentRound(now))

  const { data: updated, error: updateErr } = await supabase
    .from('picks')
    .update({
      team1: allFive[0], team2: allFive[1], team3: allFive[2],
      team4: allFive[3], team5: allFive[4],
      total_cost: cost,
      wildcard_used: true,
      wildcard_used_at: now.toISOString(),
      wildcard_effective_from: wildcardEffectiveFrom,
      wildcard_old_team1: originalTeams[0],
      wildcard_old_team2: originalTeams[1],
      wildcard_old_team3: originalTeams[2],
      wildcard_old_team4: originalTeams[3],
      wildcard_old_team5: originalTeams[4],
      wildcard_old_scorer1: pick.scorer1 || null,
      wildcard_old_scorer2: pick.scorer2 || null,
      wildcard_old_scorer3: pick.scorer3 || null,
      scorer1: scorer1 || null,
      scorer2: scorer2 || null,
      scorer3: scorer3 || null,
    })
    .eq('id', pick.id)
    .select(SAFE_FIELDS)
    .single()

  if (updateErr) return NextResponse.json({ error: 'Failed to update picks' }, { status: 500 })
  return NextResponse.json({ ...updated, tournamentStarted: true })
}
