'use client'
import { useEffect, useState } from 'react'
import { TEAM_MAP } from '@/lib/teams'
import Flag from '@/components/Flag'

interface TeamPoints { name: string; points: number }
interface FunStat { icon: string; label: string; playerName: string; value: string }

interface RankedPick {
  id: string
  rank: number
  name: string
  team1: string | null; team2: string | null; team3: string | null
  team4: string | null; team5: string | null
  team_points?: TeamPoints[]
  live_teams?: string[]
  total_cost: number
  total_points: number
  wildcard_used?: boolean
  host_bonus?: number
}

const MEDAL = ['🥇', '🥈', '🥉']

function TeamPointsPill({ name, points, live }: { name: string; points: number; live?: boolean }) {
  const team = TEAM_MAP.get(name)
  if (!team) return null
  const positive = points > 0
  const negative = points < 0
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
      style={{
        background: live ? 'rgba(239,68,68,0.12)' : positive ? 'rgba(74,202,106,0.1)' : negative ? 'rgba(215,38,56,0.1)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${live ? 'rgba(239,68,68,0.5)' : positive ? 'rgba(74,202,106,0.3)' : negative ? 'rgba(215,38,56,0.3)' : 'rgba(255,255,255,0.1)'}`,
      }}
    >
      <Flag code={team.code} name={team.name} size={16} />
      <span style={{ color: live ? '#FCA5A5' : positive ? '#4ACA6A' : negative ? '#D72638' : 'rgba(255,255,255,0.5)' }}>
        {team.name}
      </span>
      <span
        className="font-bold tabular-nums"
        style={{ color: live ? '#FCA5A5' : positive ? '#4ACA6A' : negative ? '#D72638' : 'rgba(255,255,255,0.3)' }}
      >
        {points > 0 ? '+' : ''}{points}
      </span>
      {live && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
    </span>
  )
}

export default function RankingPage() {
  const [picks, setPicks] = useState<RankedPick[]>([])
  const [funStats, setFunStats] = useState<FunStat[]>([])
  const [tournamentStarted, setTournamentStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/ranking')
      .then(r => r.json())
      .then(d => {
        setPicks(d.ranked ?? [])
        setFunStats(d.fun_stats ?? [])
        setTournamentStarted(d.tournamentStarted ?? false)
        setLoading(false)
      })
      .catch(() => { setError('Could not load ranking'); setLoading(false) })
  }, [])

  return (
    <section className="max-w-5xl mx-auto px-4 py-10">
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
          RANKING
        </h1>
        <p className="text-white/50 text-sm mt-1">
          {tournamentStarted ? 'Updated after every match' : 'Teams are hidden until the tournament kicks off'}
        </p>
      </div>

      {!tournamentStarted && picks.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 mb-6 flex items-center gap-3 text-sm"
          style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.25)' }}
        >
          <span className="text-xl">🔒</span>
          <span className="text-white/70">
            <strong className="text-[#F5C518]">{picks.length} entries</strong> locked in — team picks revealed at kick-off on June 11.
          </span>
        </div>
      )}

      {loading && <div className="text-center text-white/40 py-20">Loading ranking…</div>}
      {error && <div className="text-center text-[#D72638] py-20">{error}</div>}

      {!loading && !error && picks.length === 0 && (
        <div className="text-center text-white/40 py-20">
          No picks yet. <a href="/picks" className="text-[#F5C518] hover:underline">Be the first!</a>
        </div>
      )}

      {picks.length > 0 && (
        <div className="space-y-3">
          {picks.map((p, i) => (
            <div
              key={p.id}
              style={{
                background: i === 0
                  ? 'linear-gradient(145deg, #1A1400, #3A2A00)'
                  : 'linear-gradient(145deg, #0D1F4A, #111827)',
                border: `1px solid ${i === 0 ? '#F5C518' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: i === 0 ? '0 0 20px rgba(245,197,24,0.2)' : 'none',
              }}
              className="rounded-xl p-4 flex items-start gap-4"
            >
              <div className="text-2xl min-w-8 text-center">
                {i < 3 ? MEDAL[i] : <span className="text-white/40 text-lg font-bold">#{p.rank}</span>}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-base">{p.name}</span>
                    {(p.live_teams?.length ?? 0) > 0 && (
                      <span
                        className="animate-pulse text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wider"
                        style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#FCA5A5' }}
                      >
                        ● LIVE
                      </span>
                    )}
                    {p.wildcard_used && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/20 text-white/40">wildcard used</span>
                    )}
                    {(p.host_bonus ?? 0) > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#F5C518]/30 text-[#F5C518]">🏟️ +{p.host_bonus}pts</span>
                    )}
                  </div>
                  <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.3rem', color: i === 0 ? '#F5C518' : '#fff' }}>
                    {p.total_points.toLocaleString()} pts
                  </span>
                </div>

                {tournamentStarted && (p.team_points?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[...p.team_points!]
                      .sort((a, b) => (TEAM_MAP.get(b.name)?.cost ?? 0) - (TEAM_MAP.get(a.name)?.cost ?? 0))
                      .map(t => (
                        <TeamPointsPill key={t.name} name={t.name} points={t.points} live={p.live_teams?.includes(t.name)} />
                      ))}
                  </div>
                ) : !tournamentStarted ? (
                  <div className="flex gap-1.5 mt-2">
                    {[1,2,3,4,5].map(n => (
                      <span key={n} className="inline-block w-16 h-5 rounded-lg bg-white/5 border border-white/10" />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="text-right text-xs text-white/30 hidden sm:block">
                <div>{p.total_cost} pts</div>
                <div>budget</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {funStats.length > 0 && (
        <div className="mt-14">
          <h2
            style={{ fontFamily: 'Impact, sans-serif', fontSize: 'clamp(1.2rem, 3vw, 1.8rem)', letterSpacing: '0.05em' }}
            className="mb-1"
          >
            FUN STATS
          </h2>
          <p className="text-white/40 text-xs mb-5">Based on current team lineups</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {funStats.map(s => (
              <div
                key={s.label}
                className="rounded-xl p-4 flex flex-col gap-1"
                style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <span className="text-xl">{s.icon}</span>
                <span className="text-white/40 text-[11px] uppercase tracking-wider leading-tight">{s.label}</span>
                <span className="text-white font-bold text-sm mt-0.5 truncate">{s.playerName}</span>
                <span
                  className="tabular-nums font-bold"
                  style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.1rem', color: '#F5C518' }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
