'use client'
import { useState } from 'react'

interface Player {
  id: string
  name: string
  paid: boolean
  created_at: string
  total_cost: number
}

export default function PaymentsPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [players, setPlayers] = useState<Player[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/payments?password=${encodeURIComponent(password)}`)
      if (res.status === 401) { setError('Wrong password'); return }
      if (!res.ok) throw new Error('Failed to load')
      setPlayers(await res.json())
      setAuthed(true)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function togglePaid(player: Player) {
    setToggling(player.id)
    const newPaid = !player.paid
    setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, paid: newPaid } : p))
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, id: player.id, paid: newPaid }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, paid: player.paid } : p))
    } finally {
      setToggling(null)
    }
  }

  const paidCount = players.filter(p => p.paid).length

  if (!authed) {
    return (
      <div className="max-w-sm mx-auto px-4 py-32 text-center">
        <h1 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#F5C518' }}>PAYMENTS</h1>
        <p className="text-white/50 text-sm mb-6">Admin access required</p>
        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-center focus:outline-none focus:border-[#F5C518]/50"
          />
          {error && <p className="text-[#D72638] text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg font-bold text-white disabled:opacity-40 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #D72638, #8B0A1A)', fontFamily: 'Impact, sans-serif' }}
          >
            {loading ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#F5C518' }}>PAYMENTS</h1>
          <p className="text-white/40 text-sm mt-0.5">{paidCount} / {players.length} paid</p>
        </div>
        <div className="flex gap-2 text-sm">
          <span
            className="px-3 py-1 rounded-full font-bold"
            style={{ background: 'rgba(74,202,106,0.15)', border: '1px solid rgba(74,202,106,0.4)', color: '#4ACA6A' }}
          >
            {paidCount} paid
          </span>
          <span
            className="px-3 py-1 rounded-full font-bold"
            style={{ background: 'rgba(215,38,56,0.12)', border: '1px solid rgba(215,38,56,0.35)', color: '#D72638' }}
          >
            {players.length - paidCount} pending
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-8">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: players.length ? `${(paidCount / players.length) * 100}%` : '0%',
            background: 'linear-gradient(90deg, #1A6A2A, #4ACA6A)',
          }}
        />
      </div>

      <div className="space-y-2">
        {players.map(player => (
          <div
            key={player.id}
            className="flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200"
            style={{
              background: player.paid
                ? 'linear-gradient(145deg, #0A1A0A, #111827)'
                : 'linear-gradient(145deg, #0D1F4A, #111827)',
              border: `1px solid ${player.paid ? 'rgba(74,202,106,0.25)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{player.name}</p>
              <p className="text-white/30 text-xs">
                {new Date(player.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {' · '}{player.total_cost} pts spent
              </p>
            </div>

            <button
              onClick={() => togglePaid(player)}
              disabled={toggling === player.id}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all duration-150 cursor-pointer disabled:opacity-60"
              style={player.paid ? {
                background: 'rgba(74,202,106,0.15)',
                border: '1px solid rgba(74,202,106,0.4)',
                color: '#4ACA6A',
              } : {
                background: 'rgba(215,38,56,0.1)',
                border: '1px solid rgba(215,38,56,0.3)',
                color: '#D72638',
              }}
            >
              {toggling === player.id ? '…' : player.paid ? '✓ Paid' : '✗ Unpaid'}
            </button>
          </div>
        ))}
      </div>

      {players.length === 0 && (
        <p className="text-center text-white/40 py-20">No entries yet.</p>
      )}
    </div>
  )
}
