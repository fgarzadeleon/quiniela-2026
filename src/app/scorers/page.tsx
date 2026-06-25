'use client'
import { useEffect, useState } from 'react'
import { TEAM_MAP } from '@/lib/teams'
import Flag from '@/components/Flag'

interface ScorerPick { name: string; goals: number; matched: boolean; valid?: boolean; old?: boolean; subIn?: boolean; wcLabel?: string }
interface QuinielaScorerRow { playerName: string; picks: ScorerPick[]; total: number; wildcardPending?: boolean; wcLabel?: string }
interface TopScorer { name: string; team: string; goals: number; assists: number; penalties: number }

const MEDAL = ['🥇', '🥈', '🥉']

export default function ScorersPage() {
  const [tournamentStarted, setTournamentStarted] = useState(false)
  const [topScorers, setTopScorers] = useState<TopScorer[]>([])
  const [quinielaScorers, setQuinielaScorers] = useState<QuinielaScorerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/scorers')
      .then(r => r.json())
      .then(d => {
        setTournamentStarted(d.tournamentStarted ?? false)
        setTopScorers(d.topScorers ?? [])
        setQuinielaScorers(d.quinielaScorers ?? [])
        setLoading(false)
      })
      .catch(() => { setError('Could not load scorer data'); setLoading(false) })
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
          TOP SCORERS
        </h1>
        <p className="text-white/50 text-sm mt-1">
          {tournamentStarted ? 'Live goals from the tournament' : 'Picks revealed at kick-off on June 11'}
        </p>
      </div>

      {loading && <div className="text-center text-white/40 py-20">Loading…</div>}
      {error && <div className="text-center text-[#D72638] py-20">{error}</div>}

      {!loading && !error && (
        <div className="grid lg:grid-cols-2 gap-8">

          {/* Quiniela scorer prize */}
          <div>
            <h2
              style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.3rem', letterSpacing: '0.05em', color: '#F5C518' }}
              className="mb-4"
            >
              ⚽ SCORER PRIZE
            </h2>

            {!tournamentStarted ? (
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm"
                style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.25)' }}
              >
                <span className="text-xl">🔒</span>
                <span className="text-white/70">Scorer picks hidden until kick-off.</span>
              </div>
            ) : quinielaScorers.length === 0 ? (
              <p className="text-white/40 text-sm">No scorer picks yet.</p>
            ) : (
              <div className="space-y-2">
                {quinielaScorers.map((row, i) => (
                  <div
                    key={row.playerName}
                    className="rounded-xl p-4"
                    style={{
                      background: i === 0 ? 'linear-gradient(145deg, #1A1400, #3A2A00)' : 'linear-gradient(145deg, #0D1F4A, #111827)',
                      border: `1px solid ${i === 0 ? '#F5C518' : 'rgba(255,255,255,0.08)'}`,
                      boxShadow: i === 0 ? '0 0 20px rgba(245,197,24,0.15)' : 'none',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{i < 3 ? MEDAL[i] : <span className="text-white/40 text-sm font-bold">#{i + 1}</span>}</span>
                        <span className="font-bold text-white text-sm">{row.playerName}</span>
                      </div>
                      <span
                        style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.2rem', color: i === 0 ? '#F5C518' : '#fff' }}
                      >
                        {row.total} <span className="text-xs font-normal text-white/40">goals</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {row.picks.map(p => {
                        const noGoals = !p.matched || p.valid === false
                        if (p.old) {
                          return (
                            <span key={p.name} className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                              style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', color: 'rgba(255,255,255,0.45)', opacity: 0.8 }}>
                              <span style={{ color: '#FB923C', fontSize: '0.65rem' }}>
                                ▼{p.wcLabel && <span style={{ fontSize: '0.55rem', marginLeft: 1 }}>{p.wcLabel}</span>}
                              </span>
                              {p.name}{p.goals > 0 && <strong style={{ color: '#4ACA6A' }}> · {p.goals}⚽</strong>}
                            </span>
                          )
                        }
                        if (p.subIn) {
                          return (
                            <span key={p.name} className="text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                              style={{ background: 'rgba(74,202,106,0.1)', border: '1px solid rgba(74,202,106,0.3)', color: '#4ACA6A' }}>
                              <span style={{ color: '#4ACA6A', fontSize: '0.65rem' }}>
                                ▲{p.wcLabel && <span style={{ fontSize: '0.55rem', marginLeft: 1 }}>{p.wcLabel}</span>}
                              </span>
                              <span style={{ color: '#4ACA6A' }}>{p.name}</span>
                              {p.goals > 0 && <strong> · {p.goals}⚽</strong>}
                              {!p.matched && <span className="opacity-60"> · ?</span>}
                            </span>
                          )
                        }
                        return (
                          <span
                            key={p.name}
                            className="text-xs px-2 py-0.5 rounded-full"
                            title={!p.matched ? 'Name not found in tournament scorers — possible typo or hasn\'t scored yet' : undefined}
                            style={{
                              background: p.goals > 0 ? 'rgba(74,202,106,0.15)' : p.matched ? 'rgba(255,255,255,0.05)' : 'rgba(245,158,11,0.12)',
                              border: `1px solid ${p.goals > 0 ? 'rgba(74,202,106,0.4)' : p.matched ? 'rgba(255,255,255,0.1)' : 'rgba(245,158,11,0.35)'}`,
                              color: p.goals > 0 ? '#4ACA6A' : p.matched ? 'rgba(255,255,255,0.5)' : '#F59E0B',
                            }}
                          >
                            {p.name}{p.goals > 0 && <strong> · {p.goals}⚽</strong>}
                            {noGoals && <span className="opacity-60"> · ?</span>}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tournament top scorers */}
          <div>
            <h2
              style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.3rem', letterSpacing: '0.05em', color: '#fff' }}
              className="mb-4"
            >
              🏆 TOURNAMENT GOLDEN BOOT
            </h2>

            {!tournamentStarted || topScorers.length === 0 ? (
              <div
                className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <span className="text-white/40">
                  {tournamentStarted ? 'No goals scored yet.' : 'Available once the tournament starts.'}
                </span>
              </div>
            ) : (
              <div
                className="rounded-xl overflow-hidden"
                style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {topScorers.slice(0, 15).map((s, i) => {
                  const team = TEAM_MAP.get(s.team)
                  return (
                    <div
                      key={`${s.name}-${i}`}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0"
                    >
                      <span className="text-white/30 text-xs w-5 text-right">{i + 1}</span>
                      {team ? (
                        <Flag code={team.code} name={team.name} size={16} />
                      ) : (
                        <span className="w-4" />
                      )}
                      <span className="flex-1 text-white text-sm truncate">{s.name}</span>
                      <span className="text-white/40 text-xs hidden sm:block">{s.team}</span>
                      <span
                        style={{ fontFamily: 'Impact, sans-serif', fontSize: '1rem', color: i === 0 ? '#F5C518' : '#fff', minWidth: '2rem', textAlign: 'right' }}
                      >
                        {s.goals}⚽
                      </span>
                      {s.assists > 0 && (
                        <span className="text-white/30 text-xs">{s.assists}🅰</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  )
}
