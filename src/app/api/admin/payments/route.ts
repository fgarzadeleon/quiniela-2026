import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
const ADMIN_PW = process.env.ADMIN_PASSWORD ?? 'quiniela2026'

export async function GET(req: NextRequest) {
  const password = req.nextUrl.searchParams.get('password')
  if (password !== ADMIN_PW) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('picks')
    .select('id, name, paid, created_at, total_cost')
    .not('name', 'ilike', 'test%')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { password, id, paid } = await req.json()
  if (password !== ADMIN_PW) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { error } = await supabase.from('picks').update({ paid }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
