import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
const ADMIN_PW = process.env.ADMIN_PASSWORD ?? 'quiniela2026'

// football-data.org team name → our team name (for mismatches only)
const FD_TO_OURS: Record<string, string> = {
  'United States':      'USA',
  'Korea Republic':     'South Korea',
  "Côte d'Ivoire":      'Ivory Coast',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Czechia':            'Czech Republic',
  'Congo DR':           'DR Congo',
}

// football-data.org stage → our stage (handles variant spellings)
const STAGE_MAP: Record<string, string> = {
  GROUP_STAGE:    'GROUP_STAGE',
  LAST_32:        'ROUND_OF_32',
  ROUND_OF_32:    'ROUND_OF_32',
  LAST_16:        'ROUND_OF_16',
  ROUND_OF_16:    'ROUND_OF_16',
  QUARTER_FINALS: 'QUARTER_FINALS',
  SEMI_FINALS:    'SEMI_FINALS',
  FINAL:          'FINAL',
}

function ourName(fdName: string): string {
  return FD_TO_OURS[fdName] ?? fdName
}

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (password !== ADMIN_PW) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!FD_KEY) return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY not set' }, { status: 503 })

  const fdRes = await fetch(`${FD_BASE}/competitions/WC/matches`, {
    headers: { 'X-Auth-Token': FD_KEY },
    cache: 'no-store',
  })
  if (!fdRes.ok) {
    return NextResponse.json({ error: `football-data.org returned ${fdRes.status}` }, { status: 502 })
  }

  const { matches: fdMatches = [] } = await fdRes.json()
  const supabase = createServerClient()
  const log: string[] = []
  let updated = 0
  let inserted = 0
  let skipped = 0

  for (const m of fdMatches) {
    const ourStage = STAGE_MAP[m.stage]
    if (!ourStage) { skipped++; continue }

    const home = ourName(m.homeTeam?.name ?? '')
    const away = ourName(m.awayTeam?.name ?? '')
    if (!home || !away) { skipped++; continue }

    const homeScore: number | null = m.score?.fullTime?.home ?? null
    const awayScore: number | null = m.score?.fullTime?.away ?? null
    const isFinished = m.status === 'FINISHED' && homeScore != null && awayScore != null

    if (!isFinished) { skipped++; continue }

    // Look up existing row
    const { data: existing } = await supabase
      .from('matches')
      .select('id, status')
      .eq('home_team', home)
      .eq('away_team', away)
      .eq('stage', ourStage)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'FINISHED') { skipped++; continue }
      await supabase
        .from('matches')
        .update({ home_score: homeScore, away_score: awayScore, status: 'FINISHED' })
        .eq('id', existing.id)
      log.push(`✓ ${home} ${homeScore}–${awayScore} ${away}`)
      updated++
    } else if (ourStage !== 'GROUP_STAGE') {
      // Knockout fixture not yet in DB — insert it
      await supabase.from('matches').insert({
        home_team: home,
        away_team: away,
        home_score: homeScore,
        away_score: awayScore,
        status: 'FINISHED',
        stage: ourStage,
        match_date: m.utcDate,
      })
      log.push(`✓ [new] ${home} ${homeScore}–${awayScore} ${away}`)
      inserted++
    } else {
      log.push(`⚠ Group match not in DB: ${home} vs ${away} — run Init first`)
      skipped++
    }
  }

  const summary = `${updated} updated · ${inserted} new · ${skipped} skipped`
  return NextResponse.json({ log: [summary, ...log] })
}
