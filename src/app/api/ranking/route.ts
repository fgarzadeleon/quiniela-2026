import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculatePickPoints, calculatePickPointsBreakdown, calculateOldTeamPointsBreakdown, WILDCARD_DEADLINES } from '@/lib/scoring'
import { getTeam, SCORING, STAGE_ORDER } from '@/lib/teams'
import { Match, Pick } from '@/types'

export const dynamic = 'force-dynamic'

const DEADLINE = new Date('2026-06-11T19:00:00Z')
const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

function norm(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Fuzzy match: exact normalized, last-name match, or FD name contains pick name
function lookupScorer(pickName: string, goalsMap: Map<string, number>): { goals: number; matched: boolean } {
  const pn = norm(pickName)
  if (goalsMap.has(pn)) return { goals: goalsMap.get(pn)!, matched: true }
  const pLast = pn.split(/\s+/).at(-1) ?? ''
  for (const [fdNorm, goals] of goalsMap) {
    const fdLast = fdNorm.split(/\s+/).at(-1) ?? ''
    if (pLast.length > 3 && pLast === fdLast) return { goals, matched: true }
    if (pn.length > 4 && fdNorm.includes(pn)) return { goals, matched: true }
  }
  return { goals: 0, matched: false }
}

async function fetchScorerGoals(): Promise<Map<string, number>> {
  if (!FD_KEY) return new Map()
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/scorers?limit=200`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 60 },
    })
    if (!res.ok) return new Map()
    const { scorers = [] } = await res.json()
    const map = new Map<string, number>()
    for (const s of scorers as Array<{ player?: { name?: string }; goals?: number }>) {
      const name = s.player?.name
      if (name) map.set(norm(name), s.goals ?? 0)
    }
    return map
  } catch { return new Map() }
}

const FD_TO_OURS: Record<string, string> = {
  'United States':      'USA',
  'Korea Republic':     'South Korea',
  "Côte d'Ivoire":      'Ivory Coast',
  'Ivory Coast':        'Ivory Coast',
  'Cape Verde Islands': 'Cape Verde',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Czechia':            'Czech Republic',
  'Congo DR':           'DR Congo',
  'Curaçao':            'Curacao',
  'Türkiye':            'Turkey',
}

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

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
const SCOREABLE_STATUSES = new Set([...LIVE_STATUSES, 'FINISHED'])

async function fetchMatches(): Promise<{ matches: Match[]; liveTeams: Set<string> }> {
  if (!FD_KEY) return { matches: [], liveTeams: new Set() }
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 30 },
    })
    if (!res.ok) return { matches: [], liveTeams: new Set() }
    const { matches = [] } = await res.json()
    const liveTeams = new Set<string>()
    const result: Match[] = []
    for (const m of matches as Record<string, unknown>[]) {
      const fdStatus = m.status as string
      if (!SCOREABLE_STATUSES.has(fdStatus)) continue
      const homeTeam = m.homeTeam as Record<string, string>
      const awayTeam = m.awayTeam as Record<string, string>
      const score = m.score as Record<string, Record<string, number | null>>
      const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
      const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''
      const homeScore = score?.fullTime?.home
      const awayScore = score?.fullTime?.away
      const stage = STAGE_MAP[m.stage as string]
      if (!home || !away || homeScore == null || awayScore == null || !stage) continue
      const isLive = LIVE_STATUSES.has(fdStatus)
      if (isLive) { liveTeams.add(home); liveTeams.add(away) }
      result.push({
        id: String(m.id),
        home_team: home,
        away_team: away,
        home_score: homeScore,
        away_score: awayScore,
        status: isLive ? 'IN_PLAY' : 'FINISHED',
        match_date: m.utcDate as string,
        stage,
        group_name: (m.group as string | undefined)?.replace('GROUP_', ''),
      } as Match)
    }
    return { matches: result, liveTeams }
  } catch {
    return { matches: [], liveTeams: new Set() }
  }
}

interface FunStat { icon: string; label: string; playerName: string; value: string }

interface TeamTableRow {
  name: string; code: string; tier: string; cost: number
  picks_count: number; wins: number; draws: number; losses: number
  gf: number; ga: number; pts: number
}

function computeTeamTable(picks: Pick[], matches: Match[]): TeamTableRow[] {
  const LIVE = new Set(['IN_PLAY', 'PAUSED', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'])
  const scoreable = matches.filter(m => m.status === 'FINISHED' || LIVE.has(m.status))

  // Count how many players picked each team (including wildcard old teams)
  const picksCount = new Map<string, number>()
  for (const p of picks) {
    const teams = new Set([p.team1, p.team2, p.team3, p.team4, p.team5].filter(Boolean) as string[])
    for (const t of teams) picksCount.set(t, (picksCount.get(t) ?? 0) + 1)
  }

  const rows: TeamTableRow[] = []
  for (const [teamName, count] of picksCount) {
    const team = getTeam(teamName)
    if (!team) continue
    const scoring = SCORING[team.tier as 'A' | 'B' | 'C' | 'D']
    let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0, pts = 0

    for (const stage of STAGE_ORDER) {
      const stageMatches = scoreable.filter(
        m => m.stage === stage && (m.home_team === teamName || m.away_team === teamName)
      )
      if (stageMatches.length === 0) continue

      // Team played in this stage → they advanced to it (add bonus for non-group stages)
      if (stage !== 'GROUP_STAGE') pts += scoring.advanceRound

      for (const m of stageMatches) {
        const isHome = m.home_team === teamName
        const goalsFor = isHome ? m.home_score : m.away_score
        const goalsAgainst = isHome ? m.away_score : m.home_score
        gf += goalsFor; ga += goalsAgainst
        if (goalsFor > goalsAgainst) { wins++; pts += scoring.win }
        else if (goalsFor === goalsAgainst) { draws++; pts += scoring.draw }
        else { losses++; pts += scoring.loss }
        pts += goalsFor * scoring.goalFor
        pts += goalsAgainst * scoring.goalAgainst

        // Champion bonus
        if (stage === 'FINAL' && goalsFor > goalsAgainst) pts += scoring.champion
      }
    }

    rows.push({ name: teamName, code: team.code, tier: team.tier, cost: team.cost, picks_count: count, wins, draws, losses, gf, ga, pts })
  }

  return rows.sort((a, b) => b.pts - a.pts)
}

function computeFunStats(picks: Pick[], matches: Match[]): FunStat[] {
  const scoreable = matches.filter(m => SCOREABLE_STATUSES.has(m.status))
  if (scoreable.length === 0) return []

  const data = picks
    .filter(p => !p.name.toLowerCase().startsWith('test'))
    .map(p => {
      const teams = [p.team1, p.team2, p.team3, p.team4, p.team5].filter(Boolean) as string[]
      let gf = 0, ga = 0, wins = 0, draws = 0, losses = 0
      for (const t of teams) {
        for (const m of scoreable) {
          const isHome = m.home_team === t, isAway = m.away_team === t
          if (!isHome && !isAway) continue
          const mGf = isHome ? m.home_score : m.away_score
          const mGa = isHome ? m.away_score : m.home_score
          gf += mGf; ga += mGa
          if (mGf > mGa) wins++; else if (mGf === mGa) draws++; else losses++
        }
      }
      return { name: p.name, gf, ga, diff: gf - ga, wins, draws, losses }
    })

  if (data.length === 0) return []

  function top(key: keyof typeof data[0], high = true) {
    return data.reduce((a, b) => high ? (a[key] >= b[key] ? a : b) : (a[key] <= b[key] ? a : b))
  }

  return [
    { icon: '⚽', label: 'Most Goals Scored',    playerName: top('gf').name,     value: `${top('gf').gf} goals` },
    { icon: '🥅', label: 'Most Goals Conceded',  playerName: top('ga').name,     value: `${top('ga').ga} goals` },
    { icon: '🛡️', label: 'Best Defense',          playerName: top('ga',false).name, value: `${top('ga',false).ga} conceded` },
    { icon: '🏆', label: 'Most Wins',             playerName: top('wins').name,   value: `${top('wins').wins} wins` },
    { icon: '😬', label: 'Most Losses',           playerName: top('losses').name, value: `${top('losses').losses} losses` },
    { icon: '🤝', label: 'Most Draws',            playerName: top('draws').name,  value: `${top('draws').draws} draws` },
    { icon: '🎯', label: 'Best Goal Difference',  playerName: top('diff').name,   value: `${top('diff').diff > 0 ? '+' : ''}${top('diff').diff}` },
    { icon: '😤', label: 'Worst Goal Difference', playerName: top('diff',false).name, value: `${top('diff',false).diff}` },
  ]
}

export async function GET() {
  const supabase = createServerClient()
  const tournamentStarted = new Date() >= DEADLINE

  const [
    { data: picks, error: pe },
    { matches, liveTeams },
    { data: hostPreds },
    { data: hostAnswers },
    scorerGoals,
  ] = await Promise.all([
    supabase.from('picks').select('*'),
    fetchMatches(),
    supabase.from('host_predictions').select('pick_id, dirtiest, best, worst, most_goals_for, most_goals_against'),
    supabase.from('host_answers').select('key, value'),
    fetchScorerGoals(),
  ])

  if (pe) {
    return NextResponse.json({ error: pe.message }, { status: 500 })
  }

  const KEYS = ['dirtiest', 'best', 'worst', 'most_goals_for', 'most_goals_against']
  type AnswerRow = { key: string; value: string | null }
  type PredRow = { pick_id: string } & Record<string, string>
  const answers = Object.fromEntries((hostAnswers ?? [] as AnswerRow[]).map((a: AnswerRow) => [a.key, a.value]))
  const predMap = Object.fromEntries((hostPreds ?? [] as PredRow[]).map((p: PredRow) => [p.pick_id, p]))

  const now = new Date()

  const ranked = (picks as Pick[])
    .filter(p => !p.name.toLowerCase().startsWith('test'))
    .map(p => {
      const pred = predMap[p.id] as PredRow | undefined
      const host_bonus = pred
        ? KEYS.reduce((sum, k) => sum + (answers[k] && pred[k] === answers[k] ? 100 : 0), 0)
        : 0
      const matchPoints = calculatePickPoints(p, matches)

      // Wildcard is "pending" if used but the next matchday/round hasn't started yet
      const isWcPending = !!(p.wildcard_used && p.wildcard_used_at && (() => {
        const usedAt = new Date(p.wildcard_used_at!)
        return WILDCARD_DEADLINES.some(d => d.deadline > usedAt && now < d.deadline)
      })())

      let team_points: { name: string; points: number }[] = []
      let old_team_points: { name: string; points: number }[] = []

      if (tournamentStarted) {
        if (isWcPending && p.wildcard_used_at) {
          // New teams not revealed yet — show old lineup with pre-wildcard points only
          const wcTime = new Date(p.wildcard_used_at)
          const preWcMatches = matches.filter(m => new Date(m.match_date) < wcTime)
          const oldPick: Pick = {
            ...p,
            team1: p.wildcard_old_team1 ?? p.team1,
            team2: p.wildcard_old_team2 ?? p.team2,
            team3: p.wildcard_old_team3 ?? p.team3,
            team4: p.wildcard_old_team4 ?? p.team4,
            team5: p.wildcard_old_team5 ?? p.team5,
            wildcard_used: false,
            wildcard_effective_from: undefined,
          }
          team_points = calculatePickPointsBreakdown(oldPick, preWcMatches)
        } else {
          team_points = calculatePickPointsBreakdown(p, matches)
          old_team_points = calculateOldTeamPointsBreakdown(p, matches)
        }
      }

      const live_teams = tournamentStarted && !isWcPending
        ? [p.team1, p.team2, p.team3, p.team4, p.team5].filter(t => t && liveTeams.has(t))
        : []

      return {
        ...p,
        host_bonus,
        total_points: matchPoints + host_bonus,
        team_points,
        old_team_points,
        wildcard_pending: isWcPending,
        live_teams,
        // Before tournament: hide all picks
        ...(!tournamentStarted && {
          team1: null, team2: null, team3: null, team4: null, team5: null,
          scorer1: null, scorer2: null, scorer3: null,
        }),
        // Pending wildcard: show old team lineup, hide new picks
        ...(isWcPending && tournamentStarted && {
          team1: p.wildcard_old_team1 ?? null,
          team2: p.wildcard_old_team2 ?? null,
          team3: p.wildcard_old_team3 ?? null,
          team4: p.wildcard_old_team4 ?? null,
          team5: p.wildcard_old_team5 ?? null,
        }),
      }
    })
    .sort((a, b) => b.total_points - a.total_points)
    .map((p, i) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, email, ...safe } = p
      return { ...safe, rank: i + 1 }
    })

  const fun_stats = tournamentStarted ? computeFunStats(picks as Pick[], matches) : []
  const team_table = tournamentStarted ? computeTeamTable(picks as Pick[], matches) : []

  return NextResponse.json({ ranked, tournamentStarted, fun_stats, team_table, live_teams_global: [...liveTeams] })
}
