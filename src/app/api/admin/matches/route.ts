import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase.from('matches').select('*').order('match_date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
