import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { fetchSquadMap, isValidScorer } from '@/lib/squad-validation'
import { WILDCARD_DEADLINES } from '@/lib/scoring'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
const DEADLINE = new Date('2026-06-11T19:00:00Z')

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

const EFFECTIVE_STAGE_LABEL: Record<string, string> = {
  GROUP_STAGE_MD2: 'MD2', GROUP_STAGE_MD3: 'MD3',
  ROUND_OF_32: 'R32', ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', FINAL: 'Final',
}

function norm(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function lookupGoals(pickName: string, goalsMap: Map<string, number>): { goals: number; matched: boolean } {
  const pn = norm(pickName)
  const pLast = pn.split(/\s+/).at(-1) ?? ''
  let bestMatch: { goals: number; matched: boolean } | null = null

  // Direct match first
  if (goalsMap.has(pn)) bestMatch = { goals: goalsMap.get(pn)!, matched: true }

  // Fuzzy: last-name or substring — keep highest goal count found
  for (const [fdNorm, goals] of goalsMap) {
    const fdLast = fdNorm.split(/\s+/).at(-1) ?? ''
    const matches =
      (pLast.length > 3 && pLast === fdLast) ||
      (pn.length > 4 && fdNorm.includes(pn))
    if (matches && (!bestMatch || goals > bestMatch.goals)) {
      bestMatch = { goals, matched: true }
    }
  }

  return bestMatch ?? { goals: 0, matched: false }
}

// Build goals map from a scorer_snapshot row array
function buildGoalsMap(rows: Array<{ scorer_name: string; goals: number }>): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) map.set(norm(row.scorer_name), row.goals)
  return map
}

