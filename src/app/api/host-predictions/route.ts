import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

const DEADLINE = new Date('2026-06-11T19:00:00Z')
const HOSTS = ['USA', 'Mexico', 'Canada'] as const
const QUESTIONS = ['dirtiest', 'best', 'worst', 'most_goals_for', 'most_goals_against'] as const

async function authenticate(supabase: ReturnType<typeof createServerClient>, name: string, password: string) {
  const { data, error } = await supabase
    .from('picks')
    .select('id, password_hash')
    .ilike('name', name.trim())
    .single()

  if (error || !data) return { pickId: null, error: 'No entry found with that name' }
  if (data.password_hash !== password.trim()) return { pickId: null, error: 'Wrong password' }
  return { pickId: data.id as string, error: null }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, password, dirtiest, best, worst, most_goals_for, most_goals_against } = body

  if (!name || !password) {
    return NextResponse.json({ error: 'Name and password required' }, { status: 400 })
  }

  const answers = { dirtiest, best, worst, most_goals_for, most_goals_against }
  for (const [key, val] of Object.entries(answers)) {
    if (!HOSTS.includes(val as typeof HOSTS[number])) {
      return NextResponse.json({ error: `Invalid answer for ${key}` }, { status: 400 })
    }
  }

  if (new Date() >= DEADLINE) {
    return NextResponse.json({ error: 'Predictions are locked — tournament has started' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { pickId, error: authError } = await authenticate(supabase, name, password)
  if (!pickId) return NextResponse.json({ error: authError }, { status: 401 })

  const { data, error } = await supabase
    .from('host_predictions')
    .upsert({ pick_id: pickId, name: name.trim(), ...answers }, { onConflict: 'pick_id' })
    .select()
    .single()

  if (error) {
    console.error('host_predictions error:', error)
    return NextResponse.json({ error: 'Failed to save predictions' }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name')
  const password = searchParams.get('password')

  if (!name || !password) {
    return NextResponse.json({ error: 'Name and password required' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { pickId, error: authError } = await authenticate(supabase, name, password)
  if (!pickId) return NextResponse.json({ error: authError }, { status: 401 })

  const { data } = await supabase
    .from('host_predictions')
    .select(QUESTIONS.join(', '))
    .eq('pick_id', pickId)
    .single()

  return NextResponse.json(data ?? null)
}
