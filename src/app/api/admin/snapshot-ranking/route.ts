import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}))

  if (!password || password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // Check if today's snapshot already exists
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const { data: existing } = await supabase
    .from('ranking_snapshots')
    .select('id')
    .eq('snapshot_date', today)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: false, message: `Snapshot for ${today} already exists` })
  }

  // Fetch current ranking from the live ranking API
  const origin = req.nextUrl.origin
  const res = await fetch(`${origin}/api/ranking`, { cache: 'no-store' })
  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch ranking' }, { status: 502 })
  }

  const { ranked } = await res.json() as {
    ranked: Array<{ id: string; rank: number; total_points: number; name: string }>
  }

  if (!ranked || ranked.length === 0) {
    return NextResponse.json({ ok: false, message: 'No ranked picks found' })
  }

  const rows = ranked.map(p => ({
    pick_id: p.id,
    rank: p.rank,
    total_points: p.total_points,
    snapshot_date: today,
  }))

  const { error } = await supabase.from('ranking_snapshots').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    snapshot_date: today,
    captured: rows.length,
    top3: ranked.slice(0, 3).map(p => `#${p.rank} ${p.name} (${p.total_points}pts)`),
  })
}
