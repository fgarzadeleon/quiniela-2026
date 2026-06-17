/**
 * Capture a snapshot of all tournament scorer goals at a matchday/round boundary.
 * Run at each wildcard deadline so we can credit old vs new scorers correctly.
 *
 * Usage: npx tsx scripts/snapshot-scorers.ts <effective_stage>
 * Example: npx tsx scripts/snapshot-scorers.ts GROUP_STAGE_MD2
 *
 * Valid stages: GROUP_STAGE_MD2, GROUP_STAGE_MD3, ROUND_OF_32,
 *               ROUND_OF_16, QUARTER_FINALS, SEMI_FINALS, FINAL
 */

import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY!

const VALID_STAGES = [
  'GROUP_STAGE_MD2', 'GROUP_STAGE_MD3', 'ROUND_OF_32',
  'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL',
]

async function main() {
  const stage = process.argv[2]

  if (!stage || !VALID_STAGES.includes(stage)) {
    console.error(`Usage: npx tsx scripts/snapshot-scorers.ts <stage>`)
    console.error(`Valid stages: ${VALID_STAGES.join(', ')}`)
    process.exit(1)
  }

  console.log(`\nSnapshotting scorer goals for stage: ${stage}`)

  // Check if snapshot already exists for this stage
  const { data: existing } = await supabase
    .from('scorer_snapshots')
    .select('id')
    .eq('effective_stage', stage)
    .limit(1)

  if (existing && existing.length > 0) {
    console.log(`⚠️  Snapshot for ${stage} already exists. Skipping.`)
    console.log(`   Delete existing rows first if you want to re-snapshot.\n`)
    process.exit(0)
  }

  // Fetch top scorers from football-data.org
  console.log('Fetching scorer data from football-data.org...')
  const res = await fetch(`${FD_BASE}/competitions/WC/scorers?limit=200`, {
    headers: { 'X-Auth-Token': FD_KEY },
  })

  if (!res.ok) {
    console.error('FD API error:', res.status, await res.text())
    process.exit(1)
  }

  const { scorers = [] } = await res.json() as {
    scorers: Array<{ player?: { name?: string }; goals?: number }>
  }

  if (scorers.length === 0) {
    console.log('No scorers returned from FD — tournament may not have started yet.')
    process.exit(0)
  }

  // Build rows to insert
  const rows = scorers
    .filter(s => s.player?.name && (s.goals ?? 0) > 0)
    .map(s => ({
      scorer_name: s.player!.name!,
      effective_stage: stage,
      goals: s.goals ?? 0,
    }))

  console.log(`Inserting ${rows.length} scorer snapshots...`)

  const { error } = await supabase.from('scorer_snapshots').insert(rows)

  if (error) {
    console.error('Insert error:', error.message)
    process.exit(1)
  }

  console.log(`\n✅  Snapshot complete for ${stage}`)
  console.log(`   ${rows.length} scorers captured`)
  if (rows.length > 0) {
    console.log(`   Top 5:`)
    rows.slice(0, 5).forEach(r => console.log(`   ${r.scorer_name}: ${r.goals} goals`))
  }
  console.log()
}

main().catch(err => { console.error(err); process.exit(1) })
