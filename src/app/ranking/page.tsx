'use client'
import { useEffect, useState } from 'react'
import { TEAM_MAP } from '@/lib/teams'
import Flag from '@/components/Flag'
import BumpsChart from '@/components/BumpsChart'

interface TeamPoints { name: string; points: number }
interface FunStat { icon: string; label: string; playerName: string; value: string }
interface TeamTableRow {
  name: string; code: string; tier: string; cost: number
  picks_count: number; wins: number; draws: number; losses: number
  gf: number; ga: number; pts: number; advance_pts: number; advance_rounds: number
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
  position_change?: number | null
}

const MEDAL = ['🥇', '🥈', '🥉']

const EFFECTIVE_STAGE_LABEL: Record<string, string> = {
  GROUP_STAGE_MD2: 'MD2', GROUP_STAGE_MD3: 'MD3',
  ROUND_OF_32: 'R32', ROUND_OF_16: 'R16',
  QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', FINAL: 'Final',
}

type SubStatus = 'normal' | 'subOut' | 'subIn'

function FormDots({ form }: { form?: { results: Array<'W' | 'D' | 'L'>; qualifiedAtIndex: number | null; qualifiedIndices?: number[] } }) {
  if (!form || form.results.length === 0) return null
  const colors: Record<string, string> = { W: '#4ACA6A', D: 'rgba(255,255,255,0.35)', L: '#D72638' }
  const goldSet = new Set(form.qualifiedIndices ?? (form.qualifiedAtIndex !== null ? [form.qualifiedAtIndex] : []))
  return (
    <span className="flex items-center gap-0.5">
      {form.results.map((r, i) => {
        const isGold = goldSet.has(i)
        return (
          <span key={i} title={isGold ? 'Advanced!' : r === 'W' ? 'Win' : r === 'D' ? 'Draw' : 'Loss'}
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: isGold
                ? `radial-gradient(circle, ${colors[r]} 55%, #F5C518 55%)`
                : colors[r],
              display: 'inline-block', flexShrink: 0,
            }} />
        )
      })}
    </span>
  )
}

function TeamPointsPill({ name, points, live, sub = 'normal', wcLabel, form }: {
  name: string; points: number; live?: boolean; sub?: SubStatus; wcLabel?: string
  form?: { results: Array<'W' | 'D' | 'L'>; qualifiedAtIndex: number | null; eliminated?: boolean }
}) {
  const team = TEAM_MAP.get(name)
  if (!team) return null
  const positive = points > 0
  const negative = points < 0
  const eliminated = form?.eliminated ?? false

  if (sub === 'subOut') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
        style={{ background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.25)', opacity: 0.75 }}
      >
        <span style={{ color: '#FB923C', fontSize: '0.65rem' }}>▼{wcLabel && <span style={{ fontSize: '0.6rem', marginLeft: 1 }}>{wcLabel}</span>}</span>
        <Flag code={team.code} name={team.name} size={16} />
        <span style={{ color: 'rgba(255,255,255,0.45)', textDecoration: eliminated ? 'line-through' : 'none' }}>{team.name}</span>
        <FormDots form={form} />
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
        style={{ background: 'rgba(74,202,106,0.1)', border: '1px solid rgba(74,202,106,0.3)', opacity: eliminated ? 0.55 : 1 }}
      >
        <span style={{ color: '#4ACA6A', fontSize: '0.65rem' }}>▲{wcLabel && <span style={{ fontSize: '0.6rem', marginLeft: 1 }}>{wcLabel}</span>}</span>
        <Flag code={team.code} name={team.name} size={16} />
        <span style={{ color: live ? '#FCA5A5' : '#4ACA6A', textDecoration: eliminated ? 'line-through' : 'none' }}>{team.name}</span>
        <FormDots form={form} />
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
        background: live ? 'rgba(239,68,68,0.12)' : eliminated ? 'rgba(255,255,255,0.03)' : positive ? 'rgba(74,202,106,0.1)' : negative ? 'rgba(215,38,56,0.1)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${live ? 'rgba(239,68,68,0.5)' : eliminated ? 'rgba(255,255,255,0.06)' : positive ? 'rgba(74,202,106,0.3)' : negative ? 'rgba(215,38,56,0.3)' : 'rgba(255,255,255,0.1)'}`,
        opacity: eliminated ? 0.55 : 1,
      }}
    >
      <Flag code={team.code} name={team.name} size={16} />
      <span style={{ color: live ? '#FCA5A5' : eliminated ? 'rgba(255,255,255,0.35)' : positive ? '#4ACA6A' : negative ? '#D72638' : 'rgba(255,255,255,0.5)', textDecoration: eliminated ? 'line-through' : 'none' }}>
        {team.name}
      </span>
      <FormDots form={form} />
      <span className="font-bold tabular-nums" style={{ color: live ? '#FCA5A5' : eliminated ? 'rgba(255,255,255,0.3)' : positive ? '#4ACA6A' : negative ? '#D72638' : 'rgba(255,255,255,0.3)' }}>
        {points > 0 ? '+' : ''}{points}
      </span>
      {live && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
    </span>
  )
}

