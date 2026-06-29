import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { FD_TO_OURS } from '@/lib/teams'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
const ADMIN_PW = process.env.ADMIN_PASSWORD

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

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (!ADMIN_PW || password !== ADMIN_PW) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  let updated = 0, inserted = 0, skipped = 0, finished = 0

  log.push(`football-data.org returned ${fdMatches.length} matches total`)

  // Batch-fetch all existing matches once to avoid O(N) sequential queries
  const { data: existingRows } = await supabase
    .from('matches')
    .select('id, home_team, away_team, stage, status')
  const existingMap = new Map<string, { id: string; status: string }>()
  for (const row of existingRows ?? []) {
    existingMap.set(`${row.home_team}|${row.away_team}|${row.stage}`, { id: row.id, status: row.status })
  }

  for (const m of fdMatches as Record<string, unknown>[]) {
    const ourStage = STAGE_MAP[(m.stage as string) ?? '']
    if (!ourStage) { skipped++; continue }

    const homeTeam = m.homeTeam as Record<string, string> | undefined
    const awayTeam = m.awayTeam as Record<string, string> | undefined
    const home = FD_TO_OURS[homeTeam?.name ?? ''] ?? homeTeam?.name ?? ''
    const away = FD_TO_OURS[awayTeam?.name ?? ''] ?? awayTeam?.name ?? ''
    if (!home || !away) { skipped++; continue }

    const score = m.score as Record<string, Record<string, number | null>> | undefined
    const homeScore: number | null = score?.fullTime?.home ?? null
    const awayScore: number | null = score?.fullTime?.away ?? null
    const isFinished = m.status === 'FINISHED' && homeScore != null && awayScore != null

    if (!isFinished) { skipped++; continue }
    finished++

    const existing = existingMap.get(`${home}|${away}|${ourStage}`)
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
