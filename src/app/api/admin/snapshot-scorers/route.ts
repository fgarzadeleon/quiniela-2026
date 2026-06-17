import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

const VALID_STAGES = [
  'GROUP_STAGE_MD2', 'GROUP_STAGE_MD3', 'ROUND_OF_32',
  'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL',
]

export async function POST(req: NextRequest) {
  const { password, stage } = await req.json()

  if (!password || password !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!stage || !VALID_STAGES.includes(stage)) {
    return NextResponse.json(
      { error: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createServerClient()

  // Idempotent — skip if snapshot already exists
  const { data: existing } = await supabase
    .from('scorer_snapshots')
    .select('id')
    .eq('effective_stage', stage)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({
      ok: false,
      message: `Snapshot for ${stage} already exists — skipped`,
    })
  }

  if (!FD_KEY) {
    return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY not configured' }, { status: 503 })
  }

  // Fetch current scorer totals from football-data.org
  const fdRes = await fetch(`${FD_BASE}/competitions/WC/scorers?limit=200`, {
    headers: { 'X-Auth-Token': FD_KEY },
    cache: 'no-store',
  })

  if (!fdRes.ok) {
    return NextResponse.json(
      { error: `FD API error: ${fdRes.status} ${await fdRes.text()}` },
      { status: 502 }
    )
  }

  const { scorers = [] } = await fdRes.json() as {
    scorers: Array<{ player?: { name?: string }; goals?: number }>
  }

  const rows = scorers
    .filter(s => s.player?.name && (s.goals ?? 0) > 0)
    .map(s => ({
      scorer_name: s.player!.name!,
      effective_stage: stage,
      goals: s.goals ?? 0,
    }))

  if (rows.length === 0) {
    return NextResponse.json({
      ok: false,
      message: 'No scorers with goals found — tournament may not have started yet',
    })
  }

  const { error } = await supabase.from('scorer_snapshots').insert(rows)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    stage,
    captured: rows.length,
    top5: rows.slice(0, 5).map(r => `${r.scorer_name}: ${r.goals}`),
    captured_at: new Date().toISOString(),
  })
}
