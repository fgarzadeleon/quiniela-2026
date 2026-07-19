import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getTeam, FD_TO_OURS, SCORING, STAGE_ORDER } from '@/lib/teams'
import { computeGroupQualifiers } from '@/lib/scoring'
import { AUDIT_STAGE_KEYS, activeTeamsForPick } from '@/lib/audit'
import { Match, Pick } from '@/types'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

const STAGE_MAP: Record<string, Match['stage']> = {
  GROUP_STAGE:    'GROUP_STAGE',
  LAST_32:        'ROUND_OF_32',
  ROUND_OF_32:    'ROUND_OF_32',
  LAST_16:        'ROUND_OF_16',
  ROUND_OF_16:    'ROUND_OF_16',
  QUARTER_FINALS: 'QUARTER_FINALS',
  SEMI_FINALS:    'SEMI_FINALS',
  THIRD_PLACE:    'THIRD_PLACE',
  FINAL:          'FINAL',
}

const SK_TO_PERIOD: Record<string, string> = {
  GS_MD1: 'MD1', GS_MD2: 'MD2', GS_MD3: 'MD3',
  ROUND_OF_32: 'R32', ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', THIRD_PLACE: '3rd', FINAL: 'Final',
}

const KO_SK_ORDER = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'] as const
type KoSk = typeof KO_SK_ORDER[number]


