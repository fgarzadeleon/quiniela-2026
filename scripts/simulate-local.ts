/**
 * Self-contained local simulation — no Supabase, no .env required.
 * Run: npx tsx scripts/simulate-local.ts
 *
 * Simulates the full 2026 World Cup in memory and prints the ranking
 * after each stage so you can verify the scoring logic end-to-end.
 */

// ── Pull in all shared logic (same code the app uses) ────────────────────────
import { GROUPS, allGroupMatches } from '../src/lib/tournament'
import { simulateMatch, buildStandings, advancing, makeKnockoutMatches } from '../src/lib/simulation'
import { calculatePickPoints } from '../src/lib/scoring'
import { TEAM_MAP } from '../src/lib/teams'
import type { Match, MatchStage, Pick } from '../src/types'

// ── Test participants ─────────────────────────────────────────────────────────
const TEST_PICKS: Omit<Pick, 'id' | 'created_at' | 'total_points'>[] = [
  { name: 'Fede (host)',      team1: 'Brazil',    team2: 'Colombia',      team3: 'Scotland',      team4: 'Tunisia',     total_cost: 0 },
  { name: 'Arturo (safe)',    team1: 'France',    team2: 'Belgium',       team3: 'Egypt',         team4: 'Qatar',       total_cost: 0 },
  { name: 'Rodrigo (chaos)',  team1: 'Scotland',  team2: 'Australia',     team3: 'Haiti',         team4: 'Curacao',     total_cost: 0 },
  { name: 'Elena (balanced)', team1: 'Germany',   team2: 'Morocco',       team3: 'Czech Republic',team4: 'New Zealand', total_cost: 0 },
  { name: 'Mateo (CONMEBOL)',team1: 'Argentina', team2: 'Colombia',      team3: 'Ecuador',       team4: 'Panama',      total_cost: 0 },
  { name: 'Sofía (Europa)',   team1: 'England',   team2: 'Norway',        team3: 'Sweden',        team4: 'Czech Republic', total_cost: 0 },
  { name: 'Pablo (gambler)',  team1: 'Japan',     team2: 'Senegal',       team3: 'Bosnia',        team4: 'Saudi Arabia',total_cost: 0 },
  { name: 'Carmen (host)',    team1: 'Mexico',    team2: 'USA',           team3: 'Canada',        team4: 'Panama',      total_cost: 0 },
]

// Compute costs
const picks: Pick[] = TEST_PICKS.map((p, i) => ({
  ...p,
  id: String(i),
  created_at: new Date().toISOString(),
  total_points: 0,
  total_cost: [p.team1, p.team2, p.team3, p.team4].reduce((s, t) => s + (TEAM_MAP.get(t)?.cost ?? 0), 0),
}))

