import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { allGroupMatches } from '@/lib/tournament'
import { simulateMatch, buildStandings, advancing, makeKnockoutMatches } from '@/lib/simulation'

export const dynamic = 'force-dynamic'

const ADMIN_PW = process.env.ADMIN_PASSWORD ?? 'quiniela2026'

async function simRound(supabase: ReturnType<typeof createServerClient>, round: number) {
  const base = new Date('2026-06-11T19:00:00Z').getTime()
  const ranges: Record<number, [Date, Date]> = {
    1: [new Date(base),                   new Date(base + 3 * 86400_000)],
    2: [new Date(base + 4 * 86400_000),   new Date(base + 8 * 86400_000)],
    3: [new Date(base + 9 * 86400_000),   new Date(base + 20 * 86400_000)],
  }
  const [from, to] = ranges[round]
  const { data: matches } = await supabase.from('matches').select('*')
    .eq('stage', 'GROUP_STAGE').eq('status', 'SCHEDULED')
    .gte('match_date', from.toISOString()).lte('match_date', to.toISOString())

  const log: string[] = []
  for (const m of matches ?? []) {
    const r = simulateMatch(m.home_team, m.away_team)
    await supabase.from('matches').update({ home_score: r.home_score, away_score: r.away_score, status: 'FINISHED' }).eq('id', m.id)
    log.push(`✓ ${m.home_team} ${r.home_score}–${r.away_score} ${m.away_team}`)
  }
  return log
}

async function simKnockout(supabase: ReturnType<typeof createServerClient>, stage: string, startDate: Date) {
  const log: string[] = []
  let teams: string[]

  if (stage === 'ROUND_OF_32') {
    const { data: gm } = await supabase.from('matches').select('*').eq('stage', 'GROUP_STAGE').eq('status', 'FINISHED')
    teams = advancing(buildStandings(gm ?? []))
    log.push(`${teams.length} teams advance to R32`)
  } else {
    const prev: Record<string, string> = {
      ROUND_OF_16: 'ROUND_OF_32', QUARTER_FINALS: 'ROUND_OF_16',
      SEMI_FINALS: 'QUARTER_FINALS', FINAL: 'SEMI_FINALS',
    }
    const { data: pm } = await supabase.from('matches').select('*').eq('stage', prev[stage]).eq('status', 'FINISHED')
    teams = (pm ?? []).map((m: { home_team: string; away_team: string; home_score: number; away_score: number }) =>
      m.home_score > m.away_score ? m.home_team : m.away_team
    )
  }

  const newMatches = makeKnockoutMatches(teams, stage, startDate)
  await supabase.from('matches').insert(newMatches)

  for (const m of newMatches) {
    let { home_score: hs, away_score: as_ } = simulateMatch(m.home_team, m.away_team)
    if (hs === as_) { if (Math.random() > 0.5) hs++; else as_++ }

    const { data: ins } = await supabase.from('matches').select('id')
      .eq('home_team', m.home_team).eq('away_team', m.away_team).eq('stage', stage).single()
    if (ins) await supabase.from('matches').update({ home_score: hs, away_score: as_, status: 'FINISHED' }).eq('id', ins.id)
    log.push(`✓ ${m.home_team} ${hs}–${as_} ${m.away_team}`)
  }
  return log
}

export async function POST(req: NextRequest) {
  const { action, password } = await req.json()
  if (password !== ADMIN_PW) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  let log: string[] = []

  switch (action) {
    case 'init': {
      const matches = allGroupMatches()
      const { error } = await supabase.from('matches').insert(matches)
      log = error ? [`✗ ${error.message}`] : [`✓ ${matches.length} group stage matches created`]
      break
    }
    case 'round1': log = await simRound(supabase, 1); break
    case 'round2': log = await simRound(supabase, 2); break
    case 'round3': log = await simRound(supabase, 3); break
    case 'r32':    log = await simKnockout(supabase, 'ROUND_OF_32',    new Date('2026-06-27T16:00:00Z')); break
    case 'r16':    log = await simKnockout(supabase, 'ROUND_OF_16',    new Date('2026-07-03T16:00:00Z')); break
    case 'qf':     log = await simKnockout(supabase, 'QUARTER_FINALS', new Date('2026-07-08T16:00:00Z')); break
    case 'sf':     log = await simKnockout(supabase, 'SEMI_FINALS',    new Date('2026-07-13T16:00:00Z')); break
    case 'final':  log = await simKnockout(supabase, 'FINAL',          new Date('2026-07-19T16:00:00Z')); break
    case 'reset': {
      const { error } = await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      log = error ? [`✗ ${error.message}`] : ['✓ All matches wiped']
      break
    }
    case 'full': {
      await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      const matches = allGroupMatches()
      await supabase.from('matches').insert(matches)
      log.push(`✓ ${matches.length} group stage matches created`)
      log.push('→ Round 1…'); log.push(...await simRound(supabase, 1))
      log.push('→ Round 2…'); log.push(...await simRound(supabase, 2))
      log.push('→ Round 3…'); log.push(...await simRound(supabase, 3))
      log.push('→ R32…');    log.push(...await simKnockout(supabase, 'ROUND_OF_32',    new Date('2026-06-27T16:00:00Z')))
      log.push('→ R16…');    log.push(...await simKnockout(supabase, 'ROUND_OF_16',    new Date('2026-07-03T16:00:00Z')))
      log.push('→ QF…');     log.push(...await simKnockout(supabase, 'QUARTER_FINALS', new Date('2026-07-08T16:00:00Z')))
      log.push('→ SF…');     log.push(...await simKnockout(supabase, 'SEMI_FINALS',    new Date('2026-07-13T16:00:00Z')))
      log.push('→ Final…');  log.push(...await simKnockout(supabase, 'FINAL',          new Date('2026-07-19T16:00:00Z')))
      break
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  return NextResponse.json({ log })
}
