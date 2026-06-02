/**
 * Simulate the 2026 World Cup tournament in Supabase.
 * Run one stage at a time:
 *   npx tsx scripts/simulate.ts init       — insert all group stage matches (SCHEDULED)
 *   npx tsx scripts/simulate.ts round 1    — finish group-stage round 1
 *   npx tsx scripts/simulate.ts round 2    — finish group-stage round 2
 *   npx tsx scripts/simulate.ts round 3    — finish group-stage round 3
 *   npx tsx scripts/simulate.ts r32        — simulate Round of 32
 *   npx tsx scripts/simulate.ts r16        — simulate Round of 16
 *   npx tsx scripts/simulate.ts qf         — simulate Quarterfinals
 *   npx tsx scripts/simulate.ts sf         — simulate Semifinals
 *   npx tsx scripts/simulate.ts final      — simulate Final
 *   npx tsx scripts/simulate.ts reset      — wipe all matches
 *   npx tsx scripts/simulate.ts full       — run everything at once
 */

import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function importLib() {
  const [t, s] = await Promise.all([
    import('../src/lib/tournament.js'),
    import('../src/lib/simulation.js'),
  ])
  return { ...t, ...s }
}

async function init() {
  const { allGroupMatches } = await importLib()
  const matches = allGroupMatches()
  console.log(`Inserting ${matches.length} group stage matches…`)
  const { error } = await supabase.from('matches').insert(matches)
  if (error) console.error('Error:', error.message)
  else console.log('✓ Group stage matches created')
}

async function finishRound(round: number) {
  const { simulateMatch } = await importLib()

  // Fetch scheduled group-stage matches for this round
  // We stored _round in the match data but Supabase doesn't have that column.
  // Instead, use match_date ranges: round 1 = day 0-3, round 2 = day 4-8, round 3 = day 9+
  const base = new Date('2026-06-11T00:00:00Z').getTime()
  const ranges: Record<number, [Date, Date]> = {
    1: [new Date(base),                    new Date(base + 7 * 86400_000)],   // Jun 11–17
    2: [new Date(base + 7 * 86400_000),    new Date(base + 13 * 86400_000)],  // Jun 18–23
    3: [new Date(base + 13 * 86400_000),   new Date(base + 20 * 86400_000)],  // Jun 24–27
  }
  const [from, to] = ranges[round]

  const { data: matches, error: fe } = await supabase
    .from('matches')
    .select('*')
    .eq('stage', 'GROUP_STAGE')
    .eq('status', 'SCHEDULED')
    .gte('match_date', from.toISOString())
    .lte('match_date', to.toISOString())

  if (fe) { console.error(fe.message); return }
  if (!matches?.length) { console.log('No scheduled matches found for this round.'); return }

  console.log(`Simulating ${matches.length} matches (group stage round ${round})…`)
  for (const m of matches) {
    const result = simulateMatch(m.home_team, m.away_team)
    const { error } = await supabase.from('matches').update({
      home_score: result.home_score,
      away_score: result.away_score,
      status: 'FINISHED',
    }).eq('id', m.id)
    if (error) console.error(`  ✗ ${m.home_team} v ${m.away_team}:`, error.message)
    else console.log(`  ✓ ${m.home_team} ${result.home_score}–${result.away_score} ${m.away_team}`)
  }
}

