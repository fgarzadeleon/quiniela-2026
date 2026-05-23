import { NextResponse } from 'next/server'

// football-data.org – free tier, up to 10 req/min
// Sign up at https://www.football-data.org/client/register
// Competition code for 2026 FIFA World Cup: "WC"
const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!FD_KEY) {
    return NextResponse.json({ error: 'FOOTBALL_DATA_API_KEY not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(`${FD_BASE}/competitions/WC/matches?status=LIVE,IN_PLAY,PAUSED,FINISHED`, {
      headers: { 'X-Auth-Token': FD_KEY },
      next: { revalidate: 30 },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: text }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
