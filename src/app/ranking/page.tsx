'use client'
import { useEffect, useState } from 'react'
import { TEAM_MAP } from '@/lib/teams'

import Flag from '@/components/Flag'

interface TeamPoints { name: string; points: number }
interface FunStat { icon: string; label: string; playerName: string; value: string }
interface TeamTableRow {
  name: string; code: string; tier: string; cost: number
  picks_count: number; wins: number; draws: number; losses: number
  gf: number; ga: number; pts: number
}
interface HostCounts { USA: number; Mexico: number; Canada: number; total: number }
interface HostStats { questions: Record<string, HostCounts>; answers: Record<string, string | null> }

const HOST_QUESTIONS = [
  { key: 'dirtiest',           label: 'Dirtiest Host',       icon: '🟨🟥' },
  { key: 'best',               label: 'Best Host',           icon: '🏆' },
  { key: 'worst',              label: 'Worst Host',          icon: '📉' },
  { key: 'most_goals_for',     label: 'Most Goals Scored',   icon: '⚽' },
  { key: 'most_goals_against', label: 'Most Goals Conceded', icon: '🥅' },
]
const HOST_FLAGS: Record<string, { code: string }> = {
  USA:    { code: 'us' },
  Mexico: { code: 'mx' },
  Canada: { code: 'ca' },
}

interface RankedPick {
  id: string
  rank: number
  name: string
  team1: string | null; team2: string | null; team3: string | null
  team4: string | null; team5: string | null
  wildcard_old_team1?: string | null; wildcard_old_team2?: string | null
  wildcard_old_team3?: string | null; wildcard_old_team4?: string | null
  wildcard_old_team5?: string | null
  wildcard_effective_from?: string | null
  team_points?: TeamPoints[]
  old_team_points?: TeamPoints[]
  wildcard_pending?: boolean
  live_teams?: string[]
  total_cost: number
  total_points: number
  wildcard_used?: boolean
  host_bonus?: number
}

const MEDAL = ['🥇', '🥈', '🥉']

type SubStatus = 'normal' | 'subOut' | 'subIn'

function TeamPointsPill({ name, points, live, sub = 'normal' }: {
  name: string; points: number; live?: boolean; sub?: SubStatus
}) {
  const team = TEAM_MAP.get(name)
  if (!team) return null
  const positive = points > 0
  const negative = points < 0

  if (sub === 'subOut') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
        style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', opacity: 0.75 }}
      >
        <span style={{ color: '#FB923C', fontSize: '0.65rem' }}>▼</span>
        <Flag code={team.code} name={team.name} size={16} />
        <span style={{ color: 'rgba(255,255,255,0.45)' }}>{team.name}</span>
        <span className="font-bold tabular-nums" style={{ color: positive ? '#4ACA6A' : negative ? '#D72638' : 'rgba(255,255,255,0.25)' }}>
          {points > 0 ? '+' : ''}{points}
        </span>
      </span>
    )
  }

  if (sub === 'subIn') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
        style={{ background: 'rgba(74,202,106,0.1)', border: '1px solid rgba(74,202,106,0.3)' }}
      >
        <span style={{ color: '#4ACA6A', fontSize: '0.65rem' }}>▲</span>
        <Flag code={team.code} name={team.name} size={16} />
        <span style={{ color: live ? '#FCA5A5' : '#4ACA6A' }}>{team.name}</span>
        <span className="font-bold tabular-nums" style={{ color: live ? '#FCA5A5' : positive ? '#4ACA6A' : negative ? '#D72638' : 'rgba(255,255,255,0.3)' }}>
          {points > 0 ? '+' : ''}{points}
        </span>
        {live && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
      </span>
    )
  }

  // normal / kept
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
      <span className="font-bold tabular-nums" style={{ color: live ? '#FCA5A5' : positive ? '#4ACA6A' : negative ? '#D72638' : 'rgba(255,255,255,0.3)' }}>
        {points > 0 ? '+' : ''}{points}
      </span>
      {live && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
    </span>
  )
}

type Tab = 'ranking' | 'teams' | 'fun_stats'

