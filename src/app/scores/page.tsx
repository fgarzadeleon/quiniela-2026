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

function teamPoints(fdName: string, gf: number, ga: number): number | null {
  const ourName = FD_TO_OURS[fdName] ?? fdName
  const team = TEAM_MAP.get(ourName)
  if (!team) return null
  const s = SCORING[team.tier]
  const base = gf > ga ? s.win : gf === ga ? s.draw : s.loss
  return base + gf * s.goalFor + ga * s.goalAgainst
}

interface HeatMatch {
  id: number
  utcDate: string
  homeTeam: string
  awayTeam: string
  homePickers: number
  awayPickers: number
  affected: number
  totalPlayers: number
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
    fullTime: { home: number | null; away: number | null }
    halfTime: { home: number | null; away: number | null }
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
        const hg = match.score.fullTime.home ?? 0
        const ag = match.score.fullTime.away ?? 0
        const homePts = hasScore ? teamPoints(match.homeTeam.name, hg, ag) : null
        const awayPts = hasScore ? teamPoints(match.awayTeam.name, ag, hg) : null
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 text-right">
              <p className="font-bold text-white text-sm">{match.homeTeam.name}</p>
              {homePts != null && (
                <p className="text-xs font-bold tabular-nums" style={{ color: homePts > 0 ? '#4ACA6A' : homePts < 0 ? '#D72638' : 'rgba(255,255,255,0.3)' }}>
                  {homePts > 0 ? '+' : ''}{homePts} pts
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
                <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.3rem', letterSpacing: '0.1em' }}>
                  {hg} – {ag}
                </span>
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
            <div>
              <h2 className="text-white/60 text-sm font-bold uppercase tracking-widest mb-1">🌡️ Upcoming — Heat Index</h2>
              <p className="text-white/30 text-xs mb-3">Next 48h matches ranked by quiniela impact</p>
              <div className="space-y-2">
                {heatMatches.map(m => {
                  const kickoff = new Date(m.utcDate)
                  const timeStr = kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })
                  const dateStr = kickoff.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' })
                  return (
                    <div key={m.id} className="rounded-xl px-4 py-3 flex items-center gap-3"
                      style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: `1px solid ${m.color}44` }}>
                      <div className="flex flex-col items-center min-w-[48px]">
                        <span className="text-lg leading-none">{m.emoji}</span>
                        <span className="font-bold tabular-nums" style={{ color: m.color, fontFamily: 'Impact, sans-serif', fontSize: '1rem' }}>{m.heatScore}</span>
                        <span className="text-[9px] text-white/30 uppercase tracking-wide text-center leading-tight">{m.label}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm">{m.homeTeam} vs {m.awayTeam}</p>
                        <p className="text-white/40 text-xs">{dateStr} · {timeStr} BST</p>
                        <p className="text-xs mt-0.5" style={{ color: m.color }}>
                          {m.affected} of {m.totalPlayers} players
                          {(m.homePickers > 0 || m.awayPickers > 0) && (
                            <span className="text-white/30"> · {m.homeTeam} {m.homePickers} / {m.awayTeam} {m.awayPickers}</span>
                          )}
                        </p>
                      </div>
                      <div className="hidden sm:block w-20 h-1.5 rounded-full bg-white/10 overflow-hidden flex-shrink-0">
                        <div className="h-full rounded-full" style={{ width: `${m.heatScore}%`, background: m.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {finished.length > 0 && (
            <div>
              <h2 className="text-white/60 text-sm font-bold uppercase tracking-widest mb-3">Recent Results</h2>
              <div className="grid gap-3 sm:grid-cols-2">{finished.slice(0, 16).map(m => <MatchCard key={m.id} match={m} />)}</div>
            </div>
          )}
          {!live.length && !today.length && !finished.length && (
            <div className="text-center text-white/40 py-20">No matches found yet. Tournament starts June 11!</div>
          )}
        </div>
      )}
    </section>
  )
}
