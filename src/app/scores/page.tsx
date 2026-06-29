'use client'
import { useEffect, useState } from 'react'
import { TEAM_MAP, SCORING } from '@/lib/teams'

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

// Returns { pts, advancePts } so MatchCard can display the advance bonus separately.
// advancePts > 0 for knockout winners: R32 winner earns the R16 entry advance,
// R16+ winner earns the next-round entry advance, Final winner also earns champion bonus.
function teamPoints(fdName: string, gf: number, ga: number, stage: string, winner: string | null, side: 'home' | 'away'): { pts: number; advancePts: number } | null {
  const ourName = FD_TO_OURS[fdName] ?? fdName
  const team = TEAM_MAP.get(ourName)
  if (!team) return null
  const s = SCORING[team.tier]
  const base = gf > ga ? s.win : gf === ga ? s.draw : s.loss
  const matchPts = base + gf * s.goalFor + ga * s.goalAgainst

  // Round Advanced bonus: R32 winner earns R16 entry; R16/QF/SF/Final winner earns next-round entry
  const advanceStages = new Set(['LAST_32', 'ROUND_OF_32', 'LAST_16', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'])
  let advancePts = 0
  if (advanceStages.has(stage)) {
    const sideWon = winner === (side === 'home' ? 'HOME_TEAM' : 'AWAY_TEAM')
    if (sideWon) {
      advancePts += s.advanceRound
      if (stage === 'FINAL') advancePts += s.champion
    }
  }

  return { pts: matchPts + advancePts, advancePts }
}

interface HeatMatch {
  id: number
  utcDate: string
  homeTeam: string
  awayTeam: string
  homePickers: number
  awayPickers: number
  homePickerNames: string[]
  awayPickerNames: string[]
  affected: number
  totalPlayers: number
  maxPtsAtStake: number
  heatScore: number
  emoji: string
  label: string
  color: string
}

interface MatchScore {
  id: number
  utcDate: string
  status: string
  stage: string
  group?: string
  homeTeam: { name: string; crest: string }
  awayTeam: { name: string; crest: string }
  score: {
    winner?: string | null          // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
    duration?: string               // 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'
    fullTime: { home: number | null; away: number | null }
    halfTime: { home: number | null; away: number | null }
    extraTime?: { home: number | null; away: number | null }
    penalties?: { home: number | null; away: number | null }
  }
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  SCHEDULED:  { label: 'Upcoming',  color: '#2A4AB0' },
  TIMED:      { label: 'Upcoming',  color: '#2A4AB0' },
  IN_PLAY:    { label: '🔴 LIVE',   color: '#D72638' },
  PAUSED:     { label: 'Half Time', color: '#F5C518' },
  FINISHED:   { label: 'Final',     color: '#1A6A2A' },
  POSTPONED:  { label: 'Postponed', color: '#7A7A7A' },
  SUSPENDED:  { label: 'Suspended', color: '#7A7A7A' },
}

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE:    'Group Stage',
  ROUND_OF_32:    'Round of 32',
  ROUND_OF_16:    'Round of 16',
  QUARTER_FINALS: 'Quarterfinals',
  SEMI_FINALS:    'Semifinals',
  FINAL:          'Final',
}

function MatchCard({ match, heat }: { match: MatchScore; heat?: HeatMatch }) {
  const status = STATUS_LABELS[match.status] ?? { label: match.status, color: '#666' }
  const isLive = match.status === 'IN_PLAY' || match.status === 'PAUSED'
  const isFinished = match.status === 'FINISHED'
  const hasScore = isLive || isFinished

  return (
    <div
      style={{
        background: isLive
          ? 'linear-gradient(145deg, #1A0A0A, #2A0A0A)'
          : 'linear-gradient(145deg, #0D1F4A, #111827)',
        border: `1px solid ${isLive ? '#D72638' : heat ? `${heat.color}44` : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isLive ? '0 0 16px rgba(215,38,56,0.2)' : 'none',
      }}
      className="rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-white/40">
          {STAGE_LABELS[match.stage] ?? match.stage}
          {match.group ? ` · ${match.group}` : ''}
        </span>
        <div className="flex items-center gap-2">
          {heat && (
            <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${heat.color}22`, color: heat.color }}>
              {heat.emoji} {heat.heatScore} · {heat.affected} players
            </span>
          )}
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${status.color}22`, color: status.color }}
          >
            {status.label}
          </span>
        </div>
      </div>

      {(() => {
        const isPSO = match.score.duration === 'PENALTY_SHOOTOUT'
        const isET = match.score.duration === 'EXTRA_TIME'
        // Use ET score when decided in extra time; FT score for penalties (tied FT/ET)
        const hg = (isET ? match.score.extraTime?.home : null) ?? match.score.fullTime.home ?? 0
        const ag = (isET ? match.score.extraTime?.away : null) ?? match.score.fullTime.away ?? 0
        const winner = match.score.winner ?? null
        const homeResult = teamPoints(match.homeTeam.name, hg, ag, match.stage, winner, 'home')
        const awayResult = teamPoints(match.awayTeam.name, ag, hg, match.stage, winner, 'away')
        const homePts = hasScore ? homeResult?.pts ?? null : null
        const awayPts = hasScore ? awayResult?.pts ?? null : null
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 text-right">
              <p className="font-bold text-white text-sm">{match.homeTeam.name}</p>
              {homePts != null && (
                <p className="text-xs font-bold tabular-nums" style={{ color: homePts > 0 ? '#4ACA6A' : homePts < 0 ? '#D72638' : 'rgba(255,255,255,0.3)' }}>
                  {homePts > 0 ? '+' : ''}{homePts} pts
                  {(homeResult?.advancePts ?? 0) > 0 && (
                    <span className="ml-1 text-[10px] font-normal" style={{ color: '#F5C518' }}>🏅+{homeResult!.advancePts}</span>
                  )}
                </p>
              )}
              {heat && heat.homePickers > 0 && (
                <p className="text-[10px] text-white/30">{heat.homePickers} picks</p>
              )}
            </div>

            <div
              className="text-center px-3 py-1 rounded-lg min-w-16"
              style={{ background: hasScore ? 'rgba(255,255,255,0.08)' : 'transparent' }}
            >
              {hasScore ? (
                <div>
                  <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.3rem', letterSpacing: '0.1em' }}>
                    {hg} – {ag}
                  </span>
                  {(isPSO || isET) && (
                    <p className="text-[10px] text-white/40 mt-0.5">{isPSO ? 'PSO' : 'AET'}</p>
                  )}
                </div>
              ) : (
                <span className="text-white/40 text-sm">
                  {new Date(match.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="flex-1 text-left">
              <p className="font-bold text-white text-sm">{match.awayTeam.name}</p>
              {awayPts != null && (
                <p className="text-xs font-bold tabular-nums" style={{ color: awayPts > 0 ? '#4ACA6A' : awayPts < 0 ? '#D72638' : 'rgba(255,255,255,0.3)' }}>
                  {awayPts > 0 ? '+' : ''}{awayPts} pts
                  {(awayResult?.advancePts ?? 0) > 0 && (
                    <span className="ml-1 text-[10px] font-normal" style={{ color: '#F5C518' }}>🏅+{awayResult!.advancePts}</span>
                  )}
                </p>
              )}
              {heat && heat.awayPickers > 0 && (
                <p className="text-[10px] text-white/30">{heat.awayPickers} picks</p>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export default function ScoresPage() {
  const [matches, setMatches] = useState<MatchScore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [heatMatches, setHeatMatches] = useState<HeatMatch[]>([])
  const [heatVerdict, setHeatVerdict] = useState('')
  const [heatDate, setHeatDate] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/scores')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        setMatches(data.matches ?? [])
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
    async function loadHeat() {
      try {
        const res = await fetch('/api/heat-index')
        const data = await res.json()
        setHeatMatches(data.matches ?? [])
        setHeatVerdict(data.verdict ?? '')
        if ((data.matches ?? []).length > 0) {
          const first = new Date(data.matches[0].utcDate)
          setHeatDate(first.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }))
        }
      } catch { /* silent */ }
    }
    load()
    loadHeat()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  const live = matches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED')
  const today = matches.filter(m => {
    const d = new Date(m.utcDate)
    const now = new Date()
    return d.toDateString() === now.toDateString() && (m.status === 'SCHEDULED' || m.status === 'TIMED')
  })
  const finished = matches.filter(m => m.status === 'FINISHED')

  return (
    <section className="max-w-4xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1
          style={{
            fontFamily: 'Impact, sans-serif',
            fontSize: 'clamp(2rem, 6vw, 3.5rem)',
            background: 'linear-gradient(90deg, #F5C518, #D72638)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          LIVE SCORES
        </h1>
        <p className="text-white/40 text-xs mt-1">Auto-refreshes every 60 seconds</p>
      </div>

      {loading && <div className="text-center text-white/40 py-20">Loading scores…</div>}

      {error && (
        <div
          className="text-center py-16 px-6 rounded-xl"
          style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <p className="text-white/60 mb-2">Live scores not available yet</p>
          <p className="text-white/30 text-sm">
            Add your <code className="text-[#F5C518]">FOOTBALL_DATA_API_KEY</code> to <code>.env.local</code> to enable live match data.
          </p>
          <a
            href="https://www.football-data.org/client/register"
            className="inline-block mt-4 text-[#F5C518] hover:underline text-sm"
            target="_blank" rel="noreferrer"
          >
            Get a free API key →
          </a>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-8">
          {live.length > 0 && (
            <div>
              <h2 className="text-[#D72638] text-sm font-bold uppercase tracking-widest mb-3">🔴 Live Now</h2>
              <div className="grid gap-3 sm:grid-cols-2">{live.map(m => <MatchCard key={m.id} match={m} />)}</div>
            </div>
          )}
          {today.length > 0 && (
            <div>
              <h2 className="text-white/60 text-sm font-bold uppercase tracking-widest mb-3">Today</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {today
                  .map(m => ({ m, heat: heatMatches.find(h => h.homeTeam === m.homeTeam.name || h.awayTeam === m.awayTeam.name) }))
                  .sort((a, b) => (b.heat?.heatScore ?? 0) - (a.heat?.heatScore ?? 0))
                  .map(({ m, heat }) => <MatchCard key={m.id} match={m} heat={heat} />)}
              </div>
            </div>
          )}

          {heatMatches.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(145deg, #0a1628, #0f1f3d)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {/* Header */}
              <div className="px-5 pt-5 pb-3 border-b border-white/5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-0.5">🌡️ Heat Index</p>
                <h2 style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.1rem', letterSpacing: '0.03em', color: 'rgba(255,255,255,0.85)' }}>
                  Quiniela 2026 — {heatDate}
                </h2>
              </div>

              {/* Match rows */}
              <div className="divide-y divide-white/5">
                {heatMatches.map(m => {
                  const kickoff = new Date(m.utcDate)
                  const etTime = kickoff.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', hour12: true })

                  // Build player tag groups: "Name1, Name2 (Team) · Name3 (Team)"
                  const groups: string[] = []
                  if (m.homePickerNames.length > 0) groups.push(`${m.homePickerNames.join(', ')} (${m.homeTeam})`)
                  if (m.awayPickerNames.length > 0) groups.push(`${m.awayPickerNames.join(', ')} (${m.awayTeam})`)
                  const playerLine = groups.join(' · ')

                  return (
                    <div key={m.id} className="px-5 py-4">
                      {/* Top line: emoji + teams + time */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base leading-none">{m.emoji}</span>
                          <span className="font-bold text-white text-sm">{m.homeTeam} vs {m.awayTeam}</span>
                        </div>
                        <span className="text-white/30 text-xs whitespace-nowrap">{etTime} ET</span>
                      </div>

                      {/* Score + label + bar */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-sm tabular-nums" style={{ color: m.color, fontFamily: 'Impact, sans-serif' }}>{m.heatScore}/100</span>
                        <span className="text-xs text-white/40">—</span>
                        <span className="text-xs text-white/50">{m.label}</span>
                        <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${m.heatScore}%`, background: m.color }} />
                        </div>
                      </div>

                      {/* Affected count */}
                      <p className="text-xs text-white/40 mb-1.5">
                        {m.affected} of {m.totalPlayers} players affected
                      </p>

                      {/* Player tags */}
                      {playerLine && (
                        <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                          {playerLine}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Verdict */}
              {heatVerdict && (
                <div className="px-5 py-4 border-t border-white/5">
                  <p className="text-xs italic" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    <span className="text-white/20 not-italic">Verdict: </span>{heatVerdict}
                  </p>
                </div>
              )}
            </div>
          )}
          {finished.length > 0 && (() => {
            const byDate = new Map<string, typeof finished>()
            for (const m of [...finished].sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())) {
              const day = new Date(m.utcDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
              if (!byDate.has(day)) byDate.set(day, [])
              byDate.get(day)!.push(m)
            }
            return (
              <div className="space-y-6">
                {[...byDate.entries()].map(([day, dayMatches]) => (
                  <div key={day}>
                    <h2 className="text-white/40 text-xs font-bold uppercase tracking-widest mb-3">{day}</h2>
                    <div className="grid gap-3 sm:grid-cols-2">{dayMatches.map(m => <MatchCard key={m.id} match={m} />)}</div>
                  </div>
                ))}
              </div>
            )
          })()}
          {!live.length && !today.length && !finished.length && (
            <div className="text-center text-white/40 py-20">No matches found yet. Tournament starts June 11!</div>
          )}
        </div>
      )}
    </section>
  )
}