async function simulateKnockout(stage: string, startDate: Date) {
  const { buildStandings, advancing, simulateMatch, makeKnockoutMatches } = await importLib()

  let teams: string[]

  if (stage === 'ROUND_OF_32') {
    // Compute who advances from groups
    const { data: gm } = await supabase.from('matches').select('*').eq('stage', 'GROUP_STAGE').eq('status', 'FINISHED')
    const standings = buildStandings(gm ?? [])
    teams = advancing(standings)
    console.log(`${teams.length} teams advance to R32`)
  } else {
    // Winners of the previous stage
    const prevStage: Record<string, string> = {
      ROUND_OF_16: 'ROUND_OF_32',
      QUARTER_FINALS: 'ROUND_OF_16',
      SEMI_FINALS: 'QUARTER_FINALS',
      FINAL: 'SEMI_FINALS',
    }
    const { data: prev } = await supabase.from('matches').select('*').eq('stage', prevStage[stage]).eq('status', 'FINISHED')
    teams = (prev ?? []).map((m: {home_team: string; away_team: string; home_score: number; away_score: number}) =>
      m.home_score > m.away_score ? m.home_team : m.away_team
    )
  }

  // Insert matches
  const newMatches = makeKnockoutMatches(teams, stage, startDate)
  await supabase.from('matches').insert(newMatches)

  // Immediately simulate them
  for (const m of newMatches) {
    const result = simulateMatch(m.home_team, m.away_team)
    // Knockouts can't draw — if tied, home team wins on penalties (simplified)
    let hs = result.home_score, as = result.away_score
    if (hs === as) { if (Math.random() > 0.5) hs++ ; else as++ }

    const { data: inserted } = await supabase.from('matches').select('id')
      .eq('home_team', m.home_team).eq('away_team', m.away_team).eq('stage', stage).single()
    if (inserted) {
      await supabase.from('matches').update({ home_score: hs, away_score: as, status: 'FINISHED' }).eq('id', inserted.id)
    }
    console.log(`  ✓ ${m.home_team} ${hs}–${as} ${m.away_team}`)
  }
}

async function reset() {
  const { error } = await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) console.error(error.message)
  else console.log('✓ All matches wiped')
}

async function printRanking() {
  const [{ data: picks }, { data: matches }] = await Promise.all([
    supabase.from('picks').select('*'),
    supabase.from('matches').select('*').eq('status', 'FINISHED'),
  ])
  const { calculatePickPoints } = await import('../src/lib/scoring.js')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ranked = (picks ?? []).map((p: any) => ({ ...p, pts: calculatePickPoints(p, matches ?? []) }))
    .sort((a: { pts: number }, b: { pts: number }) => b.pts - a.pts)
  console.log('\n── Current Ranking ──')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ranked.forEach((p: any, i: number) => {
    console.log(`  ${i + 1}. ${p.name} — ${p.pts} pts  [${p.team1}, ${p.team2}, ${p.team3}, ${p.team4}]`)
  })
}

async function main() {
  const cmd = process.argv[2]

  switch (cmd) {
    case 'init':   await init(); break
    case 'round':  await finishRound(Number(process.argv[3])); break
    case 'r32':    await simulateKnockout('ROUND_OF_32',    new Date('2026-06-27T16:00:00Z')); break
    case 'r16':    await simulateKnockout('ROUND_OF_16',    new Date('2026-07-03T16:00:00Z')); break
    case 'qf':     await simulateKnockout('QUARTER_FINALS', new Date('2026-07-08T16:00:00Z')); break
    case 'sf':     await simulateKnockout('SEMI_FINALS',    new Date('2026-07-13T16:00:00Z')); break
    case 'final':  await simulateKnockout('FINAL',          new Date('2026-07-19T16:00:00Z')); break
    case 'reset':  await reset(); break
    case 'full':
      await reset()
      await init()
      await finishRound(1); await printRanking()
      await finishRound(2); await printRanking()
      await finishRound(3); await printRanking()
      await simulateKnockout('ROUND_OF_32',    new Date('2026-06-27T16:00:00Z'))
      await simulateKnockout('ROUND_OF_16',    new Date('2026-07-03T16:00:00Z'))
      await simulateKnockout('QUARTER_FINALS', new Date('2026-07-08T16:00:00Z'))
      await simulateKnockout('SEMI_FINALS',    new Date('2026-07-13T16:00:00Z'))
      await simulateKnockout('FINAL',          new Date('2026-07-19T16:00:00Z'))
      await printRanking()
      break
    default:
      console.log('Usage: npx tsx scripts/simulate.ts <init|round <1-3>|r32|r16|qf|sf|final|reset|full>')
  }
}

main().catch(console.error)
