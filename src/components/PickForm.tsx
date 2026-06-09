'use client'
import { useState, useMemo, useEffect } from 'react'
import { TEAMS, MAX_BUDGET, TEAMS_TO_PICK, MAX_A_TIER, TIER_LABELS } from '@/lib/teams'
import Flag from '@/components/Flag'
import PlayerSelect, { TeamSquad } from '@/components/PlayerSelect'
import { Team, Tier } from '@/types'

const DEADLINE = new Date('2026-06-11T16:00:00Z')

const TIER_COLORS: Record<Tier, { bg: string; border: string; label: string }> = {
  A: { bg: '#1A0A0A', border: '#D72638', label: '#D72638' },
  B: { bg: '#0A0E1A', border: '#2A4AB0', label: '#6A90F0' },
  C: { bg: '#0A1A0A', border: '#1A6A2A', label: '#4ACA6A' },
  D: { bg: '#1A1400', border: '#7A5A00', label: '#D4A017' },
}

function TeamButton({ team, selected, disabled, onClick }: {
  team: Team
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  const colors = TIER_COLORS[team.tier]
  return (
    <button
      onClick={onClick}
      disabled={disabled && !selected}
      className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer text-left w-full"
      style={{
        background: selected ? colors.border : colors.bg,
        border: `1px solid ${selected ? colors.label : colors.border}`,
        color: selected ? '#fff' : '#ccc',
        opacity: disabled && !selected ? 0.35 : 1,
        boxShadow: selected ? `0 0 12px ${colors.border}66` : 'none',
      }}
    >
      <Flag code={team.code} name={team.name} size={20} />
      <span className="flex-1 truncate">{team.name}</span>
      <span
        className="text-xs font-bold px-1.5 py-0.5 rounded"
        style={{ background: 'rgba(0,0,0,0.4)', color: colors.label }}
      >
        {team.cost}
      </span>
      {selected && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#F5C518] text-black text-[10px] flex items-center justify-center font-bold">
          ✓
        </span>
      )}
    </button>
  )
}

const HOST_QUESTIONS = [
  { key: 'dirtiest',           label: 'Dirtiest Host',       desc: 'Most yellow + red cards combined',      icon: '🟨🟥' },
  { key: 'best',               label: 'Best Host',           desc: 'Best ranked at end of tournament',      icon: '🏆' },
  { key: 'worst',              label: 'Worst Host',          desc: 'Worst ranked at end of tournament',     icon: '📉' },
  { key: 'most_goals_for',     label: 'Most Goals Scored',   desc: 'Most goals across all their matches',   icon: '⚽' },
  { key: 'most_goals_against', label: 'Most Goals Conceded', desc: 'Lets in most goals across all matches', icon: '🥅' },
]
const HOSTS = [
  { name: 'USA',    code: 'us' },
  { name: 'Mexico', code: 'mx' },
  { name: 'Canada', code: 'ca' },
]

