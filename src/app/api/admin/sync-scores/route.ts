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
  'Curaçao':            'Curacao',
  'Türkiye':            'Turkey',
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

  const fdJson = await fdRes.json()
  const fdMatches: unknown[] = fdJson.matches ?? []
  const supabase = createServerClient()
  const log: string[] = []
  let updated = 0
  let inserted = 0
  let skipped = 0
  let finished = 0

  log.push(`football-data.org returned ${fdMatches.length} matches total`)

  for (const m of fdMatches as Record<string, unknown>[]) {
    const ourStage = STAGE_MAP[(m.stage as string) ?? '']
    if (!ourStage) { skipped++; continue }

    const homeTeam = m.homeTeam as Record<string, string> | undefined
    const awayTeam = m.awayTeam as Record<string, string> | undefined
    const home = ourName(homeTeam?.name ?? '')
    const away = ourName(awayTeam?.name ?? '')
    if (!home || !away) { skipped++; continue }

    const score = m.score as Record<string, Record<string, number | null>> | undefined
    const homeScore: number | null = score?.fullTime?.home ?? null
    const awayScore: number | null = score?.fullTime?.away ?? null
    const isFinished = m.status === 'FINISHED' && homeScore != null && awayScore != null

    if (!isFinished) { skipped++; continue }
    finished++

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
      const { error } = await supabase
        .from('matches')
        .update({ home_score: homeScore, away_score: awayScore, status: 'FINISHED' })
        .eq('id', existing.id)
      if (error) { log.push(`✗ update failed: ${home} vs ${away}: ${error.message}`); continue }
      log.push(`✓ ${home} ${homeScore}–${awayScore} ${away}`)
      updated++
    } else {
      // Insert — works for both group stage and knockout fixtures
      const group = (m.group as string | undefined)?.replace('GROUP_', '') ?? null
      const { error } = await supabase.from('matches').insert({
        home_team: home,
        away_team: away,
        home_score: homeScore,
        away_score: awayScore,
        status: 'FINISHED',
        stage: ourStage,
        match_date: m.utcDate,
        ...(group && { group_name: group }),
      })
      if (error) { log.push(`✗ insert failed: ${home} vs ${away}: ${error.message}`); continue }
      log.push(`✓ [new] ${home} ${homeScore}–${awayScore} ${away}`)
      inserted++
    }
  }

  const summary = `${finished} finished matches found · ${updated} updated · ${inserted} inserted · ${skipped} skipped`
  return NextResponse.json({ log: [summary, ...log] })
}
