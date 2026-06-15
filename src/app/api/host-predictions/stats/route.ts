import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const DEADLINE = new Date('2026-06-11T19:00:00Z')
const HOSTS = ['USA', 'Mexico', 'Canada'] as const
const QUESTIONS = ['dirtiest', 'best', 'worst', 'most_goals_for', 'most_goals_against'] as const

export async function GET() {
  // Only reveal aggregate picks after deadline
  if (new Date() < DEADLINE) {
    return NextResponse.json({ locked: true })
  }

  const supabase = createServerClient()

  const [{ data: preds }, { data: hostAnswers }] = await Promise.all([
    supabase.from('host_predictions').select(QUESTIONS.join(', ')),
    supabase.from('host_answers').select('key, value'),
  ])

  const answers = Object.fromEntries((hostAnswers ?? []).map(a => [a.key, a.value]))

  type QuestionKey = typeof QUESTIONS[number]
  type HostKey = typeof HOSTS[number]

  const questions: Record<QuestionKey, Record<HostKey, number> & { total: number }> = {} as never
  for (const q of QUESTIONS) {
    const counts = { USA: 0, Mexico: 0, Canada: 0, total: 0 }
    for (const row of preds ?? []) {
      const val = (row as unknown as Record<string, string>)[q] as HostKey | undefined
      if (val && HOSTS.includes(val)) { counts[val]++; counts.total++ }
    }
    questions[q] = counts
  }

  return NextResponse.json({ locked: false, questions, answers })
}
