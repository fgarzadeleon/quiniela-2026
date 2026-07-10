/**
 * Invariant test: for every player, sum of team pill points must equal total_points.
 *
 *   sum(team_points) + sum(old_team_points) + host_bonus == total_points
 *
 * Run: npx tsx scripts/test-points-breakdown.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FOOTBALL_DATA_API_KEY in .env.local
 */

import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import {
  calculatePickPoints,
  calculatePickPointsBreakdown,
  calculateOldTeamPointsBreakdown,
  WILDCARD_DEADLINES,
} from '../src/lib/scoring'
import { FD_TO_OURS } from '../src/lib/teams'
import type { Match, Pick } from '../src/types'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY  = process.env.FOOTBALL_DATA_API_KEY!

const STAGE_MAP: Record<string, Match['stage']> = {
  GROUP_STAGE:    'GROUP_STAGE',
  LAST_32:        'ROUND_OF_32',
  ROUND_OF_32:    'ROUND_OF_32',
  LAST_16:        'ROUND_OF_16',
  ROUND_OF_16:    'ROUND_OF_16',
  QUARTER_FINALS: 'QUARTER_FINALS',
  SEMI_FINALS:    'SEMI_FINALS',
  FINAL:          'FINAL',
}

const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])

async function fetchMatches(): Promise<Match[]> {
  const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
    headers: { 'X-Auth-Token': FD_KEY },
  })
  if (!res.ok) throw new Error(`FD API ${res.status}`)
  const { matches = [] } = await res.json()
  const result: Match[] = []
  for (const m of matches as Record<string, unknown>[]) {
    const status = m.status as string
    if (status !== 'FINISHED' && !LIVE.has(status)) continue
    const score  = m.score as Record<string, Record<string, number | null>>
    const hg     = score?.extraTime?.home ?? score?.fullTime?.home
    const ag     = score?.extraTime?.away ?? score?.fullTime?.away
    if (hg == null || ag == null) continue
    const home  = (FD_TO_OURS as Record<string,string>)[(m.homeTeam as Record<string,string>)?.name] ?? (m.homeTeam as Record<string,string>)?.name ?? ''
    const away  = (FD_TO_OURS as Record<string,string>)[(m.awayTeam as Record<string,string>)?.name] ?? (m.awayTeam as Record<string,string>)?.name ?? ''
    const stage = STAGE_MAP[m.stage as string]
    const winner = (m.score as Record<string, unknown>)?.winner as string | null
    if (!home || !away || !stage) continue
    result.push({
      id: String(m.id), home_team: home, away_team: away,
      home_score: hg, away_score: ag,
      status: LIVE.has(status) ? 'IN_PLAY' : 'FINISHED',
      match_date: m.utcDate as string, stage,
      group_name: (m.group as string | undefined)?.replace('GROUP_', ''),
      winner,
    } as Match)
  }
  return result
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('Fetching picks and matches…')
  const [{ data: picksRaw }, matches] = await Promise.all([
    supabase.from('picks').select('*').not('name', 'ilike', 'test%'),
    fetchMatches(),
  ])
  const picks = (picksRaw ?? []) as Pick[]

  // Host answers for bonus
  const { data: hostAnswers } = await supabase.from('host_answers').select('key, value')
  const { data: hostPreds }   = await supabase.from('host_predictions').select('*')
  const KEYS = ['dirtiest', 'best', 'worst', 'most_goals_for', 'most_goals_against']
  const answers   = Object.fromEntries((hostAnswers ?? []).map((a: { key: string; value: string | null }) => [a.key, a.value]))
  const predMap   = Object.fromEntries((hostPreds   ?? []).map((p: Record<string,string>) => [p.pick_id, p]))

  const now = new Date()
  let failures = 0

  console.log(`\nChecking ${picks.length} players against ${matches.length} matches…\n`)

  for (const pick of picks) {
    // Determine if wildcard is still pending
    const isWcPending = !!(pick.wildcard_used && pick.wildcard_effective_from && (() => {
      const d = WILDCARD_DEADLINES.find(d => d.effectiveStage === pick.wildcard_effective_from)
      return d ? now < d.deadline : false
    })())

    const total = calculatePickPoints(pick, matches)

    // host bonus
    const pred = predMap[pick.id]
    const host_bonus = pred
      ? KEYS.reduce((s, k) => s + (answers[k] && pred[k] === answers[k] ? 100 : 0), 0)
      : 0

    let team_sum = 0
    let old_sum  = 0

    if (isWcPending) {
      // Pending wildcard: show old lineup
      const oldPick: Pick = {
        ...pick,
        team1: pick.wildcard_old_team1 ?? pick.team1,
        team2: pick.wildcard_old_team2 ?? pick.team2,
        team3: pick.wildcard_old_team3 ?? pick.team3,
        team4: pick.wildcard_old_team4 ?? pick.team4,
        team5: pick.wildcard_old_team5 ?? pick.team5,
        wildcard_used: false,
        wildcard_effective_from: undefined,
      }
      const bd = calculatePickPointsBreakdown(oldPick, matches)
      team_sum = bd.reduce((s, t) => s + t.points, 0)
    } else {
      const bd    = calculatePickPointsBreakdown(pick, matches)
      const oldBd = calculateOldTeamPointsBreakdown(pick, matches)
      team_sum = bd.reduce((s, t) => s + t.points, 0)
      old_sum  = oldBd.reduce((s, t) => s + t.points, 0)
    }

    // Invariant: calculatePickPoints (match/advance pts only) == sum of pills (team + old).
    // host_bonus is separate and additive — both total and expected include it, so it cancels.
    const expected = team_sum + old_sum
    const gap      = total - expected

    if (gap !== 0) {
      failures++
      console.error(`FAIL  ${pick.name.padEnd(30)} calcPts=${total}  pills=${team_sum}+${old_sum}  host=${host_bonus}  GAP=${gap}`)
      const bd = calculatePickPointsBreakdown(pick, matches)
      for (const t of bd) console.error(`      ${t.name}: ${t.points}`)
    } else {
      console.log(`OK    ${pick.name.padEnd(30)} calcPts=${total}  pills=${team_sum}+${old_sum}  host=${host_bonus}  api_total=${total + host_bonus}`)
    }
  }

  console.log(`\n${failures === 0 ? '✅ All players pass.' : `❌ ${failures} player(s) failed.`}`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
