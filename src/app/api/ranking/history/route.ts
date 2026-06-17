import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const STAGE_ORDER = ['MD1', 'MD2', 'MD3', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL']
const STAGE_DISPLAY: Record<string, string> = {
  MD1: 'MD1', MD2: 'MD2', MD3: 'MD3',
  ROUND_OF_32: 'R32', ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', FINAL: 'Final',
}

export async function GET(req: Request) {
  const supabase = createServerClient()

  // Fetch stage-labelled snapshots (not daily ones)
  const { data: snapshots } = await supabase
    .from('ranking_snapshots')
    .select('pick_id, rank, total_points, snapshot_date, label')
    .in('label', STAGE_ORDER)
    .order('snapshot_date', { ascending: true })

  // Fetch current live ranking from ranking API
  const origin = new URL(req.url).origin
  const rankRes = await fetch(`${origin}/api/ranking`, { cache: 'no-store' })
  const { ranked: current = [] } = rankRes.ok ? await rankRes.json() : {}

  // Fetch pick names for snapshot rows
  const { data: picks } = await supabase
    .from('picks')
    .select('id, name')
    .not('name', 'ilike', 'test%')

  const nameMap = new Map<string, string>((picks ?? []).map(p => [p.id, p.name]))

  // Group snapshots by label in defined order
  const snapshotsByLabel = new Map<string, Array<{ pick_id: string; rank: number; total_points: number }>>()
  for (const row of snapshots ?? []) {
    if (!snapshotsByLabel.has(row.label)) snapshotsByLabel.set(row.label, [])
    snapshotsByLabel.get(row.label)!.push(row)
  }

  const stages = STAGE_ORDER
    .filter(l => snapshotsByLabel.has(l))
    .map(label => ({
      label,
      display: STAGE_DISPLAY[label],
      ranks: (snapshotsByLabel.get(label) ?? [])
        .sort((a, b) => a.rank - b.rank)
        .map(r => ({ id: r.pick_id, name: nameMap.get(r.pick_id) ?? r.pick_id, rank: r.rank, total_points: r.total_points })),
    }))

  // Add current as the last column if there are historical stages
  const currentColumn = (current as Array<{ id: string; name: string; rank: number; total_points: number }>)
    .filter(p => !p.name?.toLowerCase().startsWith('test'))
    .map(p => ({ id: p.id, name: p.name, rank: p.rank, total_points: p.total_points }))

  return NextResponse.json({ stages, current: currentColumn })
}