export async function GET() {
  if (!FD_KEY) return NextResponse.json({ periods: [], players: [] })

  const supabase = createServerClient()
  const [fdRes, { data: rawPicks }] = await Promise.all([
    fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 60 },
    }).then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] })),
    supabase.from('picks').select('*').not('name', 'ilike', 'test%'),
  ])

  const { matches: fdMatches = [] } = fdRes as { matches: Record<string, unknown>[] }
  const picks = (rawPicks ?? []) as Pick[]

  const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
  const processed: (Match & { matchday?: number | null })[] = []

  for (const m of fdMatches) {
    const fdStatus = m.status as string
    if (fdStatus === 'TIMED' || fdStatus === 'SCHEDULED' || fdStatus === 'POSTPONED') continue
    const homeTeam = m.homeTeam as Record<string, string>
    const awayTeam = m.awayTeam as Record<string, string>
    const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
    const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
    if (!home || !away) continue
    const score = m.score as Record<string, Record<string, number | null>>
    const duration = (m.score as Record<string, unknown>)?.duration as string | undefined
    const isPSO = duration === 'PENALTY_SHOOTOUT'
    const hg = isPSO ? (score?.fullTime?.home ?? 0) - (score?.penalties?.home ?? 0) : score?.fullTime?.home
    const ag = isPSO ? (score?.fullTime?.away ?? 0) - (score?.penalties?.away ?? 0) : score?.fullTime?.away
    const winner = (m.score as Record<string, unknown>)?.winner as string | null
    const stage = STAGE_MAP[m.stage as string]
    if (hg == null || ag == null || !stage) continue
    processed.push({
      id: String(m.id),
      home_team: home, away_team: away,
      home_score: hg, away_score: ag,
      status: LIVE.has(fdStatus) ? 'IN_PLAY' : 'FINISHED',
      match_date: m.utcDate as string, stage,
      group_name: (m.group as string | undefined)?.replace('GROUP_', ''),
      winner,
      matchday: m.matchday as number | null ?? null,
    } as Match & { matchday?: number | null })
  }

  // Precompute: per-team per-stageKey match points and win status
  const teamMatchPts = new Map<string, Map<string, number>>()   // team → stageKey → matchPts
  const teamWonStage  = new Map<string, Set<string>>()           // team → Set<stageKey> they won

  for (const m of processed) {
    const md = (m as { matchday?: number | null }).matchday
    const sk = m.stage === 'GROUP_STAGE' ? `GS_MD${md ?? '?'}` : m.stage

    for (const [teamName, isHome] of [[m.home_team, true], [m.away_team, false]] as [string, boolean][]) {
      const team = getTeam(teamName)
      if (!team) continue
      const s = SCORING[team.tier]
      const gf = isHome ? m.home_score : m.away_score
      const ga = isHome ? m.away_score : m.home_score
      const base = gf > ga ? s.win : gf < ga ? s.loss : s.draw
      // 3rd place match: win/draw/loss counts for half, goals stay full value
      const resultPts = m.stage === 'THIRD_PLACE' ? base / 2 : base
      const mPts = resultPts + gf * s.goalFor + ga * s.goalAgainst

      if (!teamMatchPts.has(teamName)) teamMatchPts.set(teamName, new Map())
      const skMap = teamMatchPts.get(teamName)!
      skMap.set(sk, (skMap.get(sk) ?? 0) + mPts)

      const won = gf > ga || (gf === ga && m.winner === (isHome ? 'HOME_TEAM' : 'AWAY_TEAM'))
      if (won) {
        if (!teamWonStage.has(teamName)) teamWonStage.set(teamName, new Set())
        teamWonStage.get(teamName)!.add(sk)
      }
    }
  }

  // Precompute group qualifiers and which GS matchday they qualified on
  const groupMatches = processed.filter(m => m.stage === 'GROUP_STAGE')
  const groupQualifiers = computeGroupQualifiers(groupMatches)
  const teamQualSk = new Map<string, string>() // team → GS_MD{n} they clinched on
  for (const [team, qualDate] of groupQualifiers) {
    const qualMs = qualDate.getTime()
    const qualMatch = processed.find(m =>
      m.stage === 'GROUP_STAGE' &&
      (m.home_team === team || m.away_team === team) &&
      Math.abs(new Date(m.match_date).getTime() - qualMs) < 60_000
    )
    const md = qualMatch ? (qualMatch as { matchday?: number | null }).matchday : null
    teamQualSk.set(team, md ? `GS_MD${md}` : 'GS_MD3')
  }

  const activeSks = AUDIT_STAGE_KEYS.filter(sk => {
    if (sk.startsWith('GS_')) {
      const md = sk.slice(3)  // 'MD1', 'MD2', 'MD3'
      return processed.some(m => m.stage === 'GROUP_STAGE' && (m as { matchday?: number | null }).matchday === parseInt(md.slice(2)))
    }
    return processed.some(m => m.stage === sk)
  })

  const players = picks.map(pick => {
    // For each team, find the first KO stage where this player holds them and they have a match.
    // At that first stage we credit ALL advances for stages the team won at or before it
    // (catching up advances for stages won before the player acquired the team via wildcard).
    // At subsequent stages we credit only the advance for winning that specific stage.
    const firstKoHeld = new Map<string, KoSk>()
    for (const koSk of KO_SK_ORDER) {
      for (const team of activeTeamsForPick(pick, koSk)) {
        if (!firstKoHeld.has(team) && (teamMatchPts.get(team)?.has(koSk) ?? false)) {
          firstKoHeld.set(team, koSk)
        }
      }
    }

    const earned = activeSks.map(sk => {
      const teams = activeTeamsForPick(pick, sk)
      let pts = 0

      for (const team of teams) {
        const team_obj = getTeam(team)
        if (!team_obj) continue
        const s = SCORING[team_obj.tier]

        const hasMatch = teamMatchPts.get(team)?.has(sk) ?? false
        if (!hasMatch) continue

        pts += teamMatchPts.get(team)!.get(sk)!

        if (sk.startsWith('GS_')) {
          if (teamQualSk.get(team) === sk) pts += s.advanceRound
        } else {
          const first = firstKoHeld.get(team)
          if (first === sk) {
            // First KO stage player holds this team: catch-up advances for won stages from
            // `first` onwards only (not before — wildcard players don't earn credit for wins
            // that happened before they acquired the team).
            for (const koS of KO_SK_ORDER) {
              if (KO_SK_ORDER.indexOf(koS) > KO_SK_ORDER.indexOf(sk)) break
              if (KO_SK_ORDER.indexOf(koS) < KO_SK_ORDER.indexOf(first)) continue
              // 3rd place match is a consolation game, not an advancement — no bonus either way.
              if (koS !== 'THIRD_PLACE' && teamWonStage.get(team)?.has(koS)) {
                pts += koS === 'FINAL' ? s.champion : s.advanceRound
              }
            }
          } else {
            // Subsequent stage: only advance for winning this specific stage
            if (sk !== 'THIRD_PLACE' && teamWonStage.get(team)?.has(sk)) {
              pts += sk === 'FINAL' ? s.champion : s.advanceRound
            }
          }
        }
      }

      return pts
    })

    return {
      name: pick.name,
      total: earned.reduce((s, v) => s + v, 0),
      earned,
    }
  }).sort((a, b) => b.total - a.total)

  return NextResponse.json({
    periods: activeSks.map(sk => SK_TO_PERIOD[sk]),
    players,
  })
}
