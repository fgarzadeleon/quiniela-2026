'use client'
import { useState, useMemo, useEffect } from 'react'
import { TEAMS, TEAM_MAP, MAX_BUDGET, TEAMS_TO_PICK, MAX_A_TIER, TIER_LABELS } from '@/lib/teams'
import Flag from '@/components/Flag'
import PlayerSelect, { TeamSquad } from '@/components/PlayerSelect'
import { Tier } from '@/types'
import { WILDCARD_DEADLINES, getNextWildcardDeadline, type WildcardDeadline } from '@/lib/scoring'

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const HOST_QUESTIONS = [
  { key: 'dirtiest',           label: 'Dirtiest Host',       desc: 'Most yellow + red cards combined',      icon: '🟨🟥' },
  { key: 'best',               label: 'Best Host',           desc: 'Best ranked at end of tournament',      icon: '🏆' },
  { key: 'worst',              label: 'Worst Host',          desc: 'Worst ranked at end of tournament',     icon: '📉' },
  { key: 'most_goals_for',     label: 'Most Goals Scored',   desc: 'Most goals across all their matches',   icon: '⚽' },
  { key: 'most_goals_against', label: 'Most Goals Conceded', desc: 'Lets in most goals across all matches', icon: '🥅' },
]
const HOSTS = [{ name: 'USA', code: 'us' }, { name: 'Mexico', code: 'mx' }, { name: 'Canada', code: 'ca' }]
type HostAnswers = Record<string, string>

const TIER_COLORS: Record<Tier, { bg: string; border: string; label: string }> = {
  A: { bg: '#1A0A0A', border: '#D72638', label: '#D72638' },
  B: { bg: '#0A0E1A', border: '#2A4AB0', label: '#6A90F0' },
  C: { bg: '#0A1A0A', border: '#1A6A2A', label: '#4ACA6A' },
  D: { bg: '#1A1400', border: '#7A5A00', label: '#D4A017' },
}

interface PickData {
  id: string
  name: string
  team1: string; team2: string; team3: string; team4: string; team5: string
  scorer1?: string; scorer2?: string; scorer3?: string
  total_cost: number
  total_points: number
  wildcard_used: boolean
}

type Stage = 'login' | 'view' | 'edit' | 'wildcard' | 'done'

