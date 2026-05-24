'use client'
import { useState, useEffect, useRef } from 'react'
import { TEAM_MAP } from '@/lib/teams'
import { Tier } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface MatchEvent {
  id: string
  home_team: string; away_team: string
  home_score: number; away_score: number
  stage: string; group?: string; winner?: string
}

interface RankEntry {
  id: string; name: string
  team1: string; team2: string; team3: string; team4: string
  total_cost: number; pts: number; rank: number
}

interface GroupTable {
  team: string; group: string; pts: number; gd: number; gf: number; played: number
}

type Phase = 'idle' | 'running' | 'done'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TIER_COLORS: Record<Tier, string> = { A: '#D72638', B: '#2A4AB0', C: '#1A6A2A', D: '#7A5A00' }

function Flag({ team, size = 'md' }: { team: string; size?: 'sm' | 'md' | 'lg' }) {
  const t = TEAM_MAP.get(team)
  const sz = size === 'sm' ? '1rem' : size === 'lg' ? '2rem' : '1.4rem'
  return <span style={{ fontSize: sz, lineHeight: 1 }}>{t?.flag ?? '🏳'}</span>
}

function TeamName({ team, bold }: { team: string; bold?: boolean }) {
  return <span className={bold ? 'font-bold text-white' : 'text-white/80'}>{team}</span>
}

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: 'Groups', ROUND_OF_32: 'R32', ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', FINAL: '🏆 Final',
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LivePage() {
  const [phase, setPhase]         = useState<Phase>('idle')
  const [stage, setStage]         = useState('')
  const [feed, setFeed]           = useState<MatchEvent[]>([])
  const [ranking, setRanking]     = useState<RankEntry[]>([])
  const [prevRanks, setPrevRanks] = useState<Record<string, number>>({})
  const [standings, setStandings] = useState<Record<string, GroupTable[]> | null>(null)
  const [champion, setChampion]   = useState<{ team: string; flag: string } | null>(null)
  const [elapsed, setElapsed]     = useState(0)
  const feedRef   = useRef<HTMLDivElement>(null)
  const esRef     = useRef<EventSource | null>(null)
  const startRef  = useRef<number>(0)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  const TOTAL = 300 // seconds

  function start() {
    setPhase('running')
    setFeed([]); setRanking([]); setStandings(null); setChampion(null); setElapsed(0)
    startRef.current = Date.now()

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 500)

    const es = new EventSource('/api/simulate-live')
    esRef.current = es

    es.addEventListener('init', (e) => {
      const { picks } = JSON.parse(e.data)
      setRanking(picks.map((p: RankEntry, i: number) => ({ ...p, pts: 0, rank: i + 1 })))
    })

    es.addEventListener('stage', (e) => {
      const { label } = JSON.parse(e.data)
      setStage(label)
      setStandings(null)
    })

    es.addEventListener('match', (e) => {
      const m: MatchEvent = JSON.parse(e.data)
      const id = `${m.home_team}-${m.away_team}-${Date.now()}`
      setFeed(prev => [{ ...m, id }, ...prev].slice(0, 80))
    })

    es.addEventListener('ranking', (e) => {
      const data: RankEntry[] = JSON.parse(e.data)
      setPrevRanks(prev => {
        const next = { ...prev }
        ranking.forEach(r => { next[r.name] = r.rank })
        return next
      })
      setRanking(data)
    })

    es.addEventListener('standings', (e) => {
      setStandings(JSON.parse(e.data))
    })

    es.addEventListener('champion', (e) => {
      setChampion(JSON.parse(e.data))
    })

    es.addEventListener('done', () => {
      setPhase('done')
      if (timerRef.current) clearInterval(timerRef.current)
      es.close()
    })

    es.onerror = () => {
      if (phase === 'running') {
        setPhase('done')
        if (timerRef.current) clearInterval(timerRef.current)
      }
      es.close()
    }
  }

  function restart() {
    esRef.current?.close()
    if (timerRef.current) clearInterval(timerRef.current)
    setPhase('idle'); setFeed([]); setRanking([]); setStage(''); setStandings(null); setChampion(null); setElapsed(0)
  }

  useEffect(() => () => { esRef.current?.close(); if (timerRef.current) clearInterval(timerRef.current) }, [])

  const pct = Math.min((elapsed / TOTAL) * 100, 100)
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  // ── Idle screen ──────────────────────────────────────────────────────────────
  if (phase === 'idle') return (
    <div
      style={{ background: 'linear-gradient(135deg, #060B1A 0%, #0B1B4D 50%, #1A0A0A 100%)', minHeight: 'calc(100vh - 7rem)' }}
      className="flex flex-col items-center justify-center px-4 text-center"
    >
      <div className="text-6xl mb-4">⚽</div>
      <h1 style={{ fontFamily: 'Impact, sans-serif', fontSize: 'clamp(2rem, 6vw, 4rem)', background: 'linear-gradient(90deg, #F5C518, #D72638)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        LIVE SIMULATION
      </h1>
      <p className="text-white/50 mt-3 mb-2 max-w-md">
        Watch the 2026 World Cup play out in real time. 10 participants, 103 matches, 5 minutes.
      </p>
      <p className="text-white/30 text-sm mb-10">Rankings update live after every match.</p>
      <button
        onClick={start}
        className="px-10 py-4 rounded-2xl font-bold text-xl tracking-widest uppercase transition-all hover:scale-105 active:scale-95"
        style={{ background: 'linear-gradient(135deg, #D72638, #8B0A1A)', color: '#fff', fontFamily: 'Impact, sans-serif', letterSpacing: '0.12em', boxShadow: '0 0 40px rgba(215,38,56,0.4)' }}
      >
        ▶ START THE WORLD CUP
      </button>
    </div>
  )

  // ── Champion screen overlay ───────────────────────────────────────────────────
  const ChampionBanner = champion && (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center text-center px-4"
      style={{ background: 'rgba(6,11,26,0.95)', backdropFilter: 'blur(8px)' }}
    >
      <div style={{ fontSize: '5rem', lineHeight: 1 }}>{champion.flag}</div>
      <h2 style={{ fontFamily: 'Impact, sans-serif', fontSize: 'clamp(2.5rem, 8vw, 5rem)', background: 'linear-gradient(90deg, #F5C518, #D72638)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', letterSpacing: '0.05em' }}>
        {champion.team.toUpperCase()}
      </h2>
      <p style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.5rem', color: '#F5C518', letterSpacing: '0.2em' }}>
        2026 WORLD CUP CHAMPION
      </p>
      {ranking[0] && (
        <p className="text-white/60 mt-4 text-sm">
          🏆 Quiniela winner: <strong className="text-white">{ranking[0].name}</strong> with {ranking[0].pts.toLocaleString()} pts
        </p>
      )}
      <button onClick={restart} className="mt-8 px-6 py-2 rounded-xl border border-white/20 text-white/60 hover:text-white hover:border-white/40 text-sm transition-colors">
        Run again
      </button>
    </div>
  )

  // ── Running / Done screen ─────────────────────────────────────────────────────
  return (
    <div style={{ background: '#060B1A', minHeight: 'calc(100vh - 7rem)' }}>
      {ChampionBanner}

      {/* Header bar */}
      <div style={{ background: 'linear-gradient(90deg, #0B1B4D, #1A0A1A)', borderBottom: '1px solid rgba(255,255,255,0.08)' }} className="sticky top-14 z-30 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {phase === 'running' && <span className="w-2 h-2 rounded-full bg-[#D72638] animate-pulse inline-block" />}
            <span style={{ fontFamily: 'Impact, sans-serif', color: '#F5C518', fontSize: '1.1rem', letterSpacing: '0.1em' }}>
              {stage || 'INITIALISING…'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white/40 text-sm font-mono">{mm}:{ss}</span>
            {phase === 'done' && (
              <button onClick={restart} className="px-4 py-1 rounded-lg border border-white/20 text-white/60 hover:text-white text-sm transition-colors">
                Run again
              </button>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="max-w-6xl mx-auto mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #D72638, #F5C518)' }}
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">

        {/* ── Left: match feed ─────────────────────────────────────────────────── */}
        <div>
          {/* Group standings (shown after R3) */}
          {standings && (
            <div
              style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
              className="rounded-xl p-4 mb-4 overflow-x-auto"
            >
              <p style={{ fontFamily: 'Impact, sans-serif', color: '#F5C518', letterSpacing: '0.1em' }} className="mb-3">GROUP STANDINGS</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {Object.entries(standings).map(([g, table]) => (
                  <div key={g} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px' }}>
                    <p className="text-[#F5C518] text-xs font-bold mb-1">Group {g}</p>
                    {(table as GroupTable[]).map((row, i) => (
                      <div key={row.team} className="flex items-center justify-between gap-1 py-0.5">
                        <span style={{ color: i < 2 ? '#4ACA6A' : 'rgba(255,255,255,0.35)', fontSize: '0.7rem' }}>
                          {i < 2 ? '↑' : '·'} {row.team}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{row.pts}pt</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Match feed */}
          <div ref={feedRef} className="space-y-1.5">
            {feed.length === 0 && phase === 'running' && (
              <div className="text-center text-white/30 py-12 text-sm">Waiting for kick-off…</div>
            )}
            {feed.map((m, idx) => {
              const hWin = m.home_score > m.away_score
              const aWin = m.away_score > m.home_score
              const isNew = idx === 0
              const stageLabel = STAGE_LABELS[m.stage] ?? m.stage
              const hTeam = TEAM_MAP.get(m.home_team)
              const aTeam = TEAM_MAP.get(m.away_team)
              return (
                <div
                  key={m.id}
                  style={{
                    background: isNew
                      ? 'linear-gradient(145deg, #1A1000, #2A1800)'
                      : 'linear-gradient(145deg, #0D1F4A, #0A1020)',
                    border: `1px solid ${isNew ? 'rgba(245,197,24,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    opacity: Math.max(0.4, 1 - idx * 0.012),
                    transition: 'all 0.3s ease',
                  }}
                  className="rounded-lg px-3 py-2 flex items-center gap-2"
                >
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-bold shrink-0"
                    style={{
                      background: m.stage === 'FINAL' ? '#F5C518' : m.stage === 'GROUP_STAGE' ? 'rgba(255,255,255,0.1)' : 'rgba(215,38,56,0.3)',
                      color: m.stage === 'FINAL' ? '#000' : '#fff',
                      minWidth: '2.5rem',
                      textAlign: 'center',
                    }}
                  >
                    {stageLabel}
                  </span>

                  {/* Home */}
                  <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
                    <span className="text-xs truncate" style={{ color: hWin ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: hWin ? 700 : 400 }}>
                      {m.home_team}
                    </span>
                    <span style={{ fontSize: '1.2rem' }}>{hTeam?.flag}</span>
                  </div>

                  {/* Score */}
                  <div
                    style={{
                      fontFamily: 'Impact, sans-serif',
                      fontSize: '1.1rem',
                      letterSpacing: '0.1em',
                      color: isNew ? '#F5C518' : '#fff',
                      minWidth: '3.5rem',
                      textAlign: 'center',
                    }}
                  >
                    {m.home_score} – {m.away_score}
                  </div>

                  {/* Away */}
                  <div className="flex items-center gap-1 flex-1 justify-start min-w-0">
                    <span style={{ fontSize: '1.2rem' }}>{aTeam?.flag}</span>
                    <span className="text-xs truncate" style={{ color: aWin ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: aWin ? 700 : 400 }}>
                      {m.away_team}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right: live ranking ───────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-32 lg:self-start">
          <div
            style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
            className="rounded-xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span style={{ fontFamily: 'Impact, sans-serif', color: '#F5C518', letterSpacing: '0.1em' }}>RANKING</span>
              <span className="text-white/30 text-xs">{feed.length} matches</span>
            </div>
            <div className="divide-y divide-white/5">
              {ranking.length === 0 && (
                <div className="px-4 py-8 text-center text-white/30 text-sm">Starting…</div>
              )}
              {ranking.map((p, i) => {
                const prev = prevRanks[p.name]
                const moved = prev !== undefined ? prev - p.rank : 0
                const isLeader = i === 0
                const teams = [p.team1, p.team2, p.team3, p.team4].map(t => TEAM_MAP.get(t))

                return (
                  <div
                    key={p.id}
                    style={{
                      background: isLeader ? 'linear-gradient(145deg, rgba(245,197,24,0.1), rgba(245,197,24,0.05))' : 'transparent',
                      transition: 'background 0.4s ease',
                    }}
                    className="px-4 py-2.5 flex items-center gap-3"
                  >
                    {/* Rank */}
                    <div className="w-6 text-center">
                      <span style={{ fontFamily: 'Impact, sans-serif', color: isLeader ? '#F5C518' : 'rgba(255,255,255,0.3)', fontSize: '0.95rem' }}>
                        {i + 1}
                      </span>
                    </div>

                    {/* Move indicator */}
                    <div className="w-4 text-center text-xs">
                      {moved > 0 && <span style={{ color: '#4ACA6A' }}>▲</span>}
                      {moved < 0 && <span style={{ color: '#D72638' }}>▼</span>}
                      {moved === 0 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>–</span>}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p style={{ color: isLeader ? '#fff' : 'rgba(255,255,255,0.8)', fontWeight: isLeader ? 700 : 400, fontSize: '0.875rem', lineHeight: 1.2 }}>
                        {p.name}
                      </p>
                      <div className="flex gap-1 mt-0.5">
                        {teams.map((t, j) => t && (
                          <span key={j} className="text-sm leading-none" title={t.name}>{t.flag}</span>
                        ))}
                      </div>
                    </div>

                    {/* Points */}
                    <div style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.1rem', color: isLeader ? '#F5C518' : '#fff', minWidth: '4rem', textAlign: 'right' }}>
                      {p.pts.toLocaleString()}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
