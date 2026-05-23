import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculatePickPoints } from '@/lib/scoring'
import { Match, Pick } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerClient()

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
    }))
    .sort((a, b) => b.total_points - a.total_points)
    .map((p, i) => ({ ...p, rank: i + 1 }))

  return NextResponse.json(ranked)
}
