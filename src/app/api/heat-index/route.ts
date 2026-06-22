import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { TEAM_MAP, SCORING } from '@/lib/teams'
import { getCurrentRound } from '@/lib/scoring'

export const dynamic = 'force-dynamic'

const FD_BASE = 'https://api.football-data.org/v4'
const FD_KEY = process.env.FOOTBALL_DATA_API_KEY

const FD_TO_OURS: Record<string, string> = {
  'United States':      'USA',
  'Korea Republic':     'South Korea',
  "Côte d'Ivoire":      'Ivory Coast',
  'Ivory Coast':        'Ivory Coast',
  'Cape Verde Islands': 'Cape Verde',
  'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
  'Czechia':            'Czech Republic',
  'Congo DR':           'DR Congo',
  'Curaçao':            'Curacao',
  'Türkiye':            'Turkey',
}

// Round bonus added on top of base score (0–15)
const ROUND_BONUS: Record<string, number> = {
  GROUP_STAGE:    0,
  ROUND_OF_32:    3,
  ROUND_OF_16:    6,
  QUARTER_FINALS: 9,
  SEMI_FINALS:    12,
  FINAL:          15,
}

function heatLabel(score: number): { emoji: string; label: string; color: string } {
  if (score >= 70) return { emoji: '🔴', label: 'Must-watch',  color: '#D72638' }
  if (score >= 40) return { emoji: '🟠', label: 'High impact', color: '#F97316' }
  if (score >= 20) return { emoji: '🟡', label: 'Moderate',    color: '#F5C518' }
  return             { emoji: '⚪', label: 'Low impact',   color: 'rgba(255,255,255,0.4)' }
}

function computeHeatScore(affected: number, maxPtsAtStake: number, roundBonus: number): number {
  const reachScore  = Math.min(50, (affected / 23) * 50) * (85 / 100)
  const ptsScore    = Math.min(50, (maxPtsAtStake / 1955) * 50) * (85 / 100)
  const base        = Math.min(85, Math.round(reachScore + ptsScore))
  return Math.min(100, base + roundBonus)
}

function buildVerdict(matches: Array<{ homeTeam: string; awayTeam: string; heatScore: number; affected: number }>): string {
  if (matches.length === 0) return ''
  const sorted = [...matches].sort((a, b) => b.heatScore - a.heatScore)
  const top = sorted[0]
  const second = sorted[1]

  if (top.heatScore < 15) return 'Quiet day for the quiniela — no single match makes a big dent across the field.'

  let v = `${top.homeTeam} vs ${top.awayTeam} ${top.affected >= 12 ? 'is the match to watch' : 'leads the day'}`

  if (second && second.heatScore >= 20) {
    v += `. ${second.homeTeam} vs ${second.awayTeam} also worth watching`
  }

  const lowCount = sorted.filter(m => m.heatScore < 15).length
  if (lowCount > 0 && sorted.length > 1) {
    const lastLow = sorted[sorted.length - 1]
    v += `. ${lastLow.homeTeam} vs ${lastLow.awayTeam} barely registers across the field`
  }

  return v + '.'
}

export async function GET() {
  const supabase = createServerClient()

  const [{ data: picks }, fdRes] = await Promise.all([
    supabase
      .from('picks')
      .select('name, team1, team2, team3, team4, team5')
      .not('name', 'ilike', 'test%'),
    FD_KEY
      ? fetch(`${FD_BASE}/competitions/WC/matches`, {
          headers: { 'X-Auth-Token': FD_KEY },
          next: { revalidate: 120 },
        }).then(r => r.ok ? r.json() : { matches: [] }).catch(() => ({ matches: [] }))
      : Promise.resolve({ matches: [] }),
  ])

  const realPicks = picks ?? []
  const totalPlayers = realPicks.length
  const now = Date.now()
  const in48h = now + 48 * 60 * 60 * 1000
  const roundBonus = ROUND_BONUS[getCurrentRound()] ?? 0

  const upcoming = ((fdRes.matches ?? []) as Array<Record<string, unknown>>)
    .filter(m => {
      const kickoff = new Date(m.utcDate as string).getTime()
      return kickoff > now && kickoff < in48h && (m.status === 'TIMED' || m.status === 'SCHEDULED')
    })
    .map(m => {
      const homeTeam = m.homeTeam as Record<string, string>
      const awayTeam = m.awayTeam as Record<string, string>
      const home = FD_TO_OURS[homeTeam?.name] ?? homeTeam?.name ?? ''
      const away = FD_TO_OURS[awayTeam?.name] ?? awayTeam?.name ?? ''

      const homeObj = TEAM_MAP.get(home)
      const awayObj = TEAM_MAP.get(away)
      const homeWin = homeObj ? SCORING[homeObj.tier].win : 0
      const awayWin = awayObj ? SCORING[awayObj.tier].win : 0

      const homePickerNames: string[] = []
      const awayPickerNames: string[] = []
      let maxPtsAtStake = 0

      for (const p of realPicks) {
        const teams = [p.team1, p.team2, p.team3, p.team4, p.team5]
        const hasHome = teams.includes(home)
        const hasAway = teams.includes(away)
        if (hasHome) { homePickerNames.push(p.name); maxPtsAtStake += homeWin }
        if (hasAway) { awayPickerNames.push(p.name); maxPtsAtStake += awayWin }
      }

      const affectedSet = new Set([...homePickerNames, ...awayPickerNames])
      const affected = affectedSet.size
      const heatScore = computeHeatScore(affected, maxPtsAtStake, roundBonus)
      const { emoji, label, color } = heatLabel(heatScore)

      return {
        id: m.id,
        utcDate: m.utcDate as string,
        homeTeam: home,
        awayTeam: away,
        homePickers: homePickerNames.length,
        awayPickers: awayPickerNames.length,
        homePickerNames,
        awayPickerNames,
        affected,
        totalPlayers,
        maxPtsAtStake,
        heatScore,
        emoji,
        label,
        color,
      }
    })
    .sort((a, b) => b.heatScore - a.heatScore)

  const verdict = buildVerdict(upcoming)

  return NextResponse.json({ matches: upcoming, totalPlayers, verdict })
}
