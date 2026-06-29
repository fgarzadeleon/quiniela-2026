import { NextResponse } from 'next/server'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!FD_KEY) return NextResponse.json({ matches: [] })
  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 30 },
    })
    if (!res.ok) return NextResponse.json({ matches: [] })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ matches: [] })
  }
}
