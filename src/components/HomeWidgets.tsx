'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Flag from './Flag'
import { TEAM_MAP } from '@/lib/teams'

interface RankRow {
  id: string
  rank: number
  name: string
  total_points: number
  live_teams?: string[]
  team_points?: Array<{ name: string; points: number }>
  team1: string | null; team2: string | null; team3: string | null
  team4: string | null; team5: string | null
}

interface ScorerPick { name: string; goals: number; matched: boolean }
interface ScorerRow { playerName: string; picks: ScorerPick[]; total: number }

const MEDAL = ['🥇', '🥈', '🥉']

export default function HomeWidgets() {
  const [ranking, setRanking] = useState<RankRow[]>([])
  const [scorers, setScorers] = useState<ScorerRow[]>([])
  const [tournamentStarted, setTournamentStarted] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/ranking').then(r => r.json()),
      fetch('/api/scorers').then(r => r.json()),
    ]).then(([rd, sd]) => {
      setRanking((rd.ranked ?? []).slice(0, 8))
      setScorers((sd.quinielaScorers ?? []).slice(0, 8))
      setTournamentStarted(rd.tournamentStarted ?? false)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <section className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid md:grid-cols-2 gap-6">
          {[0, 1].map(n => (
            <div key={n} className="rounded-xl p-4 animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="h-5 w-32 rounded bg-white/10 mb-4" />
              {[...Array(5)].map((_, i) => <div key={i} className="h-8 rounded bg-white/5 mb-2" />)}
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (!tournamentStarted || ranking.length === 0) return null

  return (
    <section
      style={{ background: 'linear-gradient(135deg, #060B1A 0%, #0D1F4A 100%)' }}
      className="py-12"
    >
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <h2
            style={{ fontFamily: 'Impact, sans-serif', fontSize: 'clamp(1.3rem, 4vw, 2rem)', letterSpacing: '0.05em' }}
          >
            LIVE STANDINGS
          </h2>
          <Link href="/ranking" className="text-sm text-white/40 hover:text-white transition-colors">
            Full ranking →
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-6">

          {/* Ranking */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-white/5"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <span style={{ fontFamily: 'Impact, sans-serif', letterSpacing: '0.06em', color: '#F5C518', fontSize: '0.9rem' }}>
                🏆 RANKING
              </span>
            </div>

            {ranking.map((p, i) => {
              const isLive = (p.live_teams?.length ?? 0) > 0
              const teams = [p.team1, p.team2, p.team3, p.team4, p.team5]
                .filter(Boolean)
                .sort((a, b) => (TEAM_MAP.get(b!)?.cost ?? 0) - (TEAM_MAP.get(a!)?.cost ?? 0))
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0"
                  style={{ background: i === 0 ? 'rgba(245,197,24,0.06)' : 'transparent' }}
                >
                  <span className="text-base w-6 text-center flex-shrink-0">
                    {i < 3 ? MEDAL[i] : <span className="text-white/30 text-xs font-bold">#{p.rank}</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-white text-sm font-medium truncate">{p.name}</span>
                      {isLive && (
                        <span
                          className="animate-pulse text-[9px] px-1 py-0.5 rounded font-bold tracking-wider flex-shrink-0"
                          style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}
                        >
                          ● LIVE
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 mt-0.5">
                      {teams.map(t => {
                        const team = TEAM_MAP.get(t!)
                        if (!team) return null
                        const isTeamLive = p.live_teams?.includes(t!)
                        return (
                          <span key={t} style={{ position: 'relative', display: 'inline-block' }}>
                            <Flag code={team.code} name={team.name} size={16} />
                            {isTeamLive && (
                              <span
                                className="animate-pulse"
                                style={{
                                  position: 'absolute', top: -3, right: -3,
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: '#EF4444',
                                  border: '1px solid #060B1A',
                                }}
                              />
                            )}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <span
                    className="text-right tabular-nums flex-shrink-0"
                    style={{ fontFamily: 'Impact, sans-serif', fontSize: '1rem', color: i === 0 ? '#F5C518' : '#fff' }}
                  >
                    {p.total_points.toLocaleString()}
                    <span className="text-white/30 text-xs font-normal"> pts</span>
                  </span>
                </div>
              )
            })}

            <div className="px-4 py-2.5 border-t border-white/5">
              <Link href="/ranking" className="text-xs text-white/30 hover:text-white transition-colors">
                View full ranking →
              </Link>
            </div>
          </div>

          {/* Scorer prize */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="px-4 py-2.5 border-b border-white/5"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <span style={{ fontFamily: 'Impact, sans-serif', letterSpacing: '0.06em', color: '#F5C518', fontSize: '0.9rem' }}>
                ⚽ SCORER PRIZE
              </span>
            </div>

            {scorers.map((row, i) => (
              <div
                key={row.playerName}
                className="flex items-start gap-3 px-4 py-2.5 border-b border-white/5 last:border-0"
                style={{ background: i === 0 ? 'rgba(245,197,24,0.06)' : 'transparent' }}
              >
                <span className="text-base w-6 text-center flex-shrink-0 mt-0.5">
                  {i < 3 ? MEDAL[i] : <span className="text-white/30 text-xs font-bold">#{i + 1}</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-white text-sm font-medium">{row.playerName}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {row.picks.map(p => (
                      <span
                        key={p.name}
                        className="text-[11px] px-1.5 py-0.5 rounded"
                        style={{
                          background: p.goals > 0 ? 'rgba(74,202,106,0.12)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${p.goals > 0 ? 'rgba(74,202,106,0.35)' : 'rgba(255,255,255,0.08)'}`,
                          color: p.goals > 0 ? '#4ACA6A' : 'rgba(255,255,255,0.4)',
                        }}
                      >
                        {p.name}{p.goals > 0 && <strong> {p.goals}⚽</strong>}
                      </span>
                    ))}
                  </div>
                </div>
                <span
                  className="flex-shrink-0 tabular-nums"
                  style={{ fontFamily: 'Impact, sans-serif', fontSize: '1rem', color: i === 0 ? '#F5C518' : row.total > 0 ? '#4ACA6A' : 'rgba(255,255,255,0.3)' }}
                >
                  {row.total}
                  <span className="text-white/30 text-xs font-normal"> ⚽</span>
                </span>
              </div>
            ))}

            <div className="px-4 py-2.5 border-t border-white/5">
              <Link href="/scorers" className="text-xs text-white/30 hover:text-white transition-colors">
                View scorer leaderboard →
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
