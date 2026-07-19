import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { fetchSquadMap, isValidScorer } from '@/lib/squad-validation'
import { WILDCARD_DEADLINES, normalizeEffectiveStage, THIRD_PLACE_FORFEIT_CUTOFF } from '@/lib/scoring'
import { FD_TO_OURS } from '@/lib/teams'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY
const DEADLINE = new Date('2026-06-11T19:00:00Z')

const EFFECTIVE_STAGE_LABEL: Record<string, string> = {
  GROUP_STAGE_MD2: 'MD2', GROUP_STAGE_MD3: 'MD3',
  ROUND_OF_32: 'R32', ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', THIRD_PLACE: '3rd', FINAL: 'Final',
}

// Period labels for the by-gameweek breakdown. THIRD_PLACE is deliberately NOT in this
// sequence — every other snapshot here is captured right before its stage's matches, but
// the THIRD_PLACE one (see admin snapshot-scorers) was captured AFTER that match finished,
// specifically to isolate its own goals for forfeiture (below). Chaining it into this
// before/after delta sequence would mislabel the SF/Final periods, so it's used standalone.
const STAGE_SEQUENCE_FOR_PERIODS = [
  'GROUP_STAGE_MD2', 'GROUP_STAGE_MD3', 'ROUND_OF_32',
  'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL',
]
const PERIOD_LABEL_BEFORE: Record<string, string> = {
  GROUP_STAGE_MD2: 'MD1', GROUP_STAGE_MD3: 'MD2', ROUND_OF_32: 'MD3',
  ROUND_OF_16: 'R32', QUARTER_FINALS: 'R16', SEMI_FINALS: 'QF', FINAL: 'SF',
}
const PERIOD_LABEL_AFTER: Record<string, string> = {
  GROUP_STAGE_MD2: 'MD2+', GROUP_STAGE_MD3: 'MD3+', ROUND_OF_32: 'R32+',
  ROUND_OF_16: 'R16+', QUARTER_FINALS: 'QF+', SEMI_FINALS: 'SF+', FINAL: 'Final',
}

// For the old/new scorer split boundary, effectiveStage THIRD_PLACE must resolve to the
// SEMI_FINALS snapshot — nothing happened between the semis and 3rd-place kickoff — so a
// swapped-out scorer isn't credited with 3rd place goals they shouldn't get (mirrors the
// team-level split in scoring.ts, where old teams don't score the 3rd place match either).
function splitBoundaryStage(stage: string): string {
  return stage === 'THIRD_PLACE' ? 'SEMI_FINALS' : stage
}

function norm(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function lookupGoals(pickName: string, goalsMap: Map<string, number>): { goals: number; matched: boolean } {
  const pn = norm(pickName)
  const pLast = pn.split(/\s+/).at(-1) ?? ''
  let bestMatch: { goals: number; matched: boolean } | null = null

  if (goalsMap.has(pn)) bestMatch = { goals: goalsMap.get(pn)!, matched: true }

  for (const [fdNorm, goals] of goalsMap) {
    const fdLast = fdNorm.split(/\s+/).at(-1) ?? ''
    const matches =
      (pLast.length >= 3 && pLast === fdLast) ||
      (pn.length >= 4 && fdNorm.includes(pn))
    if (matches && (!bestMatch || goals > bestMatch.goals)) {
      bestMatch = { goals, matched: true }
    }
  }

  return bestMatch ?? { goals: 0, matched: false }
}

function buildGoalsMap(rows: Array<{ scorer_name: string; goals: number }>): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) map.set(norm(row.scorer_name), row.goals)
  return map
}