// ── In-memory match store ─────────────────────────────────────────────────────
let matches: Match[] = []
let matchIdCounter = 0
function insertMatches(rows: Omit<Match, 'id'>[]) {
  for (const r of rows) matches.push({ ...r, id: String(matchIdCounter++) })
}
function finishMatch(id: string, hs: number, as_: number) {
  const m = matches.find(m => m.id === id)
  if (m) { m.home_score = hs; m.away_score = as_; m.status = 'FINISHED' }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const SEP = '─'.repeat(72)
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const gold  = (s: string) => `\x1b[33m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const red   = (s: string) => `\x1b[31m${s}\x1b[0m`
const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`

function printRanking(label: string) {
  const finished = matches.filter(m => m.status === 'FINISHED')
  const ranked = picks
    .map(p => ({ ...p, pts: calculatePickPoints(p, finished) }))
    .sort((a, b) => b.pts - a.pts)

  console.log(`\n${SEP}`)
  console.log(bold(gold(`  RANKING AFTER ${label.toUpperCase()}`)))
  console.log(SEP)
  ranked.forEach((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}. `
    const teams = [p.team1, p.team2, p.team3, p.team4].join(', ')
    const pts = String(p.pts).padStart(6)
    const name = p.name.padEnd(20)
    const line = `  ${medal} ${name} ${green(pts)} pts  ${dim(teams)}`
    console.log(i === 0 ? bold(line) : line)
  })
}

function printGroupStandings() {
  const finished = matches.filter(m => m.status === 'FINISHED' && m.stage === 'GROUP_STAGE')
  const standings = buildStandings(finished)
  console.log(`\n${SEP}`)
  console.log(bold('  GROUP STANDINGS'))
  console.log(SEP)
  for (const [g, table] of Object.entries(standings)) {
    const row = table.map((t, i) => {
      const adv = i < 2 ? green('↑') : dim('·')
      return `${adv} ${t.team.padEnd(16)} ${t.pts}pts  GD${t.gd >= 0 ? '+' : ''}${t.gd}`
    }).join('   ')
    console.log(`  Group ${g}: ${row}`)
  }
}

// ── Simulation ────────────────────────────────────────────────────────────────
function simRound(round: number) {
  const base = new Date('2026-06-11T16:00:00Z').getTime()
  const ranges: Record<number, [number, number]> = {
    1: [base,               base + 3 * 86400_000],
    2: [base + 4 * 86400_000, base + 8 * 86400_000],
    3: [base + 9 * 86400_000, base + 20 * 86400_000],
  }
  const [from, to] = ranges[round]
  const pending = matches.filter(m =>
    m.stage === 'GROUP_STAGE' && m.status === 'SCHEDULED' &&
    new Date(m.match_date).getTime() >= from && new Date(m.match_date).getTime() <= to
  )
  console.log(`\n  Simulating group stage round ${round} (${pending.length} matches)…`)
  for (const m of pending) {
    const r = simulateMatch(m.home_team, m.away_team)
    finishMatch(m.id, r.home_score, r.away_score)
    const hs = r.home_score, as_ = r.away_score
    const winner = hs > as_ ? m.home_team : as_ > hs ? m.away_team : null
    const line = `    ${m.home_team.padEnd(16)} ${hs}–${as_} ${m.away_team}`
    console.log(winner ? bold(line) : dim(line))
  }
}

function simKnockout(stage: string, startDate: Date) {
  let teams: string[]
  if (stage === 'ROUND_OF_32') {
    const fin = matches.filter(m => m.status === 'FINISHED' && m.stage === 'GROUP_STAGE')
    const standings = buildStandings(fin)
    teams = advancing(standings)
    console.log(`\n  ${teams.length} teams advance to Round of 32`)
  } else {
    const prev: Record<string, string> = {
      ROUND_OF_16: 'ROUND_OF_32', QUARTER_FINALS: 'ROUND_OF_16',
      SEMI_FINALS: 'QUARTER_FINALS', FINAL: 'SEMI_FINALS',
    }
    const fin = matches.filter(m => m.status === 'FINISHED' && m.stage === prev[stage])
    teams = fin.map(m => m.home_score > m.away_score ? m.home_team : m.away_team)
  }

  const newMatches = makeKnockoutMatches(teams, stage, startDate) as Omit<Match, 'id'>[]
  insertMatches(newMatches)

  const stageLabel = stage.replace('_', ' ')
  console.log(`\n  ${stageLabel} (${newMatches.length} matches)`)
  for (const m of newMatches) {
    const inserted = matches.find(x => x.home_team === m.home_team && x.away_team === m.away_team && x.stage === stage && x.status === 'SCHEDULED')!
    let { home_score: hs, away_score: as_ } = simulateMatch(m.home_team, m.away_team)
    if (hs === as_) { if (Math.random() > 0.5) hs++; else as_++ }
    finishMatch(inserted.id, hs, as_)
    const winner = hs > as_ ? m.home_team : m.away_team
    console.log(bold(`    ${m.home_team.padEnd(16)} ${hs}–${as_} ${m.away_team}  → ${green(winner)}`))
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(bold(gold('\n  🏆  QUINIELA 2026 — LOCAL SIMULATION\n')))
console.log('  Participants:')
picks.forEach(p => console.log(`    ${p.name.padEnd(22)} ${p.team1}, ${p.team2}, ${p.team3}, ${p.team4}  (${p.total_cost} pts budget)`))
console.log(`\n  Groups:`)
Object.entries(GROUPS).forEach(([g, t]) => console.log(`    Group ${g}: ${t.join(' · ')}`))

// Insert all group stage matches
insertMatches(allGroupMatches())
console.log(`\n  ${matches.length} group stage matches scheduled.`)

simRound(1); simRound(2); simRound(3)
printGroupStandings()
printRanking('Group Stage')

simKnockout('ROUND_OF_32',    new Date('2026-06-27T16:00:00Z'))
printRanking('Round of 32')

simKnockout('ROUND_OF_16',    new Date('2026-07-03T16:00:00Z'))
printRanking('Round of 16')

simKnockout('QUARTER_FINALS', new Date('2026-07-08T16:00:00Z'))
printRanking('Quarterfinals')

simKnockout('SEMI_FINALS',    new Date('2026-07-13T16:00:00Z'))
printRanking('Semifinals')

simKnockout('FINAL',          new Date('2026-07-19T16:00:00Z'))
printRanking('Final 🏆')

const champion = matches.find(m => m.stage === 'FINAL' && m.status === 'FINISHED')!
const winner = champion.home_score > champion.away_score ? champion.home_team : champion.away_team
console.log(`\n${SEP}`)
console.log(bold(gold(`  🏆  2026 WORLD CUP CHAMPION: ${winner.toUpperCase()}`)))
console.log(`${SEP}\n`)
