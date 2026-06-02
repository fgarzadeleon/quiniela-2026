import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculatePickPoints } from '@/lib/scoring'
import { Match, Pick } from '@/types'

export const dynamic = 'force-dynamic'

const DEADLINE = new Date('2026-06-11T16:00:00Z')

export async function GET() {
  const supabase = createServerClient()
  const tournamentStarted = new Date() >= DEADLINE

  const [{ data: picks, error: pe }, { data: matches, error: me }] = await Promise.all([
    supabase.from('picks').select('*'),
    supabase.from('matches').select('*').eq('status', 'FINISHED'),
  ])

  if (pe || me) {
    return NextResponse.json({ error: (pe || me)?.message }, { status: 500 })
  }

  const ranked = (picks as Pick[])
    .map(p => ({
      ...p,
      total_points: calculatePickPoints(p, (matches ?? []) as Match[]),
      // Hide team picks and scorers until tournament starts
      ...(!tournamentStarted && {
        team1: null, team2: null, team3: null, team4: null, team5: null,
        scorer1: null, scorer2: null, scorer3: null,
      }),
    }))
    .sort((a, b) => b.total_points - a.total_points)
    .map((p, i) => ({ ...p, rank: i + 1, password_hash: undefined }))

  return NextResponse.json({ ranked, tournamentStarted })
}