export default function RankingPage() {
  const [picks, setPicks] = useState<RankedPick[]>([])
  const [funStats, setFunStats] = useState<FunStat[]>([])
  const [teamTable, setTeamTable] = useState<TeamTableRow[]>([])
  const [tournamentStarted, setTournamentStarted] = useState(false)
  const [liveTeamsGlobal, setLiveTeamsGlobal] = useState<string[]>([])
  const [filterLive, setFilterLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('ranking')
  const [hostStats, setHostStats] = useState<HostStats | null>(null)

  useEffect(() => {
    fetch('/api/ranking')
      .then(r => r.json())
      .then(d => {
        setPicks(d.ranked ?? [])
        setFunStats(d.fun_stats ?? [])
        setTeamTable(d.team_table ?? [])
        setTournamentStarted(d.tournamentStarted ?? false)
        setLiveTeamsGlobal(d.live_teams_global ?? [])
        setLoading(false)
      })
      .catch(() => { setError('Could not load ranking'); setLoading(false) })

    fetch('/api/host-predictions/stats')
      .then(r => r.json())
      .then(d => { if (!d.locked) setHostStats(d) })
      .catch(() => {})
  }, [])

  return (
    <section className="max-w-5xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
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

      {funStats.length > 0 && (
        <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {([['ranking', '🏆 Ranking'], ['teams', '🌍 By Country'], ['fun_stats', '📊 Fun Stats']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer"
              style={{
                fontFamily: 'Impact, sans-serif',
                letterSpacing: '0.06em',
                background: tab === t ? 'linear-gradient(135deg, #D72638, #8B0A1A)' : 'transparent',
                color: tab === t ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'ranking' && liveTeamsGlobal.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setFilterLive(f => !f)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer"
            style={{
              background: filterLive ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${filterLive ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.12)'}`,
              color: filterLive ? '#FCA5A5' : 'rgba(255,255,255,0.5)',
            }}
          >
            <span className={`w-2 h-2 rounded-full bg-red-500 ${filterLive ? 'animate-pulse' : ''}`} />
            LIVE NOW
          </button>
          {liveTeamsGlobal.map(teamName => {
            const team = TEAM_MAP.get(teamName)
            if (!team) return null
            return (
              <span
                key={teamName}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#FCA5A5' }}
              >
                <Flag code={team.code} name={team.name} size={14} />
                {team.name}
              </span>
            )
          })}
        </div>
      )}

      {tab === 'ranking' && (
        <>
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
              {(filterLive ? picks.filter(p => (p.live_teams?.length ?? 0) > 0) : picks).map((p, i) => (
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
                        {p.wildcard_used && !p.wildcard_pending && (p.old_team_points?.length ?? 0) === 0 && (
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
                      <div className="mt-2 space-y-1.5">
                        {/* Substituted-out teams (banked points) */}
                        {(p.old_team_points?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {[...p.old_team_points!]
                              .sort((a, b) => (TEAM_MAP.get(b.name)?.cost ?? 0) - (TEAM_MAP.get(a.name)?.cost ?? 0))
                              .map(t => (
                                <TeamPointsPill key={t.name} name={t.name} points={t.points} sub="subOut" />
                              ))}
                          </div>
                        )}
                        {/* Active teams: sub-in for new, normal for kept */}
                        <div className="flex flex-wrap gap-1.5">
                          {(() => {
                            const oldSet = new Set([
                              p.wildcard_old_team1, p.wildcard_old_team2, p.wildcard_old_team3,
                              p.wildcard_old_team4, p.wildcard_old_team5,
                            ].filter(Boolean))
                            const hasActiveSub = (p.old_team_points?.length ?? 0) > 0
                            return [...p.team_points!]
                              .sort((a, b) => (TEAM_MAP.get(b.name)?.cost ?? 0) - (TEAM_MAP.get(a.name)?.cost ?? 0))
                              .map(t => {
                                const sub: SubStatus = hasActiveSub && !oldSet.has(t.name) ? 'subIn' : 'normal'
                                return <TeamPointsPill key={t.name} name={t.name} points={t.points} live={p.live_teams?.includes(t.name)} sub={sub} />
                              })
                          })()}
                        </div>
                        {/* Pending wildcard notice */}
                        {p.wildcard_pending && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] px-2 py-0.5 rounded border border-[#F5C518]/30 text-[#F5C518]/70">
                              🃏 wildcard queued — new teams reveal next matchday
                            </span>
                          </div>
                        )}
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
        </>
      )}

      {tab === 'teams' && teamTable.length > 0 && (
        <div>
          <p className="text-white/40 text-xs mb-4">Quiniela points earned by each team in the tournament, ranked.</p>
          <div className="space-y-2">
            {teamTable.map((t, i) => {
              const positive = t.pts > 0
              const negative = t.pts < 0
              return (
                <div
                  key={t.name}
                  className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{
                    background: i === 0
                      ? 'linear-gradient(145deg, #1A1400, #3A2A00)'
                      : 'linear-gradient(145deg, #0D1F4A, #111827)',
                    border: `1px solid ${i === 0 ? '#F5C518' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <span className="text-white/30 text-sm font-bold w-6 text-center shrink-0">
                    {i + 1}
                  </span>
                  <Flag code={t.code} name={t.name} size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold text-sm">{t.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-white/30">
                        Tier {t.tier} · {t.cost}pts
                      </span>
                      <span className="text-[10px] text-white/30">{t.picks_count} {t.picks_count === 1 ? 'pick' : 'picks'}</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-[11px] text-white/40">
                      <span>{t.wins}W {t.draws}D {t.losses}L</span>
                      <span>{t.gf}:{t.ga} GD {t.gf - t.ga > 0 ? '+' : ''}{t.gf - t.ga}</span>
                    </div>
                  </div>
                  <span
                    className="font-bold tabular-nums shrink-0"
                    style={{
                      fontFamily: 'Impact, sans-serif',
                      fontSize: '1.2rem',
                      color: i === 0 ? '#F5C518' : positive ? '#4ACA6A' : negative ? '#D72638' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {positive ? '+' : ''}{t.pts}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'fun_stats' && funStats.length > 0 && (
        <div>
          <p className="text-white/40 text-xs mb-5">Based on current team lineups — approximate, wildcard teams included</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
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

          {hostStats && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
                <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '0.75rem', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)' }}>
                  🏟️ HOSTS CHALLENGE
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.08)' }} />
              </div>
              <p className="text-white/40 text-xs mb-4">What everyone picked for each host question</p>
              <div className="space-y-4">
                {HOST_QUESTIONS.map(q => {
                  const counts = hostStats.questions[q.key]
                  const correct = hostStats.answers[q.key]
                  if (!counts || counts.total === 0) return null
                  return (
                    <div
                      key={q.key}
                      className="rounded-xl p-4"
                      style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{q.icon}</span>
                        <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '0.95rem', color: '#F5C518', letterSpacing: '0.05em' }}>
                          {q.label.toUpperCase()}
                        </span>
                        {correct && (
                          <span
                            className="ml-auto text-[10px] px-2 py-0.5 rounded font-bold"
                            style={{ background: 'rgba(74,202,106,0.15)', border: '1px solid rgba(74,202,106,0.35)', color: '#4ACA6A' }}
                          >
                            ✓ {correct}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {(['USA', 'Mexico', 'Canada'] as const).map(host => {
                          const n = counts[host]
                          const pct = Math.round((n / counts.total) * 100)
                          const isCorrect = correct === host
                          const hf = HOST_FLAGS[host]
                          return (
                            <div key={host} className="flex items-center gap-2 text-xs">
                              <div className="flex items-center gap-1 w-20 shrink-0">
                                <Flag code={hf.code} name={host} size={14} />
                                <span style={{ color: isCorrect ? '#4ACA6A' : 'rgba(255,255,255,0.55)' }}>{host}</span>
                              </div>
                              <div className="flex-1 rounded-full overflow-hidden h-2.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${pct}%`,
                                    background: isCorrect ? '#4ACA6A' : 'rgba(255,255,255,0.22)',
                                  }}
                                />
                              </div>
                              <span className="w-10 text-right tabular-nums shrink-0" style={{ color: isCorrect ? '#4ACA6A' : 'rgba(255,255,255,0.4)' }}>
                                {pct}%
                              </span>
                              <span className="w-6 text-right tabular-nums shrink-0 text-white/25">{n}</span>
                            </div>
                          )
                        })}
                      </div>
                      <p className="text-white/20 text-[10px] mt-2">{counts.total} picks</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
