import { Pick } from '@/types'

export const AUDIT_STAGE_KEYS = [
  'GS_MD1', 'GS_MD2', 'GS_MD3',
  'ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL',
] as const
export type AuditStageKey = typeof AUDIT_STAGE_KEYS[number]

// Maps wildcard_effective_from → first AUDIT_STAGE_KEYS index where NEW teams apply.
// The "Final" wildcard deadline stores effective_from as THIRD_PLACE (not FINAL) — one
// deadline covers both the 3rd place match and the Final, but new teams take over from
// the 3rd place match onward so old teams don't also score that consolation match.
export const WC_SPLIT_IDX: Record<string, number> = {
  GROUP_STAGE_MD2: 1,
  GROUP_STAGE_MD3: 2,
  ROUND_OF_32:     3,
  ROUND_OF_16:     4,
  QUARTER_FINALS:  5,
  SEMI_FINALS:     6,
  THIRD_PLACE:     7,
  FINAL:           8,
}

// Returns the 5 teams a player earns points FROM at a given audit stage key.
export function activeTeamsForPick(pick: Pick, stageKey: string): string[] {
  const current = [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5]
    .filter(Boolean) as string[]
  if (!pick.wildcard_used || !pick.wildcard_effective_from || !pick.wildcard_old_team1) {
    return current
  }
  const stageIdx = AUDIT_STAGE_KEYS.indexOf(stageKey as AuditStageKey)
  const splitIdx = WC_SPLIT_IDX[pick.wildcard_effective_from] ?? 0
  if (stageIdx < splitIdx) {
    return [
      pick.wildcard_old_team1!, pick.wildcard_old_team2!,
      pick.wildcard_old_team3!, pick.wildcard_old_team4!, pick.wildcard_old_team5!,
    ].filter(Boolean) as string[]
  }
  return current
}
