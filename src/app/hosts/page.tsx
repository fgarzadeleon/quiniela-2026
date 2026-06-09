'use client'
import { useState } from 'react'
import Flag from '@/components/Flag'

const DEADLINE = new Date('2026-06-11T16:00:00Z')

const HOSTS = [
  { name: 'USA',    code: 'us' },
  { name: 'Mexico', code: 'mx' },
  { name: 'Canada', code: 'ca' },
] as const

type Host = 'USA' | 'Mexico' | 'Canada'

const QUESTIONS: { key: string; label: string; desc: string; icon: string }[] = [
  { key: 'dirtiest',        label: 'Dirtiest Host',          desc: 'Most yellow and red cards combined across the tournament.',         icon: '🟨🟥' },
  { key: 'best',            label: 'Best Host',              desc: 'Best ranked at end of tournament.',  icon: '🏆' },
  { key: 'worst',           label: 'Worst Host',             desc: 'Worst ranked at end of tournament.', icon: '📉' },
  { key: 'most_goals_for',  label: 'Most Goals Scored',      desc: 'Which host scores the most goals across all their matches.',         icon: '⚽' },
  { key: 'most_goals_against', label: 'Most Goals Conceded', desc: 'Which host lets in the most goals across all their matches.',        icon: '🥅' },
]

type Answers = Record<string, Host>

export default function HostsPage() {
  const [stage, setStage] = useState<'login' | 'form' | 'done'>('login')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [answers, setAnswers] = useState<Answers>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isClosed = new Date() >= DEADLINE

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/host-predictions?name=${encodeURIComponent(name.trim())}&password=${encodeURIComponent(password.trim())}`
      )
      if (res.status === 401) {
        const d = await res.json()
        throw new Error(d.error)
      }
      const existing = await res.json()
      if (existing) {
        const a: Answers = {}
        QUESTIONS.forEach(q => { if (existing[q.key]) a[q.key] = existing[q.key] })
        setAnswers(a)
      }
      setStage('form')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (QUESTIONS.some(q => !answers[q.key])) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/host-predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password: password.trim(), ...answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStage('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const allAnswered = QUESTIONS.every(q => answers[q.key])

  return (
    <div>
      <div
        style={{ background: 'linear-gradient(135deg, #060B1A 0%, #0B1B4D 60%, #1A0A0A 100%)' }}
        className="py-12 px-4 text-center"
      >
        <div className="text-5xl mb-3">🏟️</div>
        <h1
          style={{
            fontFamily: 'Impact, sans-serif',
            fontSize: 'clamp(2rem, 6vw, 3.5rem)',
            background: 'linear-gradient(90deg, #F5C518, #D72638)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '0.05em',
          }}
        >
          HOSTS CHALLENGE
        </h1>
        <p className="text-white/50 text-sm mt-2 max-w-md mx-auto">
          5 questions about USA, Mexico &amp; Canada. Each correct answer is worth <strong className="text-[#F5C518]">100 points</strong>.
        </p>
        <div className="flex justify-center gap-4 mt-4">
          <Flag code="us" name="USA" size={32} />
          <Flag code="mx" name="Mexico" size={32} />
          <Flag code="ca" name="Canada" size={32} />
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-10">

        {/* LOGIN */}
        {stage === 'login' && (
          <form
            onSubmit={handleLogin}
            style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
            className="rounded-xl p-6 space-y-4"
          >
            <p className="text-white/60 text-sm">Log in with your picks name and password to answer.</p>
            <div>
              <label className="text-white/60 text-sm block mb-1">Your name</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)} required
                placeholder="Same name as your picks"
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
              {loading ? 'Checking...' : 'Continue →'}
            </button>
          </form>
        )}

        {/* QUESTIONS */}
        {stage === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {isClosed && (
              <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm"
                style={{ background: 'rgba(215,38,56,0.08)', border: '1px solid rgba(215,38,56,0.3)' }}>
                <span>🔒</span>
                <span className="text-white/70">Predictions are locked — tournament has started. Showing your answers.</span>
              </div>
            )}

            {QUESTIONS.map(q => (
              <div
                key={q.key}
                style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.1)' }}
                className="rounded-xl p-5"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{q.icon}</span>
                  <h3 className="text-white font-bold" style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.05rem', letterSpacing: '0.04em' }}>
                    {q.label.toUpperCase()}
                  </h3>
                </div>
                <p className="text-white/40 text-xs mb-4">{q.desc}</p>
                <div className="grid grid-cols-3 gap-2">
                  {HOSTS.map(h => {
                    const selected = answers[q.key] === h.name
                    return (
                      <button
                        key={h.name}
                        type="button"
                        disabled={isClosed}
                        onClick={() => !isClosed && setAnswers(prev => ({ ...prev, [q.key]: h.name as Host }))}
                        className="flex flex-col items-center gap-1 py-3 rounded-xl transition-all duration-150 cursor-pointer disabled:cursor-default"
                        style={{
                          background: selected ? 'rgba(245,197,24,0.15)' : 'rgba(255,255,255,0.04)',
                          border: selected ? '2px solid #F5C518' : '1px solid rgba(255,255,255,0.12)',
                          boxShadow: selected ? '0 0 16px rgba(245,197,24,0.2)' : 'none',
                        }}
                      >
                        <Flag code={h.code} name={h.name} size={32} />
                        <span className="text-xs font-bold text-white/80">{h.name}</span>
                        {selected && <span className="text-[10px] text-[#F5C518] font-bold">✓ Selected</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {!isClosed && (
              <>
                {error && <p className="text-[#D72638] text-sm px-3 py-2 bg-[#D72638]/10 rounded-lg">{error}</p>}
                <button
                  type="submit"
                  disabled={!allAnswered || loading}
                  className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  style={{
                    background: allAnswered ? 'linear-gradient(135deg, #D72638, #8B0A1A)' : '#1a1a2e',
                    color: '#fff',
                    fontFamily: 'Impact, sans-serif',
                    fontSize: '1rem',
                    letterSpacing: '0.1em',
                  }}
                >
                  {loading ? 'Saving...' : allAnswered ? '🏟️ Lock In My Predictions' : `Answer ${QUESTIONS.filter(q => !answers[q.key]).length} more question${QUESTIONS.filter(q => !answers[q.key]).length !== 1 ? 's' : ''}`}
                </button>
              </>
            )}
          </form>
        )}

        {/* DONE */}
        {stage === 'done' && (
          <div className="text-center py-10">
            <div className="text-6xl mb-4">🏟️</div>
            <h2 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#F5C518' }}>
              Predictions saved!
            </h2>
            <p className="text-white/50 mt-2 mb-8">500 bonus points up for grabs. Good luck, {name}.</p>
            <div className="space-y-2 text-left mb-8">
              {QUESTIONS.map(q => {
                const host = HOSTS.find(h => h.name === answers[q.key])
                return (
                  <div key={q.key} className="flex items-center justify-between px-4 py-2 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="text-white/60 text-sm">{q.icon} {q.label}</span>
                    <span className="text-white font-bold text-sm flex items-center gap-1">{host && <Flag code={host.code} name={host.name} size={16} />} {host?.name}</span>
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => setStage('form')}
              className="px-5 py-2 rounded-lg border border-white/20 text-sm text-white/60 hover:text-white hover:border-white/40 transition-colors"
            >
              Edit predictions
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