type Tab = 'ranking' | 'teams' | 'fun_stats' | 'breakdown'

interface BreakdownPlayer { name: string; total: number; earned: number[] }

function BreakdownTable({ periods, players }: { periods: string[]; players: BreakdownPlayer[] }) {
  const [sortCol, setSortCol] = useState<number | 'total'>('total')
  const [sortDir, setSortDir] = useState<1 | -1>(-1) // -1 = desc

  function handleSort(col: number | 'total') {
    if (sortCol === col) setSortDir(d => d === -1 ? 1 : -1)
    else { setSortCol(col); setSortDir(-1) }
  }

  const sorted = [...players].sort((a, b) => {
    const av = sortCol === 'total' ? a.total : (a.earned[sortCol as number] ?? 0)
    const bv = sortCol === 'total' ? b.total : (b.earned[sortCol as number] ?? 0)
    return (bv - av) * sortDir
  })

  const maxPerPeriod = periods.map((_, pi) =>
    Math.max(...players.map(p => Math.abs(p.earned[pi] ?? 0)), 1)
  )

  const arrow = (col: number | 'total') => {
    if (sortCol !== col) return <span className="text-white/20 ml-0.5">↕</span>
    return <span className="ml-0.5" style={{ color: '#F5C518' }}>{sortDir === -1 ? '↓' : '↑'}</span>
  }

  return (
    <div>
      <p className="text-white/40 text-xs mb-4">Click a column to sort. Gaps show distance to next player.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left py-2 pr-4 text-white/30 font-normal sticky left-0" style={{ background: '#0a0f1e', minWidth: 120 }}>Player</th>
              {periods.map((p, pi) => (
                <th key={p} onClick={() => handleSort(pi)}
                  className="text-center py-2 px-3 font-bold uppercase tracking-wider cursor-pointer select-none"
                  style={{ minWidth: 56, color: sortCol === pi ? '#F5C518' : 'rgba(255,255,255,0.3)' }}>
                  {p}{arrow(pi)}
                </th>
              ))}
              <th onClick={() => handleSort('total')}
                className="text-center py-2 px-3 font-bold uppercase tracking-wider cursor-pointer select-none"
                style={{ minWidth: 72, color: sortCol === 'total' ? '#F5C518' : 'rgba(255,255,255,0.5)' }}>
                Total{arrow('total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((player, i) => {
              const gap = i < sorted.length - 1
                ? (sortCol === 'total'
                    ? player.total - sorted[i + 1].total
                    : (player.earned[sortCol as number] ?? 0) - (sorted[i + 1].earned[sortCol as number] ?? 0))
                : null
              return (
                <>
                  <tr key={player.name} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                    <td className="py-2 pr-4 font-bold text-white/80 sticky left-0" style={{ background: i % 2 === 0 ? '#0d1525' : '#0a0f1e' }}>
                      <span className="text-white/30 mr-1.5">#{i + 1}</span>{player.name}
                    </td>
                    {player.earned.map((pts, pi) => {
                      const intensity = Math.min(1, Math.abs(pts) / maxPerPeriod[pi])
                      const bg = pts > 0 ? `rgba(74,202,106,${intensity * 0.45})` : pts < 0 ? `rgba(215,38,56,${intensity * 0.45})` : 'transparent'
                      const color = pts > 0 ? '#4ACA6A' : pts < 0 ? '#D72638' : 'rgba(255,255,255,0.2)'
                      const isSort = sortCol === pi
                      return (
                        <td key={pi} className="text-center py-2 px-3 tabular-nums font-bold rounded"
                          style={{ background: bg, color, outline: isSort ? '1px solid rgba(245,197,24,0.3)' : 'none' }}>
                          {pts > 0 ? '+' : ''}{pts !== 0 ? pts : '—'}
                        </td>
                      )
                    })}
                    <td className="text-center py-2 px-3 font-bold tabular-nums"
                      style={{ color: '#F5C518', fontFamily: 'Impact, sans-serif', fontSize: '0.85rem', outline: sortCol === 'total' ? '1px solid rgba(245,197,24,0.3)' : 'none' }}>
                      {player.total.toLocaleString()}
                    </td>
                  </tr>
                  {gap !== null && gap > 0 && (
                    <tr key={`gap-${i}`}>
                      <td colSpan={periods.length + 2} className="text-center py-0.5">
                        <span className="text-[10px] text-white/20">▼ {gap} pts gap ▼</span>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

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
  const [history, setHistory] = useState<{ stages: { label: string; display: string; ranks: { id: string; name: string; rank: number; total_points: number }[] }[]; current: { id: string; name: string; rank: number; total_points: number }[] } | null>(null)
  const [teamForm, setTeamForm] = useState<Record<string, { results: Array<'W' | 'D' | 'L'>; qualifiedAtIndex: number | null; qualifiedIndices?: number[]; eliminated?: boolean }>>({})
  const [breakdown, setBreakdown] = useState<{ periods: string[]; players: BreakdownPlayer[] } | null>(null)

  useEffect(() => {
    fetch('/api/team-form').then(r => r.json()).then(d => setTeamForm(d.form ?? {})).catch(() => {})
    fetch('/api/ranking/breakdown').then(r => r.json()).then(d => setBreakdown(d)).catch(() => {})

    fetch('/api/ranking/history')
      .then(r => r.json())
      .then(d => setHistory(d))
      .catch(() => {})

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

      {/* Prize pool */}
      <div className="mb-6 rounded-xl px-4 py-3" style={{ background: 'linear-gradient(145deg, #1A1400, #2A1F00)', border: '1px solid rgba(245,197,24,0.25)' }}>
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '0.75rem', letterSpacing: '0.12em', color: '#F5C518' }}>💰 PRIZE POOL — 29 PLAYERS</span>
          <span className="text-white/30 text-xs">14,500 MXN · £609</span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {([['🥇 1st', '6,000', '£252'], ['🥈 2nd', '3,000', '£126'], ['🥉 3rd', '2,000', '£84'], ['4th', '1,000', '£42'], ['⚽ Scorers', '2,500', '£105']] as const).map(([label, mxn, gbp]) => (
            <div key={label} className="rounded-lg py-2 px-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="text-[10px] text-white/40 mb-0.5">{label}</div>
              <div className="font-bold text-white text-xs">${mxn}</div>
              <div className="text-[10px] text-white/30">{gbp}</div>
            </div>
          ))}
        </div>
      </div>

      {funStats.length > 0 && (
        <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {([['ranking', '🏆 Ranking'], ['teams', '🌍 By Country'], ['breakdown', '📅 By Matchday'], ['fun_stats', '📊 Fun Stats']] as [Tab, string][]).map(([t, label]) => (
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

          {picks.length > 0 && tournamentStarted && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 px-1">
              <span className="text-white/25 text-[10px] uppercase tracking-widest font-bold">Form guide</span>
              {([['W', '#4ACA6A', 'Win'], ['D', 'rgba(255,255,255,0.35)', 'Draw'], ['L', '#D72638', 'Loss']] as const).map(([r, color, label]) => (
                <span key={r} className="flex items-center gap-1.5 text-[11px] text-white/40">
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                  {label}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-[11px] text-white/40">
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'radial-gradient(circle, #4ACA6A 55%, #F5C518 55%)', display: 'inline-block', flexShrink: 0 }} />
                Advanced
              </span>
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
                  <div className="flex flex-col items-center min-w-8">
                    {i < 3 ? (
                      <span className="text-2xl">{MEDAL[i]}</span>
                    ) : (
                      <span className="text-white/40 text-lg font-bold">#{p.rank}</span>
                    )}
                    {p.position_change != null && p.position_change !== 0 && (
                      <span
                        className="text-[10px] font-bold tabular-nums"
                        style={{ color: p.position_change > 0 ? '#4ACA6A' : '#D72638' }}
                      >
                        {p.position_change > 0 ? `▲${p.position_change}` : `▼${Math.abs(p.position_change)}`}
                      </span>
                    )}
                    {p.position_change === 0 && (
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                    )}
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
                                <TeamPointsPill key={t.name} name={t.name} points={t.points} sub="subOut"
                                  wcLabel={p.wildcard_effective_from ? EFFECTIVE_STAGE_LABEL[p.wildcard_effective_from] : undefined}
                                  form={teamForm[t.name]} />
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
                                return <TeamPointsPill key={t.name} name={t.name} points={t.points} live={p.live_teams?.includes(t.name)} sub={sub}
                                  wcLabel={sub === 'subIn' && p.wildcard_effective_from ? EFFECTIVE_STAGE_LABEL[p.wildcard_effective_from] : undefined}
                                  form={teamForm[t.name]} />
                              })
                          })()}
                        </div>
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
          <p className="text-white/40 text-xs mb-4">Quiniela points earned by each team in the tournament, ranked. 🏅 AR = rounds advanced (group qualification + knockout progression).</p>
          <div className="space-y-2">
            {teamTable.map((t, i) => {
              const positive = t.pts > 0
              const negative = t.pts < 0
              const eliminated = teamForm[t.name]?.eliminated ?? false
              return (
                <div
                  key={t.name}
                  className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{
                    background: i === 0
                      ? 'linear-gradient(145deg, #1A1400, #3A2A00)'
                      : 'linear-gradient(145deg, #0D1F4A, #111827)',
                    border: `1px solid ${i === 0 ? '#F5C518' : 'rgba(255,255,255,0.08)'}`,
                    opacity: eliminated ? 0.65 : 1,
                  }}
                >
                  <span className="text-white/30 text-sm font-bold w-6 text-center shrink-0">
                    {i + 1}
                  </span>
                  <Flag code={t.code} name={t.name} size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-bold text-sm" style={{ textDecoration: eliminated ? 'line-through' : 'none' }}>{t.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-white/30">
                        Tier {t.tier} · {t.cost}pts
                      </span>
                      <span className="text-[10px] text-white/30">{t.picks_count} {t.picks_count === 1 ? 'pick' : 'picks'}</span>
                    </div>
                    <div className="flex gap-3 mt-1 text-[11px] text-white/40 flex-wrap">
                      <span>{t.wins}W {t.draws}D {t.losses}L</span>
                      <span>{t.gf}:{t.ga} GD {t.gf - t.ga > 0 ? '+' : ''}{t.gf - t.ga}</span>
                      {t.advance_rounds > 0 && (
                        <span style={{ color: '#F5C518' }}>🏅 {t.advance_rounds}AR</span>
                      )}
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

      {tab === 'breakdown' && (
        <>
          {history && (
            <div className="mb-8">
              <h2 className="text-white/60 text-sm font-bold uppercase tracking-widest mb-1">📈 Position over time</h2>
              <p className="text-white/30 text-xs mb-4">Rank at end of each matchday — hover a line to highlight</p>
              <BumpsChart stages={history.stages} current={history.current} />
            </div>
          )}
        </>
      )}

      {tab === 'breakdown' && breakdown && breakdown.players.length > 0 && (
        <BreakdownTable periods={breakdown.periods} players={breakdown.players} />
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
