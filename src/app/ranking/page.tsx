'use client'
import { useEffect, useState } from 'react'
import { TEAM_MAP } from '@/lib/teams'
import Flag from '@/components/Flag'
import { Tier } from '@/types'

interface ScorerGoal { name: string; goals: number; matched: boolean }

interface RankedPick {
  id: string
  rank: number
  name: string
  team1: string | null; team2: string | null; team3: string | null
  team4: string | null; team5: string | null
  scorer1?: string; scorer2?: string; scorer3?: string
  scorer_goals?: ScorerGoal[]
  total_cost: number
  total_points: number
  wildcard_used?: boolean
  host_bonus?: number
}

const TIER_FLAG_COLORS: Record<Tier, string> = {
  A: '#D72638', B: '#2A4AB0', C: '#1A6A2A', D: '#7A5A00',
}

const MEDAL = ['🥇', '🥈', '🥉']

function TeamPill({ name }: { name: string }) {
  const team = TEAM_MAP.get(name)
  if (!team) return <span className="text-white/40 text-xs">{name}</span>
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
      style={{ border: `1px solid ${TIER_FLAG_COLORS[team.tier]}40`, background: `${TIER_FLAG_COLORS[team.tier]}15` }}
    >
      <Flag code={team.code} name={team.name} size={16} /> {team.name}
    </span>
  )
}

export default function RankingPage() {
  const [picks, setPicks] = useState<RankedPick[]>([])
  const [tournamentStarted, setTournamentStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/ranking')
      .then(r => r.json())
      .then(d => {
        setPicks(d.ranked ?? [])
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
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-base">{p.name}</span>
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

                {tournamentStarted && p.team1 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[p.team1, p.team2, p.team3, p.team4, p.team5].filter(Boolean).map(t => (
                      <TeamPill key={t} name={t!} />
                    ))}
                  </div>
                ) : (
                  <div className="flex gap-1.5 mt-2">
                    {[1,2,3,4,5].map(n => (
                      <span key={n} className="inline-block w-16 h-5 rounded-full bg-white/5 border border-white/10" />
                    ))}
                  </div>
                )}

                {tournamentStarted && (p.scorer_goals?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.scorer_goals!.map(s => (
                      <span
                        key={s.name}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: s.goals > 0
                            ? 'rgba(74,202,106,0.15)'
                            : s.matched
                            ? 'rgba(255,255,255,0.05)'
                            : 'rgba(245,158,11,0.12)',
                          border: `1px solid ${s.goals > 0 ? 'rgba(74,202,106,0.4)' : s.matched ? 'rgba(255,255,255,0.1)' : 'rgba(245,158,11,0.35)'}`,
                          color: s.goals > 0 ? '#4ACA6A' : s.matched ? 'rgba(255,255,255,0.45)' : '#F59E0B',
                        }}
                      >
                        {s.name}{s.goals > 0 && <strong> · {s.goals}⚽</strong>}
                        {!s.matched && <span className="opacity-60"> · ?</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-right text-xs text-white/30 hidden sm:block">
                <div>{p.total_cost} pts</div>
                <div>budget</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
