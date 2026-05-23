'use client'
import { useEffect, useState } from 'react'
import { TEAM_MAP } from '@/lib/teams'
import { Tier } from '@/types'

interface RankedPick {
  id: string
  rank: number
  name: string
  team1: string; team2: string; team3: string; team4: string
  scorer1?: string; scorer2?: string; scorer3?: string
  total_cost: number
  total_points: number
}

const TIER_FLAG_COLORS: Record<Tier, string> = {
  A: '#D72638',
  B: '#2A4AB0',
  C: '#1A6A2A',
  D: '#7A5A00',
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
      {team.flag} {team.name}
    </span>
  )
}

export default function RankingPage() {
  const [picks, setPicks] = useState<RankedPick[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/ranking')
      .then(r => r.json())
      .then(d => { setPicks(d); setLoading(false) })
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
        <p className="text-white/50 text-sm mt-1">Updated after every match</p>
      </div>

      {loading && (
        <div className="text-center text-white/40 py-20">Loading ranking…</div>
      )}

      {error && (
        <div className="text-center text-[#D72638] py-20">{error}</div>
      )}

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
              {/* Rank */}
              <div className="text-2xl min-w-8 text-center">
                {i < 3 ? MEDAL[i] : <span className="text-white/40 text-lg font-bold">#{p.rank}</span>}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold text-white text-base">{p.name}</span>
                  <span
                    style={{
                      fontFamily: 'Impact, sans-serif',
                      fontSize: '1.3rem',
                      color: i === 0 ? '#F5C518' : '#fff',
                    }}
                  >
                    {p.total_points.toLocaleString()} pts
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <TeamPill name={p.team1} />
                  <TeamPill name={p.team2} />
                  <TeamPill name={p.team3} />
                  <TeamPill name={p.team4} />
                </div>
                {(p.scorer1 || p.scorer2 || p.scorer3) && (
                  <div className="mt-1.5 text-xs text-white/40">
                    ⚽ {[p.scorer1, p.scorer2, p.scorer3].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>

              {/* Budget indicator */}
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