export async function GET() {
  const tournamentStarted = new Date() >= DEADLINE

  const supabase = createServerClient()

  // Fetch everything in parallel
  const [topScorersRes, picksRes, snapshotsRes, squadMapRes] = await Promise.all([
    FD_KEY
      ? fetch(`${FD_BASE}/competitions/WC/scorers?limit=200`, {
          headers: { 'X-Auth-Token': FD_KEY },
          next: { revalidate: 60 },
        }).then(r => r.ok ? r.json() : { scorers: [] }).catch(() => ({ scorers: [] }))
      : Promise.resolve({ scorers: [] }),
    supabase
      .from('picks')
      .select('name, team1, team2, team3, team4, team5, scorer1, scorer2, scorer3, wildcard_used, wildcard_used_at, wildcard_effective_from, wildcard_old_scorer1, wildcard_old_scorer2, wildcard_old_scorer3')
      .not('name', 'ilike', 'test%')
      .order('created_at', { ascending: true }),
    supabase
      .from('scorer_snapshots')
      .select('scorer_name, goals, effective_stage'),
    FD_KEY
      ? fetchSquadMap(FD_KEY).catch(() => new Map<string, string[]>())
      : Promise.resolve(new Map<string, string[]>()),
  ])

  // Build top scorers list
  const topScorers = ((topScorersRes.scorers ?? []) as Array<{
    player?: { name?: string }; team?: { name?: string }; goals?: number; assists?: number; penalties?: number
  }>).map(s => ({
    name: s.player?.name ?? '',
    team: FD_TO_OURS[s.team?.name ?? ''] ?? s.team?.name ?? '',
    goals: s.goals ?? 0,
    assists: s.assists ?? 0,
    penalties: s.penalties ?? 0,
  }))

  // Current cumulative goals map (live total from FD)
  const currentGoals = new Map<string, number>()
  for (const s of topScorers) currentGoals.set(norm(s.name), s.goals)

  // Snapshot goals maps by stage
  const snapshots = snapshotsRes.data ?? []
  const snapshotsByStage = new Map<string, Map<string, number>>()
  for (const stage of ['GROUP_STAGE_MD2', 'GROUP_STAGE_MD3', 'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL']) {
    const rows = snapshots.filter(s => s.effective_stage === stage)
    if (rows.length > 0) snapshotsByStage.set(stage, buildGoalsMap(rows))
  }

  const squadMap = squadMapRes as Map<string, string[]>
  const picks = picksRes.data ?? []
  const now = new Date()

  // Get the snapshot map for the stage just before a given effective stage.
  // Goals scored BEFORE effectiveStage = snapshot at that boundary.
  // Goals scored FROM effectiveStage = current - snapshot at that boundary.
  function goalsBeforeStage(scorerName: string, stage: string): number {
    const snap = snapshotsByStage.get(stage)
    if (!snap) return 0
    return lookupGoals(scorerName, snap).goals
  }

  const quinielaScorers = picks
    .filter(p => p.scorer1 || p.scorer2 || p.scorer3 || p.wildcard_old_scorer1)
    .map(p => {
      // Same pending logic as ranking
      const isWcPending = !!(p.wildcard_used && p.wildcard_effective_from && (() => {
        const d = WILDCARD_DEADLINES.find(d => d.effectiveStage === p.wildcard_effective_from)
        return d ? now < d.deadline : false
      })())

      const effectiveStage = p.wildcard_effective_from as string | null
      const hasOldScorers = p.wildcard_used && (p.wildcard_old_scorer1 || p.wildcard_old_scorer2 || p.wildcard_old_scorer3)
      const teams = [p.team1, p.team2, p.team3, p.team4, p.team5].filter(Boolean)

      const wcLabel = effectiveStage ? (EFFECTIVE_STAGE_LABEL[effectiveStage] ?? '') : ''

      const toScorerRow = (name: string, goals: number, isOld = false) => {
        const valid = squadMap.size === 0 || isValidScorer(name, teams, squadMap)
        const matched = lookupGoals(name, currentGoals).matched
        return { name, goals, matched, valid, old: isOld, subIn: false, wcLabel: wcLabel || undefined }
      }

      let scorerPicks: Array<{ name: string; goals: number; matched: boolean; valid: boolean; old: boolean; subIn: boolean; wcLabel?: string }>

      if (isWcPending) {
        // Hide new scorers — show old lineup only with current goals
        const oldNames = [p.wildcard_old_scorer1, p.wildcard_old_scorer2, p.wildcard_old_scorer3].filter(Boolean) as string[]
        scorerPicks = oldNames.map(name => toScorerRow(name, lookupGoals(name, currentGoals).goals, false))
      } else if (hasOldScorers && effectiveStage) {
        // Wildcard active — split goals at the effective stage boundary
        const oldNames = [p.wildcard_old_scorer1, p.wildcard_old_scorer2, p.wildcard_old_scorer3].filter(Boolean) as string[]
        const newNames = [p.scorer1, p.scorer2, p.scorer3].filter(Boolean) as string[]
        const newNamesNorm = new Set(newNames.map(norm))

        // Old scorers: goals scored BEFORE the split (from snapshot)
        const oldPills = oldNames
          .filter(name => !newNamesNorm.has(norm(name))) // exclude kept scorers (handled as new)
          .map(name => {
            const goals = goalsBeforeStage(name, effectiveStage)
            return toScorerRow(name, goals, true)
          })

        // New scorers: goals scored FROM the split onwards (current - snapshot)
        const oldNamesNorm = new Set(oldNames.map(norm))
        const newPills = newNames.map(name => {
          const total = lookupGoals(name, currentGoals).goals
          const isKept = oldNamesNorm.has(norm(name))
          const before = isKept ? 0 : goalsBeforeStage(name, effectiveStage)
          const goals = Math.max(0, total - before)
          const row = toScorerRow(name, goals, false)
          if (!isKept) row.subIn = true
          return row
        })

        scorerPicks = [...newPills, ...oldPills]
      } else {
        // No wildcard — use current cumulative goals
        const names = [p.scorer1, p.scorer2, p.scorer3].filter(Boolean) as string[]
        scorerPicks = names.map(name => toScorerRow(name, lookupGoals(name, currentGoals).goals, false))
      }

      return {
        playerName: p.name,
        picks: scorerPicks,
        total: scorerPicks.reduce((s, x) => s + x.goals, 0),
        wildcardPending: isWcPending,
        wcLabel,
      }
    })
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ tournamentStarted, topScorers, quinielaScorers })
}