export async function GET() {
  const tournamentStarted = new Date() >= DEADLINE

  const supabase = createServerClient()

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

  const topScorers = ((topScorersRes.scorers ?? []) as Array<{
    player?: { name?: string }; team?: { name?: string }; goals?: number; assists?: number; penalties?: number
  }>).map(s => ({
    name: s.player?.name ?? '',
    team: FD_TO_OURS[s.team?.name ?? ''] ?? s.team?.name ?? '',
    goals: s.goals ?? 0,
    assists: s.assists ?? 0,
    penalties: s.penalties ?? 0,
  }))

  const currentGoals = new Map<string, number>()
  for (const s of topScorers) currentGoals.set(norm(s.name), s.goals)

  const snapshots = snapshotsRes.data ?? []
  const snapshotsByStage = new Map<string, Map<string, number>>()
  for (const stage of STAGE_SEQUENCE_FOR_PERIODS) {
    const rows = snapshots.filter(s => s.effective_stage === stage)
    if (rows.length > 0) snapshotsByStage.set(stage, buildGoalsMap(rows))
  }
  // THIRD_PLACE isn't part of the periods sequence (see comment above) but is still loaded
  // here so goalsBeforeStage() can look it up for the forfeiture calculation below.
  const thirdPlaceRows = snapshots.filter(s => s.effective_stage === 'THIRD_PLACE')
  if (thirdPlaceRows.length > 0) snapshotsByStage.set('THIRD_PLACE', buildGoalsMap(thirdPlaceRows))

  const availableSnaps = STAGE_SEQUENCE_FOR_PERIODS.filter(s => snapshotsByStage.has(s))

  // Period labels for the by-gameweek table: ['MD1', 'MD2', 'MD3+'] when 2 snapshots available
  const periods: string[] = availableSnaps.length === 0
    ? []
    : [
        ...availableSnaps.map(s => PERIOD_LABEL_BEFORE[s]),
        PERIOD_LABEL_AFTER[availableSnaps[availableSnaps.length - 1]],
      ]

  const squadMap = squadMapRes as Map<string, string[]>
  const picks = picksRes.data ?? []
  const now = new Date()

  function goalsBeforeStage(scorerName: string, stage: string): number {
    const snap = snapshotsByStage.get(stage)
    if (!snap) return 0
    return lookupGoals(scorerName, snap).goals
  }

  // Goals scored specifically during the 3rd place match (SEMI_FINALS snapshot → THIRD_PLACE
  // snapshot delta) — used to void that match's goals for players who forfeit it below.
  function thirdPlaceOnlyGoals(scorerName: string): number {
    return Math.max(0, goalsBeforeStage(scorerName, 'THIRD_PLACE') - goalsBeforeStage(scorerName, 'SEMI_FINALS'))
  }

  // Wildcarding after the 3rd place match was already played means the result was known —
  // forfeit that match's goals entirely, for every currently-held scorer, kept or new. Mirrors
  // the identical team-points forfeiture in scoring.ts.
  function forfeitsThirdPlace(p: { wildcard_used: boolean | null; wildcard_used_at: string | null }): boolean {
    return !!(p.wildcard_used && p.wildcard_used_at && new Date(p.wildcard_used_at) > THIRD_PLACE_FORFEIT_CUTOFF)
  }

  // Compute an array of goals per period for a single scorer name
  function scorerPeriodGoals(scorerName: string): number[] {
    if (availableSnaps.length === 0) return []
    const result: number[] = []
    let prev = 0
    for (const snap of availableSnaps) {
      const at = goalsBeforeStage(scorerName, snap)
      result.push(Math.max(0, at - prev))
      prev = at
    }
    result.push(Math.max(0, lookupGoals(scorerName, currentGoals).goals - prev))
    return result
  }

  // Compute aggregated goals per period for a quiniela player, respecting wildcard splits.
  // When effectiveStage is not yet snapshotted, uses the last available snapshot as an approximation.
  function playerPeriodGoals(p: typeof picks[0], isWcPending: boolean): number[] {
    if (availableSnaps.length === 0) return []
    const numPeriods = availableSnaps.length + 1
    const totals = Array<number>(numPeriods).fill(0)

    if (isWcPending) {
      // Pending wildcard: show old scorers across all periods (new picks are hidden)
      const oldNames = [p.wildcard_old_scorer1, p.wildcard_old_scorer2, p.wildcard_old_scorer3].filter(Boolean) as string[]
      for (const name of oldNames) {
        scorerPeriodGoals(name).forEach((g, i) => { totals[i] += g })
      }
      return totals
    }

    const effectiveStage = p.wildcard_effective_from as string | null
    const hasWildcard = p.wildcard_used && effectiveStage

    if (!hasWildcard) {
      const names = [p.scorer1, p.scorer2, p.scorer3].filter(Boolean) as string[]
      for (const name of names) {
        scorerPeriodGoals(name).forEach((g, i) => { totals[i] += g })
      }
      return totals
    }

    const effectiveSnapIdx = availableSnaps.indexOf(splitBoundaryStage(normalizeEffectiveStage(effectiveStage!)))
    const oldNames = [p.wildcard_old_scorer1, p.wildcard_old_scorer2, p.wildcard_old_scorer3].filter(Boolean) as string[]
    const newNames = [p.scorer1, p.scorer2, p.scorer3].filter(Boolean) as string[]
    const newNamesNorm = new Set(newNames.map(norm))
    const oldNamesNorm = new Set(oldNames.map(norm))

    // Kept scorers (in both old and new lists): count all periods
    for (const name of newNames.filter(n => oldNamesNorm.has(norm(n)))) {
      scorerPeriodGoals(name).forEach((g, i) => { totals[i] += g })
    }

    // Removed scorers: count only periods before the effective split
    for (const name of oldNames.filter(n => !newNamesNorm.has(norm(n)))) {
      const pg = scorerPeriodGoals(name)
      for (let i = 0; i < numPeriods; i++) {
        // effectiveSnapIdx < 0 means effective stage not yet snapshotted
        // — approximate by counting all snapshot periods except the live final period
        if (effectiveSnapIdx < 0 ? i < numPeriods - 1 : i <= effectiveSnapIdx) {
          totals[i] += pg[i]
        }
      }
    }

    // Added scorers: count only periods from the effective split onwards
    for (const name of newNames.filter(n => !oldNamesNorm.has(norm(n)))) {
      const pg = scorerPeriodGoals(name)
      for (let i = 0; i < numPeriods; i++) {
        // effectiveSnapIdx < 0: approximate by counting only the live final period
        if (effectiveSnapIdx < 0 ? i === numPeriods - 1 : i >= effectiveSnapIdx + 1) {
          totals[i] += pg[i]
        }
      }
    }

    // Forfeit the 3rd place match's goals — they landed in the bucket right after the
    // SEMI_FINALS boundary (currently the trailing "SF+" bucket, since no FINAL snapshot
    // exists yet). Void up to that amount, for every currently-held scorer.
    if (forfeitsThirdPlace(p)) {
      const forfeitIdx = effectiveSnapIdx + 1
      const forfeited = newNames.reduce((sum, n) => sum + thirdPlaceOnlyGoals(n), 0)
      if (forfeitIdx >= 0 && forfeitIdx < numPeriods && forfeited > 0) {
        totals[forfeitIdx] = Math.max(0, totals[forfeitIdx] - forfeited)
      }
    }

    return totals
  }

  const quinielaScorers = picks
    .filter(p => p.scorer1 || p.scorer2 || p.scorer3 || p.wildcard_old_scorer1)
    .map(p => {
      // normalizeEffectiveStage handles picks written with 'FINAL' before the deadline table
      // started storing 'THIRD_PLACE' for this same window — see scoring.ts.
      const isWcPending = !!(p.wildcard_used && p.wildcard_effective_from && (() => {
        const d = WILDCARD_DEADLINES.find(d => d.effectiveStage === normalizeEffectiveStage(p.wildcard_effective_from))
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
        const oldNames = [p.wildcard_old_scorer1, p.wildcard_old_scorer2, p.wildcard_old_scorer3].filter(Boolean) as string[]
        scorerPicks = oldNames.map(name => toScorerRow(name, lookupGoals(name, currentGoals).goals, false))
      } else if (hasOldScorers && effectiveStage) {
        // Split boundary: THIRD_PLACE resolves to the SEMI_FINALS snapshot (see
        // splitBoundaryStage) so old scorers aren't credited with 3rd place goals.
        const boundaryStage = splitBoundaryStage(normalizeEffectiveStage(effectiveStage))
        const oldNames = [p.wildcard_old_scorer1, p.wildcard_old_scorer2, p.wildcard_old_scorer3].filter(Boolean) as string[]
        const newNames = [p.scorer1, p.scorer2, p.scorer3].filter(Boolean) as string[]
        const newNamesNorm = new Set(newNames.map(norm))

        const oldPills = oldNames
          .filter(name => !newNamesNorm.has(norm(name)))
          .map(name => {
            const goals = goalsBeforeStage(name, boundaryStage)
            return toScorerRow(name, goals, true)
          })

        // Wildcarding after the 3rd place match already happened forfeits its goals —
        // for every currently-held scorer, kept or new. Mirrors the team-points forfeiture
        // in scoring.ts.
        const forfeit = forfeitsThirdPlace(p)

        const oldNamesNorm = new Set(oldNames.map(norm))
        const newPills = newNames.map(name => {
          const total = lookupGoals(name, currentGoals).goals
          const isKept = oldNamesNorm.has(norm(name))
          const before = isKept ? 0 : goalsBeforeStage(name, boundaryStage)
          const forfeited = forfeit ? thirdPlaceOnlyGoals(name) : 0
          const goals = Math.max(0, total - before - forfeited)
          const row = toScorerRow(name, goals, false)
          if (!isKept) row.subIn = true
          return row
        })

        scorerPicks = [...newPills, ...oldPills]
      } else {
        const names = [p.scorer1, p.scorer2, p.scorer3].filter(Boolean) as string[]
        scorerPicks = names.map(name => toScorerRow(name, lookupGoals(name, currentGoals).goals, false))
      }

      const total = scorerPicks.reduce((s, x) => s + x.goals, 0)
      const goalsByPeriod = playerPeriodGoals(p, isWcPending)

      return {
        playerName: p.name,
        picks: scorerPicks,
        total,
        goalsByPeriod,
        wildcardPending: isWcPending,
        wcLabel,
      }
    })
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ tournamentStarted, topScorers, quinielaScorers, periods })
}
