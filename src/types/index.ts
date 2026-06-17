export type Tier = 'A' | 'B' | 'C' | 'D'

export interface Team {
  name: string
  flag: string
  code: string
  cost: number
  tier: Tier
}

export interface ScoringTable {
  win: number
  draw: number
  loss: number
  goalFor: number
  goalAgainst: number
  advanceRound: number
  champion: number
}

export interface Pick {
  id: string
  name: string
  email?: string
  team1: string
  team2: string
  team3: string
  team4: string
  team5: string
  scorer1?: string
  scorer2?: string
  scorer3?: string
  password_hash?: string
  wildcard_used?: boolean
  wildcard_used_at?: string | null
  wildcard_effective_from?: MatchStage
  wildcard_old_team1?: string
  wildcard_old_team2?: string
  wildcard_old_team3?: string
  wildcard_old_team4?: string
  wildcard_old_team5?: string
  wildcard_old_scorer1?: string | null
  wildcard_old_scorer2?: string | null
  wildcard_old_scorer3?: string | null
  total_cost: number
  total_points: number
  created_at: string
  updated_at?: string
}

export type MatchStatus = 'SCHEDULED' | 'IN_PLAY' | 'PAUSED' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | 'FINISHED' | 'SUSPENDED' | 'POSTPONED'
export type MatchStage = 'GROUP_STAGE' | 'GROUP_STAGE_MD2' | 'GROUP_STAGE_MD3' | 'ROUND_OF_32' | 'ROUND_OF_16' | 'QUARTER_FINALS' | 'SEMI_FINALS' | 'FINAL'

export interface Match {
  id: string
  external_id?: number
  home_team: string
  away_team: string
  home_score: number
  away_score: number
  status: MatchStatus
  match_date: string
  stage: MatchStage
  group_name?: string
}

export interface RankedPick extends Pick {
  rank: number
  teams: Team[]
}
