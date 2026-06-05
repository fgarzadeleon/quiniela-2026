import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { calculatePickPoints } from '@/lib/scoring'
import { Match, Pick } from '@/types'

export const dynamic = 'force-dynamic'

const DEADLINE = new Date('2026-06-11T16:00:00Z')

export async function GET() {
  const supabase = createServerClient()
  const tournamentStarted = new Date() >= DEADLINE

  const [
    { data: picks, error: pe },
    { data: matches, error: me },
    { data: hostPreds },
    { data: hostAnswers },
  ] = await Promise.all([
    supabase.from('picks').select('*'),
    supabase.from('matches').select('*').eq('status', 'FINISHED'),
    supabase.from('host_predictions').select('pick_id, dirtiest, best, worst, most_goals_for, most_goals_against'),
    supabase.from('host_answers').select('key, value'),
  ])

  if (pe || me) {
    return NextResponse.json({ error: (pe || me)?.message }, { status: 500 })
  }

  const KEYS = ['dirtiest', 'best', 'worst', 'most_goals_for', 'most_goals_against']
  type AnswerRow = { key: string; value: string | null }
  type PredRow = { pick_id: string } & Record<string, string>
  const answers = Object.fromEntries((hostAnswers ?? [] as AnswerRow[]).map((a: AnswerRow) => [a.key, a.value]))
  const predMap = Object.fromEntries((hostPreds ?? [] as PredRow[]).map((p: PredRow) => [p.pick_id, p]))

  const ranked = (picks as Pick[])
    .filter(p => !p.name.toLowerCase().startsWith('test'))
    .map(p => {
      const pred = predMap[p.id] as PredRow | undefined
      const host_bonus = pred
        ? KEYS.reduce((sum, k) => sum + (answers[k] && pred[k] === answers[k] ? 100 : 0), 0)
        : 0
      return {
        ...p,
        host_bonus,
        total_points: calculatePickPoints(p, (matches ?? []) as Match[]) + host_bonus,
        ...(!tournamentStarted && {
          team1: null, team2: null, team3: null, team4: null, team5: null,
          scorer1: null, scorer2: null, scorer3: null,
        }),
      }
    })
    .sort((a, b) => b.total_points - a.total_points)
    .map((p, i) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, email, ...safe } = p
      return { ...safe, rank: i + 1 }
    })

  return NextResponse.json({ ranked, tournamentStarted })
}
