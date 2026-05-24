/**
 * Seed fake participants for simulation testing.
 * Run: npx tsx scripts/seed-picks.ts
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
 */

import { config } from 'dotenv'
import path from 'path'
config({ path: path.resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Diverse picks that cover different strategies
const TEST_PICKS = [
  { name: 'Fede (host)',      team1: 'Brazil',    team2: 'Colombia',  team3: 'Scotland',   team4: 'Tunisia',    scorer1: 'Vinicius Jr', scorer2: 'Díaz', scorer3: 'McTominay' },
  { name: 'Arturo (safe)',    team1: 'France',    team2: 'Belgium',   team3: 'Egypt',      team4: 'Qatar',      scorer1: 'Mbappé',     scorer2: 'De Bruyne', scorer3: 'Salah' },
  { name: 'Rodrigo (chaos)',  team1: 'Scotland',  team2: 'Australia', team3: 'Haiti',      team4: 'Curacao',    scorer1: 'Adams',      scorer2: 'Duke',  scorer3: 'unknown' },
  { name: 'Elena (balanced)', team1: 'Germany',   team2: 'Morocco',   team3: 'Czech Republic', team4: 'New Zealand', scorer1: 'Wirtz', scorer2: 'Ziyech', scorer3: 'Schick' },
  { name: 'Mateo (CONMEBOL)', team1: 'Argentina', team2: 'Colombia',  team3: 'Ecuador',    team4: 'Panama',     scorer1: 'Messi',      scorer2: 'Díaz',  scorer3: 'Valencia' },
  { name: 'Sofía (Europa)',   team1: 'England',   team2: 'Norway',    team3: 'Sweden',     team4: 'Czech Republic', scorer1: 'Kane',   scorer2: 'Haaland', scorer3: 'Schick' },
  { name: 'Pablo (gambler)',  team1: 'Japan',     team2: 'Senegal',   team3: 'Bosnia',     team4: 'Saudi Arabia', scorer1: 'Minamino', scorer2: 'Dia', scorer3: 'Džeko' },
  { name: 'Carmen (host)',    team1: 'Mexico',    team2: 'USA',       team3: 'Canada',     team4: 'Panama',     scorer1: 'Jiménez', scorer2: 'Pulisic', scorer3: 'David' },
]

async function computeCost(teams: string[]) {
  const { TEAM_MAP } = await import('../src/lib/teams.js')
  return teams.reduce((s, t) => s + (TEAM_MAP.get(t)?.cost ?? 0), 0)
}

async function main() {
  console.log('Seeding test picks…')

  // Clear existing test picks first
  await supabase.from('picks').delete().like('name', '%(host)').or('name.like.%(safe),name.like.%(chaos),name.like.%(balanced),name.like.%(CONMEBOL),name.like.%(Europa),name.like.%(gambler)')

  for (const p of TEST_PICKS) {
    const teams = [p.team1, p.team2, p.team3, p.team4]
    const cost = await computeCost(teams)

    const { error } = await supabase.from('picks').insert({
      name: p.name, email: null,
      team1: p.team1, team2: p.team2, team3: p.team3, team4: p.team4,
      scorer1: p.scorer1, scorer2: p.scorer2, scorer3: p.scorer3,
      total_cost: cost,
    })
    if (error) console.error(`  ✗ ${p.name}:`, error.message)
    else console.log(`  ✓ ${p.name} (${cost} pts)`)
  }
  console.log('Done.')
}

main().catch(console.error)