export default function MyPicksPage() {
  const [stage, setStage] = useState<Stage>('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [pick, setPick] = useState<PickData | null>(null)
  const [tournamentStarted, setTournamentStarted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Host predictions
  const [hostPredictions, setHostPredictions] = useState<HostAnswers | null>(null)
  const [editHostAnswers, setEditHostAnswers] = useState<HostAnswers>({})

  // Pre-deadline edit state
  const [editSelected, setEditSelected] = useState<string[]>([])
  const [editScorers, setEditScorers] = useState(['', '', ''])

  // Post-deadline wildcard state
  const [keepTeams, setKeepTeams] = useState<string[]>([])
  const [newPicks, setNewPicks] = useState<string[]>([])

  // Squad data for scorer autocomplete (pre-deadline edit only)
  const [editSquads, setEditSquads] = useState<TeamSquad[]>([])
  const [editSquadsLoading, setEditSquadsLoading] = useState(false)

  useEffect(() => {
    if (editSelected.length !== TEAMS_TO_PICK) { setEditSquads([]); return }
    let cancelled = false
    setEditSquadsLoading(true)
    fetch(`/api/players?teams=${encodeURIComponent(editSelected.join(','))}`)
      .then(r => r.json())
      .then(data => { if (!cancelled && Array.isArray(data)) setEditSquads(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEditSquadsLoading(false) })
    return () => { cancelled = true }
  }, [editSelected])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/my-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPick(data)
      setTournamentStarted(data.tournamentStarted ?? false)
      const hostRes = await fetch(`/api/host-predictions?name=${encodeURIComponent(name.trim())}&password=${encodeURIComponent(password)}`)
      if (hostRes.ok) setHostPredictions(await hostRes.json())
      setStage('view')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleEdit() {
    if (editSelected.length !== TEAMS_TO_PICK) return
    const teamObjects = editSelected.map(n => TEAM_MAP.get(n)!)
    const total_cost = teamObjects.reduce((s, t) => s + t.cost, 0)
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/my-picks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), password,
          team1: editSelected[0], team2: editSelected[1], team3: editSelected[2],
          team4: editSelected[3], team5: editSelected[4],
          total_cost,
          scorer1: editScorers[0].trim() || null,
          scorer2: editScorers[1].trim() || null,
          scorer3: editScorers[2].trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (Object.keys(editHostAnswers).length === HOST_QUESTIONS.length) {
        const hostRes = await fetch('/api/host-predictions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), password, ...editHostAnswers }),
        })
        if (hostRes.ok) setHostPredictions(editHostAnswers)
      }
      setPick(data)
      setStage('view')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleWildcard(e: React.FormEvent) {
    e.preventDefault()
    if (keepTeams.length !== 2 || newPicks.length !== 3) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/my-picks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          password,
          type: 'wildcard',
          keepTeams,
          newTeam1: newPicks[0], newTeam2: newPicks[1], newTeam3: newPicks[2],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPick(data)
      setStage('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function toggleKeep(team: string) {
    setKeepTeams(prev => {
      if (prev.includes(team)) return prev.filter(t => t !== team)
      if (prev.length >= 2) return prev
      return [...prev, team]
    })
  }

  function toggleNewPick(team: string) {
    setNewPicks(prev => {
      if (prev.includes(team)) return prev.filter(t => t !== team)
      if (prev.length >= 3) return prev
      return [...prev, team]
    })
  }

  const wcNow = new Date()
  const wcNext = getNextWildcardDeadline(wcNow)

  const currentTeams = pick
    ? [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5].map(n => TEAM_MAP.get(n)!)
    : []

  const keptTeamObjs = keepTeams.map(n => TEAM_MAP.get(n)!)
  const newPickObjs = newPicks.map(n => TEAM_MAP.get(n)!)
  const wildcardCost = [...keptTeamObjs, ...newPickObjs].reduce((s, t) => s + (t?.cost ?? 0), 0)
  const wildcardATier = [...keptTeamObjs, ...newPickObjs].filter(t => t?.tier === 'A').length
  const wildcardOver = wildcardCost > MAX_BUDGET || wildcardATier > MAX_A_TIER
  const wildcardReady = keepTeams.length === 2 && newPicks.length === 3 && !wildcardOver

  const availableTeams = useMemo(() => {
    if (!pick) return []
    const locked = new Set(keepTeams)
    return TEAMS.filter(t => !locked.has(t.name))
  }, [pick, keepTeams])

  const tiers: Tier[] = ['A', 'B', 'C', 'D']

  // ── LOGIN ──
  if (stage === 'login') {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🐚</div>
          <h1 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#F5C518', letterSpacing: '0.05em' }}>
            MY PICKS
          </h1>
          <p className="text-white/50 text-sm mt-2">Log in to view your picks or use your one-time wildcard.</p>
        </div>

        <form
          onSubmit={handleLogin}
          style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="text-white/60 text-sm block mb-1">Your name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder="Same name you signed up with"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#F5C518]/50"
            />
          </div>
          <div>
            <label className="text-white/60 text-sm block mb-1">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="Your pick password"
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#F5C518]/50"
            />
          </div>
          {error && <p className="text-[#D72638] text-sm px-3 py-2 bg-[#D72638]/10 rounded-lg">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest disabled:opacity-40 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #D72638, #8B0A1A)', color: '#fff', fontFamily: 'Impact, sans-serif' }}
          >
            {loading ? 'Checking...' : 'Find My Picks'}
          </button>
        </form>
      </div>
    )
  }

  // ── VIEW PICKS ──
  if (stage === 'view' && pick) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <p className="text-white/40 text-sm uppercase tracking-wider mb-1">Your picks</p>
          <h1 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#fff' }}>{pick.name}</h1>
          <p className="text-white/40 text-sm mt-1">{pick.total_cost} pts spent · {pick.total_points} pts scored</p>
        </div>

        <div
          style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-xl p-5 mb-6 space-y-2"
        >
          {currentTeams.map(t => {
            const colors = TIER_COLORS[t.tier]
            return (
              <div key={t.name}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
              >
                <Flag code={t.code} name={t.name} size={24} />
                <span className="flex-1 text-white text-sm font-medium">{t.name}</span>
                <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ background: 'rgba(0,0,0,0.4)', color: colors.label }}>
                  Tier {t.tier}
                </span>
                <span className="text-white/40 text-xs font-mono">{t.cost} pts</span>
              </div>
            )
          })}
        </div>

        {/* Scorers */}
        {(pick.scorer1 || pick.scorer2 || pick.scorer3) && (
          <div
            style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
            className="rounded-xl p-5 mb-6"
          >
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2">Top scorers</p>
            <div className="flex flex-wrap gap-2">
              {[pick.scorer1, pick.scorer2, pick.scorer3].filter(Boolean).map(s => (
                <span key={s} className="px-3 py-1 rounded-full text-sm text-white bg-white/8 border border-white/15">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Host predictions */}
        {hostPredictions && Object.keys(hostPredictions).length > 0 && (
          <div
            style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
            className="rounded-xl p-5 mb-6"
          >
            <p className="text-white/40 text-xs uppercase tracking-wider mb-3">🏟️ Hosts Challenge</p>
            <div className="space-y-2">
              {HOST_QUESTIONS.map(q => {
                const answer = hostPredictions[q.key]
                const host = HOSTS.find(h => h.name === answer)
                return (
                  <div key={q.key} className="flex items-center justify-between gap-2">
                    <span className="text-white/60 text-xs">{q.icon} {q.label}</span>
                    {host ? (
                      <span className="text-sm font-medium text-white flex items-center gap-1"><Flag code={host.code} name={host.name} size={16} /> {host.name}</span>
                    ) : (
                      <span className="text-white/30 text-xs">—</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!tournamentStarted ? (
          // Pre-deadline: free edits
          <div
            className="rounded-xl p-5"
            style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div className="flex items-start gap-3 mb-4">
              <span className="text-3xl">✏️</span>
              <div>
                <h3 style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.2rem', color: '#F5C518' }}>EDIT PICKS</h3>
                <p className="text-white/50 text-sm">Change any or all of your teams before June 11. Free until kick-off.</p>
              </div>
            </div>
            <button
              onClick={() => {
                setError('')
                setEditSelected([pick.team1, pick.team2, pick.team3, pick.team4, pick.team5])
                setEditScorers([pick.scorer1 ?? '', pick.scorer2 ?? '', pick.scorer3 ?? ''])
                setEditHostAnswers(hostPredictions ?? {})
                setStage('edit')
              }}
              className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #1B3A8B, #0A1F5C)', border: '1px solid rgba(100,150,255,0.4)', color: '#6A90F0', fontFamily: 'Impact, sans-serif' }}
            >
              ✏️ Edit My Picks
            </button>
          </div>
        ) : pick.wildcard_used ? (
          // Post-deadline, wildcard spent
          <div
            className="rounded-xl p-5 text-center"
            style={{ background: 'rgba(245,197,24,0.05)', border: '1px solid rgba(245,197,24,0.2)' }}
          >
            <p className="text-2xl mb-2">🃏</p>
            <p className="text-[#F5C518] font-bold">Wildcard used</p>
            <p className="text-white/40 text-sm mt-1">Your wildcard has been used. Good luck!</p>
          </div>
        ) : (
          // Post-deadline, wildcard available
          <div
            className="rounded-xl p-5"
            style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div className="flex items-start gap-3 mb-4">
              <span className="text-3xl">🃏</span>
              <div>
                <h3 style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.2rem', color: '#F5C518' }}>WILDCARD</h3>
                <p className="text-white/50 text-sm">Keep 2 teams, replace the 3 others. Budget rules still apply. <strong className="text-white/70">One use only.</strong></p>
              </div>
            </div>

            {/* Effective round callout */}
            {wcNext && (
              <div className="rounded-lg px-3 py-2.5 mb-4" style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.25)' }}>
                <p className="text-[#F5C518] text-sm font-bold">
                  ⚡ Use it now → new teams score from <span style={{ fontFamily: 'Impact, sans-serif' }}>{wcNext.label}</span>
                </p>
                <p className="text-white/40 text-xs mt-0.5">Deadline: {fmtDate(wcNext.deadline)}</p>
              </div>
            )}

            {/* Deadline table */}
            <div className="mb-5">
              <p className="text-white/30 text-[11px] uppercase tracking-wider mb-2">Wildcard deadlines</p>
              <div className="space-y-1">
                {WILDCARD_DEADLINES.map(({ label, deadline }) => {
                  const isPast = wcNow >= deadline
                  const isCurrent = wcNext?.deadline.getTime() === deadline.getTime()
                  return (
                    <div
                      key={deadline.toISOString()}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg text-xs"
                      style={{
                        background: isCurrent ? 'rgba(74,202,106,0.07)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${isCurrent ? 'rgba(74,202,106,0.25)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <span style={{ color: isPast ? 'rgba(255,255,255,0.22)' : isCurrent ? '#4ACA6A' : 'rgba(255,255,255,0.55)' }}>
                        {label}
                      </span>
                      <span className="tabular-nums" style={{ color: isPast ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.38)' }}>
                        {isPast ? 'Closed' : `Use before ${fmtDate(deadline)}`}
                        {isCurrent && <span className="ml-2 font-bold" style={{ color: '#4ACA6A' }}>← now</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => {
                setError('')
                setKeepTeams([])
                setNewPicks([])
                setStage('wildcard')
              }}
              className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #1B3A8B, #0A1F5C)', border: '1px solid rgba(100,150,255,0.4)', color: '#6A90F0', fontFamily: 'Impact, sans-serif' }}
            >
              🃏 Use Wildcard
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── PRE-DEADLINE EDIT ──
  if (stage === 'edit' && pick) {
    const editATier = editSelected.filter(n => TEAM_MAP.get(n)?.tier === 'A').length
    const editCost = editSelected.reduce((s, n) => s + (TEAM_MAP.get(n)?.cost ?? 0), 0)
    const editOver = editCost > MAX_BUDGET || editATier > MAX_A_TIER
    const editReady = editSelected.length === TEAMS_TO_PICK && !editOver

    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">✏️</div>
          <h1 style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.8rem', color: '#F5C518' }}>EDIT PICKS</h1>
          <p className="text-white/50 text-sm mt-2">Select your new 5 teams. Changes are free until kick-off.</p>
        </div>

        {/* Budget tracker */}
        <div style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-xl p-4 mb-6 sticky top-16 z-40">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <span className="text-sm text-white/60">Teams: <strong className="text-white">{editSelected.length}</strong>/5</span>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${editOver ? 'text-[#D72638]' : editCost > 270 ? 'text-[#F5C518]' : 'text-white'}`}>{editCost}</span>
              <span className="text-white/40 text-sm">/ {MAX_BUDGET} pts</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min((editCost / MAX_BUDGET) * 100, 100)}%`, background: editOver ? '#D72638' : '#1A6BCC' }} />
          </div>
          {editOver && editCost > MAX_BUDGET && <p className="text-[#D72638] text-xs mt-1">Over budget!</p>}
          {editOver && editATier > MAX_A_TIER && <p className="text-[#D72638] text-xs mt-1">Only 1 elite-tier team allowed!</p>}
        </div>

        {/* Team grid */}
        <div className="space-y-6 mb-6">
          {tiers.map(tier => {
            const tierTeams = TEAMS.filter(t => t.tier === tier)
            const colors = TIER_COLORS[tier]
            return (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: colors.border, color: '#fff' }}>Tier {tier}</div>
                  <span className="text-white/40 text-xs">{TIER_LABELS[tier]}</span>
                  {tier === 'A' && <span className="text-xs text-[#F5C518] bg-[#F5C518]/10 border border-[#F5C518]/30 px-2 py-0.5 rounded-full">Pick at most 1</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {tierTeams.map(team => {
                    const sel = editSelected.includes(team.name)
                    const wouldExceedA = !sel && team.tier === 'A' && editATier >= MAX_A_TIER
                    const full = !sel && editSelected.length >= TEAMS_TO_PICK
                    const disabled = wouldExceedA || full
                    return (
                      <button key={team.name} type="button"
                        onClick={() => setEditSelected(prev =>
                          prev.includes(team.name) ? prev.filter(n => n !== team.name) : [...prev, team.name]
                        )}
                        disabled={disabled}
                        className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full cursor-pointer"
                        style={{
                          background: sel ? colors.border : colors.bg,
                          border: `1px solid ${sel ? colors.label : colors.border}`,
                          color: sel ? '#fff' : '#ccc',
                          opacity: disabled ? 0.35 : 1,
                          boxShadow: sel ? `0 0 10px ${colors.border}55` : 'none',
                        }}
                      >
                        <Flag code={team.code} name={team.name} size={18} />
                        <span className="flex-1 truncate text-xs">{team.name}</span>
                        <span className="text-[10px] font-bold" style={{ color: sel ? '#fff' : colors.label }}>{team.cost}</span>
                        {sel && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#F5C518] text-black text-[10px] flex items-center justify-center font-bold">✓</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Scorer edit */}
        <div
          style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-xl p-5 mb-6"
        >
          <p className="text-[#F5C518] font-bold mb-1" style={{ fontFamily: 'Impact, sans-serif', fontSize: '1rem' }}>TOP SCORERS</p>
          <p className="text-white/30 text-xs mb-3">Search or type names directly — accents optional.</p>
          {editSquadsLoading && <p className="text-white/40 text-xs mb-3">Loading squad lists…</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => (
              editSquads.length > 0 && !editSquadsLoading ? (
                <PlayerSelect
                  key={i}
                  index={i}
                  value={editScorers[i]}
                  onChange={v => setEditScorers(prev => { const n = [...prev]; n[i] = v; return n })}
                  squads={editSquads}
                  otherPicks={editScorers.filter((_, j) => j !== i)}
                />
              ) : (
                <input
                  key={i}
                  type="text"
                  placeholder={`Scorer ${i + 1}`}
                  value={editScorers[i]}
                  onChange={e => setEditScorers(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                  className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#F5C518]/50"
                />
              )
            ))}
          </div>
        </div>

        {/* Host predictions editor */}
        <div
          style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-xl p-5 mb-6"
        >
          <p className="text-[#F5C518] font-bold mb-1" style={{ fontFamily: 'Impact, sans-serif', fontSize: '1rem' }}>🏟️ HOSTS CHALLENGE</p>
          <p className="text-white/30 text-xs mb-4">For each question, which host nation (USA, Mexico, Canada)?</p>
          <div className="space-y-4">
            {HOST_QUESTIONS.map(q => (
              <div key={q.key}>
                <p className="text-white/70 text-xs mb-2">{q.icon} {q.label} <span className="text-white/30">— {q.desc}</span></p>
                <div className="flex gap-2">
                  {HOSTS.map(h => (
                    <button
                      key={h.name}
                      type="button"
                      onClick={() => setEditHostAnswers(prev => ({ ...prev, [q.key]: h.name }))}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
                      style={{
                        background: editHostAnswers[q.key] === h.name ? 'rgba(245,197,24,0.2)' : 'rgba(255,255,255,0.05)',
                        border: editHostAnswers[q.key] === h.name ? '2px solid #F5C518' : '1px solid rgba(255,255,255,0.1)',
                        color: editHostAnswers[q.key] === h.name ? '#F5C518' : '#fff',
                      }}
                    >
                      <Flag code={h.code} name={h.name} size={20} /> {h.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-[#D72638] text-sm mb-4 px-3 py-2 bg-[#D72638]/10 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => { setStage('view'); setError('') }}
            className="flex-1 py-3 rounded-xl text-sm font-medium text-white/50 hover:text-white border border-white/15 hover:border-white/30 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={handleEdit} disabled={!editReady || loading}
            className="flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ background: editReady ? 'linear-gradient(135deg, #D72638, #8B0A1A)' : '#1a1a2e', color: '#fff', fontFamily: 'Impact, sans-serif' }}>
            {loading ? 'Saving...' : editReady ? '✏️ Save Changes' : `Pick ${TEAMS_TO_PICK - editSelected.length} more`}
          </button>
        </div>
      </div>
    )
  }

  // ── WILDCARD ──
  if (stage === 'wildcard' && pick) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🐚</div>
          <h1 style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.8rem', color: '#F5C518' }}>WILDCARD</h1>
          <p className="text-white/50 text-sm mt-2">Lock 2 teams to keep, then pick 3 replacements.</p>
          {wcNext && (
            <div className="mt-4 inline-block rounded-lg px-4 py-2.5 text-center" style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.25)' }}>
              <p className="text-[#F5C518] text-sm font-bold">
                ⚡ New teams score from <span style={{ fontFamily: 'Impact, sans-serif' }}>{wcNext.label}</span>
              </p>
              <p className="text-white/40 text-xs mt-0.5">Deadline: {fmtDate(wcNext.deadline)}</p>
            </div>
          )}
        </div>

        {/* Step 1 — pick which 2 to keep */}
        <div
          style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-xl p-5 mb-6"
        >
          <p className="text-white/60 text-sm uppercase tracking-wider mb-3">
            Step 1 — Lock 2 teams to keep <span className="text-white/30">({keepTeams.length}/2 locked)</span>
          </p>
          <div className="space-y-2">
            {currentTeams.map(t => {
              const locked = keepTeams.includes(t.name)
              const disabledKeep = !locked && keepTeams.length >= 2
              const colors = TIER_COLORS[t.tier]
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => toggleKeep(t.name)}
                  disabled={disabledKeep}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-all"
                  style={{
                    background: locked ? colors.border : colors.bg,
                    border: `1px solid ${locked ? colors.label : colors.border}`,
                    opacity: disabledKeep ? 0.35 : 1,
                    color: locked ? '#fff' : '#ccc',
                  }}
                >
                  <Flag code={t.code} name={t.name} size={24} />
                  <span className="flex-1 text-sm font-medium">{t.name}</span>
                  <span className="text-xs font-mono" style={{ color: locked ? '#fff' : colors.label }}>{t.cost} pts</span>
                  <span className="w-6 h-6 rounded-full border flex items-center justify-center text-xs"
                    style={{ borderColor: locked ? '#fff' : colors.border, background: locked ? '#fff' : 'transparent', color: '#000' }}>
                    {locked ? '🔒' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 2 — pick 3 new teams */}
        {keepTeams.length === 2 && (
          <div
            style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
            className="rounded-xl p-5 mb-6"
          >
            {/* Budget tracker */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="text-white/60 text-sm uppercase tracking-wider">
                Step 2 — Pick 3 new teams <span className="text-white/30">({newPicks.length}/3)</span>
              </p>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${wildcardOver ? 'text-[#D72638]' : wildcardCost > 270 ? 'text-[#F5C518]' : 'text-white'}`}>
                  {wildcardCost}
                </span>
                <span className="text-white/40 text-sm">/ {MAX_BUDGET} pts</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 mb-4 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min((wildcardCost / MAX_BUDGET) * 100, 100)}%`, background: wildcardOver ? '#D72638' : '#1A6BCC' }} />
            </div>
            {wildcardOver && wildcardCost > MAX_BUDGET && <p className="text-[#D72638] text-xs mb-3">Over budget!</p>}
            {wildcardOver && wildcardATier > MAX_A_TIER && <p className="text-[#D72638] text-xs mb-3">Only 1 elite-tier team allowed!</p>}

            <div className="space-y-6">
              {tiers.map(tier => {
                const tierTeams = availableTeams.filter(t => t.tier === tier && !keepTeams.includes(t.name))
                if (tierTeams.length === 0) return null
                const colors = TIER_COLORS[tier]
                return (
                  <div key={tier}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: colors.border, color: '#fff' }}>
                        Tier {tier}
                      </div>
                      <span className="text-white/40 text-xs">{TIER_LABELS[tier]}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {tierTeams.map(team => {
                        const picked = newPicks.includes(team.name)
                        const disabled = !picked && newPicks.length >= 3
                        return (
                          <button
                            key={team.name}
                            type="button"
                            onClick={() => toggleNewPick(team.name)}
                            disabled={disabled}
                            className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full cursor-pointer"
                            style={{
                              background: picked ? colors.border : colors.bg,
                              border: `1px solid ${picked ? colors.label : colors.border}`,
                              color: picked ? '#fff' : '#ccc',
                              opacity: disabled ? 0.35 : 1,
                              boxShadow: picked ? `0 0 10px ${colors.border}55` : 'none',
                            }}
                          >
                            <Flag code={team.code} name={team.name} size={18} />
                            <span className="flex-1 truncate text-xs">{team.name}</span>
                            <span className="text-[10px] font-bold" style={{ color: picked ? '#fff' : colors.label }}>{team.cost}</span>
                            {picked && (
                              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#F5C518] text-black text-[10px] flex items-center justify-center font-bold">✓</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && <p className="text-[#D72638] text-sm mb-4 px-3 py-2 bg-[#D72638]/10 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setStage('view'); setError('') }}
            className="flex-1 py-3 rounded-xl text-sm font-medium text-white/50 hover:text-white border border-white/15 hover:border-white/30 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleWildcard}
            disabled={!wildcardReady || loading}
            className="flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ background: wildcardReady ? 'linear-gradient(135deg, #1B3A8B, #0A1F5C)' : '#1a1a2e', border: '1px solid rgba(100,150,255,0.4)', color: '#6A90F0', fontFamily: 'Impact, sans-serif' }}
          >
            {loading ? 'Saving...' : wildcardReady ? '🃏 Confirm Wildcard' : keepTeams.length < 2 ? `Lock ${2 - keepTeams.length} more` : `Pick ${3 - newPicks.length} more`}
          </button>
        </div>
      </div>
    )
  }

  // ── DONE ──
  if (stage === 'done' && pick) {
    const newTeams = [pick.team1, pick.team2, pick.team3, pick.team4, pick.team5].map(n => TEAM_MAP.get(n)!)
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">🐚</div>
        <h2 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#F5C518' }}>Wildcard Used!</h2>
        <p className="text-white/50 mt-2 mb-8">Your picks have been updated. Good luck, {pick.name}!</p>
        <div className="flex flex-wrap justify-center gap-2">
          {newTeams.map(t => (
            <div key={t.name} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
              style={{ background: TIER_COLORS[t.tier].bg, border: `1px solid ${TIER_COLORS[t.tier].border}` }}>
              <Flag code={t.code} name={t.name} size={18} /> {t.name}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}
