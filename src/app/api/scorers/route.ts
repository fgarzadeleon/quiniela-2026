import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { fetchSquadMap, isValidScorer } from '@/lib/squad-validation'
import { WILDCARD_DEADLINES } from '@/lib/scoring'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
const DEADLINE = new Date('2026-06-11T19:00:00Z')

// football-data.org team name → our name
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

function norm(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

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

export async function GET() {
  const tournamentStarted = new Date() >= DEADLINE

  let topScorers: Array<{ name: string; team: string; goals: number; assists: number; penalties: number }> = []

  if (FD_KEY) {
    try {
      const res = await fetch(`${FD_BASE}/competitions/WC/scorers?limit=200`, {
        headers: { 'X-Auth-Token': FD_KEY },
        next: { revalidate: 60 },
      })
      if (res.ok) {
        const data = await res.json()
        topScorers = (data.scorers ?? []).map((s: {
          player?: { name?: string }
          team?: { name?: string }
          goals?: number
          assists?: number
          penalties?: number
        }) => ({
          name: s.player?.name ?? '',
          team: FD_TO_OURS[s.team?.name ?? ''] ?? s.team?.name ?? '',
          goals: s.goals ?? 0,
          assists: s.assists ?? 0,
          penalties: s.penalties ?? 0,
        }))
      }
    } catch { /* fall through with empty list */ }
  }

  // Build goals lookup keyed by normalised name
  const goalsMap = new Map<string, number>()
  for (const s of topScorers) {
    goalsMap.set(norm(s.name), s.goals)
  }

  const supabase = createServerClient()
  const { data: picks } = await supabase
    .from('picks')
    .select('name, team1, team2, team3, team4, team5, scorer1, scorer2, scorer3, wildcard_used, wildcard_used_at, wildcard_effective_from, wildcard_old_scorer1, wildcard_old_scorer2, wildcard_old_scorer3')
    .not('name', 'ilike', 'test%')
    .order('created_at', { ascending: true })

  // Fetch squad data so we can flag scorers not in the player's teams
  let squadMap = new Map<string, string[]>()
  if (FD_KEY) {
    try { squadMap = await fetchSquadMap(FD_KEY) } catch { /* skip validation */ }
  }

  const now = new Date()

  const quinielaScorers = (picks ?? [])
    .filter(p => p.scorer1 || p.scorer2 || p.scorer3 || p.wildcard_old_scorer1)
    .map(p => {
      // Same pending logic as ranking: wildcard is pending until its effective-stage deadline
      const isWcPending = !!(p.wildcard_used && p.wildcard_effective_from && (() => {
        const effectiveDeadline = WILDCARD_DEADLINES.find(d => d.effectiveStage === p.wildcard_effective_from)
        return effectiveDeadline ? now < effectiveDeadline.deadline : false
      })())

      // Which scorers are active right now?
      // Pending: show only old scorers (new ones aren't revealed yet)
      // Active wildcard: show both old scorers (goals they scored for old teams) + new scorers
      // No wildcard: show current scorers only
      const hasOldScorers = p.wildcard_used && (p.wildcard_old_scorer1 || p.wildcard_old_scorer2 || p.wildcard_old_scorer3)

      let activeScorerNames: string[]
      let oldScorerNames: string[]

      if (isWcPending) {
        // Hide new scorers — wildcard not yet active
        activeScorerNames = [p.wildcard_old_scorer1, p.wildcard_old_scorer2, p.wildcard_old_scorer3].filter(Boolean) as string[]
        oldScorerNames = []
      } else if (hasOldScorers) {
        // Wildcard active: new scorers score going forward, old scorers scored before
        activeScorerNames = [p.scorer1, p.scorer2, p.scorer3].filter(Boolean) as string[]
        oldScorerNames = [p.wildcard_old_scorer1, p.wildcard_old_scorer2, p.wildcard_old_scorer3]
          .filter(Boolean)
          .filter(s => !activeScorerNames.map(n => norm(n)).includes(norm(s!))) as string[]
      } else {
        activeScorerNames = [p.scorer1, p.scorer2, p.scorer3].filter(Boolean) as string[]
        oldScorerNames = []
      }

      const teams = [p.team1, p.team2, p.team3, p.team4, p.team5].filter(Boolean)

      const toScorerRow = (name: string, isOld = false) => {
        const valid = squadMap.size === 0 || isValidScorer(name, teams, squadMap)
        const { goals, matched } = valid ? lookupScorer(name, goalsMap) : { goals: 0, matched: false }
        return { name, goals, matched, valid, old: isOld }
      }

      const scorerPicks = [
        ...activeScorerNames.map(n => toScorerRow(n, false)),
        ...oldScorerNames.map(n => toScorerRow(n, true)),
      ]

      return {
        playerName: p.name,
        picks: scorerPicks,
        total: scorerPicks.reduce((s, x) => s + x.goals, 0),
        wildcardPending: isWcPending,
      }
    })
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ tournamentStarted, topScorers, quinielaScorers })
}