export default function PickForm() {
  const [selected, setSelected] = useState<string[]>([])
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [scorers, setScorers] = useState(['', '', ''])
  const [hostAnswers, setHostAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [squads, setSquads] = useState<TeamSquad[]>([])
  const [squadsLoading, setSquadsLoading] = useState(false)

  const selectedTeams = useMemo(() =>
    selected.map(n => TEAMS.find(t => t.name === n)!).filter(Boolean),
    [selected]
  )

  useEffect(() => {
    if (selected.length !== TEAMS_TO_PICK) { setSquads([]); return }
    let cancelled = false
    setSquadsLoading(true)
    fetch(`/api/players?teams=${encodeURIComponent(selected.join(','))}`)
      .then(r => r.json())
      .then(data => { if (!cancelled && Array.isArray(data)) setSquads(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSquadsLoading(false) })
    return () => { cancelled = true }
  }, [selected])

  const totalCost = useMemo(() =>
    selectedTeams.reduce((s, t) => s + t.cost, 0),
    [selectedTeams]
  )

  const aTierCount = useMemo(() =>
    selectedTeams.filter(t => t.tier === 'A').length,
    [selectedTeams]
  )

  const budgetPct = Math.min((totalCost / MAX_BUDGET) * 100, 100)
  const isOverBudget = totalCost > MAX_BUDGET
  const isOverATier = aTierCount > MAX_A_TIER
  const isComplete = selected.length === TEAMS_TO_PICK

  const isClosed = new Date() >= DEADLINE
  const scorersFilled = scorers.every(s => s.trim().length > 0)
  const hostFilled = HOST_QUESTIONS.every(q => hostAnswers[q.key])
  const canSubmit = isComplete && !isOverBudget && !isOverATier && name.trim() && password.trim().length >= 4 && scorersFilled && hostFilled && !isClosed

  function toggle(teamName: string) {
    setSelected(prev => {
      if (prev.includes(teamName)) return prev.filter(n => n !== teamName)
      if (prev.length >= TEAMS_TO_PICK) return prev
      return [...prev, teamName]
    })
  }

  function isDisabled(team: Team): boolean {
    if (selected.includes(team.name)) return false
    if (selected.length >= TEAMS_TO_PICK) return true
    // Would exceed A-tier limit
    if (team.tier === 'A' && aTierCount >= MAX_A_TIER) return true
    return false
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          team1: selected[0], team2: selected[1], team3: selected[2], team4: selected[3], team5: selected[4],
          password: password.trim(),
          scorer1: scorers[0].trim(),
          scorer2: scorers[1].trim(),
          scorer3: scorers[2].trim(),
          total_cost: totalCost,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')

      // Submit host predictions (picks must exist first for FK)
      await fetch('/api/host-predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password: password.trim(), ...hostAnswers }),
      })

      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (isClosed) {
    return (
      <div className="text-center py-20 px-4">
        <div className="text-5xl mb-4">🔒</div>
        <h2 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#D72638' }}>
          PICKS ARE CLOSED
        </h2>
        <p className="text-white/60 mt-3">The tournament has started — submissions are no longer accepted.</p>
        <a href="/ranking" className="inline-block mt-6 px-6 py-3 rounded-xl font-bold text-sm uppercase tracking-widest"
          style={{ background: 'linear-gradient(135deg, #D72638, #8B0A1A)', color: '#fff', fontFamily: 'Impact, sans-serif' }}>
          View the Ranking →
        </a>
      </div>
    )
  }

  // Success modal — rendered on top of the form (not replacing it)
  const successModal = submitted && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-8 text-center"
        style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(245,197,24,0.4)', boxShadow: '0 0 60px rgba(245,197,24,0.15)' }}
      >
        <div className="text-6xl mb-4">🏆</div>
        <h2 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#F5C518', letterSpacing: '0.05em' }}>
          ¡Buena suerte, {name}!
        </h2>
        <p className="text-white/60 mt-2 mb-6 text-sm">Your picks are locked in. May your teams go far.</p>

        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {selectedTeams.map(t => (
            <div key={t.name} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm"
              style={{ background: TIER_COLORS[t.tier].bg, border: `1px solid ${TIER_COLORS[t.tier].border}` }}>
              <Flag code={t.code} name={t.name} size={16} /> {t.name}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <a
            href="/ranking"
            className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest"
            style={{ background: 'linear-gradient(135deg, #D72638, #8B0A1A)', color: '#fff', fontFamily: 'Impact, sans-serif', display: 'block' }}
          >
            🏆 View Ranking
          </a>
          <a
            href="/my-picks"
            className="w-full py-2.5 rounded-xl text-sm text-white/50 hover:text-white border border-white/15 hover:border-white/30 transition-colors block text-center"
          >
            🃏 Go to My Picks
          </a>
        </div>
      </div>
    </div>
  )

  const tiers: Tier[] = ['A', 'B', 'C', 'D']
  const daysLeft = Math.ceil((DEADLINE.getTime() - Date.now()) / 86400_000)

  return (
    <>
    {successModal}
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Deadline banner */}
      <div
        className="rounded-xl px-4 py-3 mb-5 flex items-center gap-3 text-sm"
        style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.25)' }}
      >
        <span className="text-xl">⏰</span>
        <span className="text-white/80">
          Picks close <strong className="text-[#F5C518]">June 11 at kickoff</strong>
          {daysLeft > 0 && <> — <strong className="text-white">{daysLeft} day{daysLeft !== 1 ? 's' : ''} left</strong></>}
        </span>
      </div>

      {/* Budget tracker */}
      <div
        style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
        className="rounded-xl p-5 mb-8 sticky top-16 z-40"
      >
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm text-white/60">
              Teams: <strong className="text-white">{selected.length}</strong>/{TEAMS_TO_PICK}
            </span>
            <span className={`text-sm ${isOverATier ? 'text-[#D72638]' : 'text-white/60'}`}>
              Elite picks: <strong className={isOverATier ? 'text-[#D72638]' : 'text-white'}>{aTierCount}</strong>/{MAX_A_TIER} max
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${isOverBudget ? 'text-[#D72638]' : totalCost > 250 ? 'text-[#F5C518]' : 'text-white'}`}>
              {totalCost}
            </span>
            <span className="text-white/40 text-sm">/ {MAX_BUDGET} pts</span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${budgetPct}%`,
              background: isOverBudget ? '#D72638' : totalCost > 250 ? '#F5C518' : '#1A6BCC',
            }}
          />
        </div>
        {isOverBudget && <p className="text-[#D72638] text-xs mt-1">Over budget! Remove a team.</p>}
        {isOverATier && <p className="text-[#D72638] text-xs mt-1">Only 1 elite-tier team allowed!</p>}
      </div>

      {/* Team grid by tier */}
      <div className="space-y-8 mb-10">
        {tiers.map(tier => {
          const tierTeams = TEAMS.filter(t => t.tier === tier)
          const colors = TIER_COLORS[tier]
          return (
            <div key={tier}>
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                  style={{ background: colors.border, color: '#fff' }}
                >
                  Tier {tier}
                </div>
                <span className="text-white/50 text-sm">{TIER_LABELS[tier]}</span>
                {tier === 'A' && (
                  <span className="text-xs text-[#F5C518] bg-[#F5C518]/10 border border-[#F5C518]/30 px-2 py-0.5 rounded-full">
                    Pick at most 1
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {tierTeams.map(team => (
                  <TeamButton
                    key={team.name}
                    team={team}
                    selected={selected.includes(team.name)}
                    disabled={isDisabled(team)}
                    onClick={() => toggle(team.name)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scorers */}
      {isComplete && (
        <div
          style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-xl p-5 mb-8"
        >
          <h3 className="text-[#F5C518] font-bold mb-1" style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.1rem' }}>
            TOP SCORERS
          </h3>
          <p className="text-white/50 text-sm mb-1">
            Pick 3 goalscorers from your teams. Most combined goals wins the scorer prize.
          </p>
          <p className="text-white/30 text-xs mb-4">
            Search by name (accents optional). Not in the list? Just type the name directly.
          </p>
          {squadsLoading && (
            <p className="text-white/40 text-sm mb-3">Loading squad lists…</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map(i => (
              squads.length > 0 && !squadsLoading ? (
                <PlayerSelect
                  key={i}
                  index={i}
                  value={scorers[i]}
                  onChange={v => setScorers(prev => { const n = [...prev]; n[i] = v; return n })}
                  squads={squads}
                  otherPicks={scorers.filter((_, j) => j !== i)}
                />
              ) : (
                <input
                  key={i}
                  type="text"
                  placeholder={`Scorer ${i + 1} name`}
                  value={scorers[i]}
                  onChange={e => setScorers(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                  className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#F5C518]/50"
                />
              )
            ))}
          </div>
        </div>
      )}

      {/* Hosts Challenge */}
      {isComplete && (
        <div
          style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
          className="rounded-xl p-5 mb-8"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🏟️</span>
            <h3 className="text-[#F5C518] font-bold" style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.1rem' }}>
              HOSTS CHALLENGE
            </h3>
          </div>
          <p className="text-white/50 text-sm mb-1">5 questions about the host nations. Each correct answer = <strong className="text-white">100 bonus points</strong>.</p>
          <p className="text-white/30 text-xs mb-5">Tiebreaker for all questions: final World Cup ranking.</p>
          <div className="space-y-4">
            {HOST_QUESTIONS.map(q => (
              <div key={q.key}>
                <p className="text-white/70 text-sm font-medium mb-1">{q.icon} {q.label} <span className="text-white/30 font-normal">— {q.desc}</span></p>
                <div className="grid grid-cols-3 gap-2">
                  {HOSTS.map(h => {
                    const selected = hostAnswers[q.key] === h.name
                    return (
                      <button
                        key={h.name}
                        type="button"
                        onClick={() => setHostAnswers(prev => ({ ...prev, [q.key]: h.name }))}
                        className="flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all duration-150 cursor-pointer"
                        style={{
                          background: selected ? 'rgba(245,197,24,0.15)' : 'rgba(255,255,255,0.04)',
                          border: selected ? '2px solid #F5C518' : '1px solid rgba(255,255,255,0.1)',
                          boxShadow: selected ? '0 0 12px rgba(245,197,24,0.15)' : 'none',
                        }}
                      >
                        <Flag code={h.code} name={h.name} size={24} />
                        <span className="text-xs font-bold" style={{ color: selected ? '#F5C518' : 'rgba(255,255,255,0.6)' }}>{h.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submission form */}
      <form
        onSubmit={handleSubmit}
        style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
        className="rounded-xl p-5"
      >
        <h3 className="text-white font-bold mb-4" style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.1rem' }}>
          YOUR DETAILS
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-white/60 text-sm block mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name or nickname"
              required
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#F5C518]/50"
            />
          </div>
          <div>
            <label className="text-white/60 text-sm block mb-1">
              Password * <span className="text-white/30 font-normal">(to log back in and use your wildcard — min. 4 characters)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Set a password to log in later and swap teams"
              required
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#F5C518]/50"
            />
            <p className="text-white/30 text-xs mt-1">
              Forgot your password? Message the group admin — they can reset it for you.
            </p>
          </div>
        </div>

        {/* Selected teams summary */}
        {selected.length > 0 && (
          <div className="mb-5">
            <p className="text-white/50 text-xs uppercase tracking-wider mb-2">Your picks</p>
            <div className="flex flex-wrap gap-2">
              {selectedTeams.map(t => (
                <div
                  key={t.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: TIER_COLORS[t.tier].bg, border: `1px solid ${TIER_COLORS[t.tier].border}` }}
                >
                  <Flag code={t.code} name={t.name} size={16} /> {t.name}
                  <span className="text-white/40 text-xs">{t.cost}pts</span>
                </div>
              ))}
              <div className="flex items-center px-3 py-1.5 rounded-lg text-sm font-bold"
                style={{ background: '#111827', border: '1px solid rgba(245,197,24,0.3)', color: '#F5C518' }}
              >
                Total: {totalCost}pts
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-[#D72638] text-sm mb-4 px-3 py-2 bg-[#D72638]/10 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: canSubmit && !submitting
              ? 'linear-gradient(135deg, #D72638, #8B0A1A)'
              : '#1a1a2e',
            color: '#fff',
            fontFamily: 'Impact, sans-serif',
            fontSize: '1rem',
            letterSpacing: '0.1em',
          }}
        >
          {submitting ? 'Saving...' : !isComplete ? `Select ${TEAMS_TO_PICK - selected.length} more team${TEAMS_TO_PICK - selected.length !== 1 ? 's' : ''}` : isOverBudget ? 'Over budget' : !scorersFilled ? 'Pick 3 goalscorers above' : !hostFilled ? `Answer ${HOST_QUESTIONS.filter(q => !hostAnswers[q.key]).length} hosts question${HOST_QUESTIONS.filter(q => !hostAnswers[q.key]).length !== 1 ? 's' : ''} above` : '⚽ Lock In My Picks'}
        </button>

        <p className="text-white/30 text-xs text-center mt-3">
          Rules: 5 teams · max {MAX_BUDGET} pts budget · max 1 elite-tier team
        </p>
      </form>
    </div>
    </>
  )
}
