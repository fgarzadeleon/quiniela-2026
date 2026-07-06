/**
 * Tests that wildcard modification is gated correctly by the effective-from deadline.
 *
 * Scenarios:
 *   1. Wildcard used, effective_from deadline PASSED  → modification rejected
 *   2. Wildcard used, effective_from deadline OPEN    → modification allowed
 *   3. No wildcard used                               → first use allowed
 *   4. Kept team not in original lineup               → rejected
 *
 * Run: npx tsx scripts/test-wildcard-deadline.ts
 * Requires a running local server on port 3001: npx next dev -p 3001
 */

import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(__dirname, '../.env.local') })
import { createClient } from '@supabase/supabase-js'

const BASE = 'http://localhost:3001'
const TEST_NAME = 'test Juan Teran'
const TEST_PASS = 'Juan8992.'
const TEST_ID   = 'f5b579c7-e7f7-4157-963d-667c237b46bf'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function patch(body: object) {
  const res = await fetch(`${BASE}/api/my-picks`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: TEST_NAME, password: TEST_PASS, type: 'wildcard', ...body }),
  })
  return res.json() as Promise<Record<string, unknown>>
}

async function resetAccount(overrides: object = {}) {
  await sb.from('picks').update({
    team1: 'England', team2: 'Netherlands', team3: 'Mexico', team4: 'Egypt', team5: 'Iran',
    wildcard_used: false, wildcard_used_at: null, wildcard_effective_from: null,
    wildcard_old_team1: null, wildcard_old_team2: null, wildcard_old_team3: null,
    wildcard_old_team4: null, wildcard_old_team5: null,
    scorer1: null, scorer2: null, scorer3: null,
    ...overrides,
  }).eq('id', TEST_ID)
  await sb.from('pick_events').delete().ilike('player_name', 'test Juan%')
}

function pass(label: string) { console.log(`  ✅ ${label}`) }
function fail(label: string, detail?: unknown) { console.error(`  ❌ ${label}`, detail ?? ''); failures++ }

let failures = 0

async function main() {
  console.log('\n=== Wildcard Deadline Tests ===\n')

  // ── Test 1: Modification rejected when deadline has passed ────────────────
  console.log('Test 1: Modification rejected after deadline (effective_from = ROUND_OF_16, deadline July 4)')
  await resetAccount({
    wildcard_used: true,
    wildcard_effective_from: 'ROUND_OF_16',  // deadline 2026-07-04T17:00:00Z — past
    wildcard_old_team1: 'England', wildcard_old_team2: 'Netherlands',
    wildcard_old_team3: 'Mexico', wildcard_old_team4: 'Egypt', wildcard_old_team5: 'Iran',
    team1: 'England', team2: 'Netherlands', team3: 'Norway', team4: 'Egypt', team5: 'Cape Verde',
  })
  const r1 = await patch({ keepTeams: ['England', 'Netherlands'], newTeams: ['Norway', 'Egypt', 'Cape Verde'] })
  if (r1.error === 'Wildcard already used') pass('API returns "Wildcard already used"')
  else fail('Expected "Wildcard already used" error', r1)

  // ── Test 2: Modification allowed when deadline is still open ──────────────
  console.log('\nTest 2: Modification allowed before deadline (effective_from = QUARTER_FINALS, deadline July 9)')
  await resetAccount({
    wildcard_used: true,
    wildcard_effective_from: 'QUARTER_FINALS',  // deadline 2026-07-09T20:00:00Z — open
    wildcard_old_team1: 'England', wildcard_old_team2: 'Netherlands',
    wildcard_old_team3: 'Mexico', wildcard_old_team4: 'Egypt', wildcard_old_team5: 'Iran',
    team1: 'England', team2: 'Netherlands', team3: 'Norway', team4: 'Egypt', team5: 'Cape Verde',
  })
  const r2 = await patch({ keepTeams: ['England', 'Mexico'], newTeams: ['Norway', 'Egypt', 'Cape Verde'] })
  if (r2.error) fail('Expected success but got error', r2.error)
  else {
    pass('Modification accepted')
    const teams = [r2.team1, r2.team2, r2.team3, r2.team4, r2.team5].sort().join(',')
    const expected = ['England', 'Mexico', 'Norway', 'Egypt', 'Cape Verde'].sort().join(',')
    if (teams === expected) pass('New teams saved correctly')
    else fail('Team mismatch', { teams, expected })
    if (r2.wildcard_old_team1 === 'England') pass('wildcard_old_team* unchanged after modify')
    else fail('wildcard_old_team* was overwritten', r2.wildcard_old_team1)
    if (r2.wildcard_effective_from === 'QUARTER_FINALS') pass('effective_from unchanged after modify')
    else fail('effective_from changed', r2.wildcard_effective_from)
  }

  // ── Test 3: Events table has both wildcard_used + wildcard_modified rows ──
  console.log('\nTest 3: pick_events audit log correctness')
  // First use from Test 1 setup was a direct DB write (not via API), so events only from Test 2
  const { data: events } = await sb.from('pick_events').select('event_type').ilike('player_name', 'test Juan%').order('created_at')
  const types = (events ?? []).map((e: Record<string, string>) => e.event_type)
  if (types.includes('wildcard_modified')) pass(`Modification event logged (events: ${types.join(', ')})`)
  else fail('No wildcard_modified event found', types)

  // ── Test 4: Kept team not in original lineup is rejected ──────────────────
  console.log('\nTest 4: Kept team that is not in original lineup is rejected')
  // Account is currently: team1-5 = modified result, old_teams = England/Netherlands/Mexico/Egypt/Iran
  // Try to "keep" Norway — which was a swapped-in team, NOT in old lineup
  const r4 = await patch({ keepTeams: ['England', 'Norway'], newTeams: ['Mexico', 'Egypt', 'Cape Verde'] })
  if (r4.error?.toString().includes('original')) pass('Keeping non-original team rejected')
  else fail('Expected "original picks" error', r4)

  // ── Test 5: No wildcard → first use still works ───────────────────────────
  console.log('\nTest 5: First use still works when no wildcard has been used')
  await resetAccount()  // back to clean state, no wildcard
  const r5 = await patch({ keepTeams: ['England', 'Netherlands'], newTeams: ['Norway', 'Egypt', 'Cape Verde'] })
  if (r5.error) fail('Expected success on first use', r5.error)
  else {
    pass('First use accepted')
    if (r5.wildcard_used === true) pass('wildcard_used=true after first use')
    else fail('wildcard_used not set', r5.wildcard_used)
    if (r5.wildcard_effective_from === 'QUARTER_FINALS') pass(`effective_from set to QUARTER_FINALS`)
    else fail('Unexpected effective_from', r5.wildcard_effective_from)
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await resetAccount()
  console.log(`\n${failures === 0 ? '✅ All tests pass.' : `❌ ${failures} test(s) failed.`}\n`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
