import { Pick } from '@/types'
import { normalizeEffectiveStage, THIRD_PLACE_FORFEIT_CUTOFF } from './scoring'

export const AUDIT_STAGE_KEYS = [
  'GS_MD1', 'GS_MD2', 'GS_MD3',
  'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL',
] as const
export type AuditStageKey = typeof AUDIT_STAGE_KEYS[number]

// Maps wildcard_effective_from → first AUDIT_STAGE_KEYS index where NEW teams apply.
// No 'FINAL' entry on purpose: the "Final" wildcard deadline stores effective_from as
// THIRD_PLACE (one deadline covers both the 3rd place match and the Final, and new teams
// take over from the 3rd place match onward). Picks written before that fix shipped may
// still have 'FINAL' stored — normalizeEffectiveStage() maps those to THIRD_PLACE below
// so they split at the same point without needing a DB migration.
export const WC_SPLIT_IDX: Record<string, number> = {
  GROUP_STAGE_MD2: 1,
  GROUP_STAGE_MD3: 2,
  ROUND_OF_32:     3,
  ROUND_OF_16:     4,
  QUARTER_FINALS:  5,
  SEMI_FINALS:     6,
  THIRD_PLACE:     7,
}

// Returns the 5 teams a player earns points FROM at a given audit stage key.
export function activeTeamsForPick(pick: Pick, stageKey: string): string[] {
  const current = [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]
    .filter(Boolean) as string[]
  if (!pick.wildcard_used || !pick.wildcard_effective_from || !pick.wildcard_old_team1) {
    return current
  }
  // Wildcarding after the 3rd place match was already played means the result was known —
  // forfeit that match's points entirely (neither old nor new team earns from it). Keep in
  // sync with the identical check in scoring.ts's computePoints().
  if (stageKey === 'THIRD_PLACE' && pick.wildcard_used_at && new Date(pick.wildcard_used_at) > THIRD_PLACE_FORFEIT_CUTOFF) {
    return []
  }
  const stageIdx = AUDIT_STAGE_KEYS.indexOf(stageKey as AuditStageKey)
  const splitIdx = WC_SPLIT_IDX[normalizeEffectiveStage(pick.wildcard_effective_from)] ?? 0
  if (stageIdx < splitIdx) {
    return [
      pick.wildcard_old_team1!, pick.wildcard_old_team2!,
      pick.wildcard_old_team3!, pick.wildcard_old_team4!, pick.wildcard_old_team5!,
    ].filter(Boolean) as string[]
  }
  return current
}
