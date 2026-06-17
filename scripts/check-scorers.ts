/**
 * Check that each player's scorers belong to their selected teams.
 * Fetches squad data from football-data.org and fuzzy-matches scorer names.
 *
 * Run: npx tsx scripts/check-scorers.ts
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

const NAME_MAP: Record<string, string> = {
  'USA':                    'United States',
  'South Korea':            'Korea Republic',
  'Ivory Coast':            "Côte d'Ivoire",
  'Bosnia and Herzegovina': 'Bosnia-Herzegovina',
  'Czech Republic':         'Czechia',
  'DR Congo':               'Congo DR',
  'Curacao':                'Curaçao',
  'Turkey':                 'Türkiye',
  'Cape Verde':             'Cape Verde Islands',
}

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function scorerMatchesSquad(scorerName: string, squadNames: string[]): boolean {
  const sn = norm(scorerName)
  const sLast = sn.split(/\s+/).at(-1) ?? ''
  for (const name of squadNames) {
    const fn = norm(name)
    const fLast = fn.split(/\s+/).at(-1) ?? ''
    if (fn === sn) return true
    if (sn.length > 3 && fn.includes(sn)) return true
    if (sn.length > 3 && sn.includes(fn)) return true
    if (sLast.length > 3 && sLast === fLast) return true
  }
  return false
}

async function main() {
  // 1. Fetch all real picks
  const { data: picks, error } = await supabase
    .from('picks')
    .select('name, team1, team2, team3, team4, team5, scorer1, scorer2, scorer3')
    .order('name')

  if (error || !picks) { console.error('Supabase error:', error); process.exit(1) }

  const realPicks = picks.filter(p => !p.name.toLowerCase().startsWith('test'))
  console.log(`\nChecking ${realPicks.length} entries...\n`)

  // 2. Fetch all WC teams + squads from football-data.org (single call)
  const res = await fetch(`${FD_BASE}/competitions/WC/teams?season=2026`, {
    headers: { 'X-Auth-Token': FD_KEY },
  })
  if (!res.ok) { console.error('FD API error:', await res.text()); process.exit(1) }

  const { teams: fdTeams } = await res.json() as {
    teams: Array<{ name: string; shortName: string; squad: Array<{ name: string; position: string }> }>
  }

  // Build a map: our team name → list of player names
  function getSquad(ourName: string): string[] {
    const fdName = NAME_MAP[ourName] ?? ourName
    const fdTeam = fdTeams.find(t => t.name === fdName || t.shortName === fdName || t.name === ourName)
    return (fdTeam?.squad ?? []).map(p => p.name)
  }

  // 3. Check each pick
  const issues: Array<{ player: string; scorer: string; scorerSlot: string; teams: string[]; reason: string }> = []

  for (const pick of realPicks) {
    const teams = [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5].filter(Boolean)
    const allSquadPlayers = teams.flatMap(t => getSquad(t))

    const scorers = [
      { slot: 'scorer1', name: pick.scorer1 },
      { slot: 'scorer2', name: pick.scorer2 },
      { slot: 'scorer3', name: pick.scorer3 },
    ].filter(s => s.name)

    for (const { slot, name } of scorers) {
      if (!scorerMatchesSquad(name!, allSquadPlayers)) {
        issues.push({
          player: pick.name,
          scorer: name!,
          scorerSlot: slot,
          teams,
          reason: allSquadPlayers.length === 0 ? 'squad not found in FD' : 'not in any selected team squad',
        })
      }
    }
  }

  // 4. Report
  if (issues.length === 0) {
    console.log('✅  All scorers are valid — everyone picked players from their own teams.\n')
    return
  }

  console.log(`❌  Found ${issues.length} invalid scorer${issues.length > 1 ? 's' : ''}:\n`)
  console.log('─'.repeat(72))

  const byPlayer = new Map<string, typeof issues>()
  for (const issue of issues) {
    if (!byPlayer.has(issue.player)) byPlayer.set(issue.player, [])
    byPlayer.get(issue.player)!.push(issue)
  }

  for (const [player, playerIssues] of byPlayer) {
    const teams = playerIssues[0].teams
    console.log(`\n👤  ${player}`)
    console.log(`    Teams: ${teams.join(', ')}`)
    for (const { scorer, scorerSlot, reason } of playerIssues) {
      console.log(`    ❌  ${scorerSlot}: "${scorer}"  →  ${reason}`)
    }
  }

  console.log('\n' + '─'.repeat(72))
  console.log('\nSQL to null out invalid scorers (run manually after reviewing):\n')

  for (const [player, playerIssues] of byPlayer) {
    const sets = playerIssues.map(i => `${i.scorerSlot} = NULL`).join(', ')
    console.log(`UPDATE picks SET ${sets} WHERE name = '${player}';`)
  }

  console.log()
}

main().catch(err => { console.error(err); process.exit(1) })
