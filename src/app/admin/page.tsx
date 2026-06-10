'use client'
import { useState, useEffect } from 'react'
import { GROUPS } from '@/lib/tournament'

const STAGES = [
  { key: 'init',   label: '① Init group matches',      desc: 'Insert all 72 group stage matches as SCHEDULED' },
  { key: 'round1', label: '② Group Stage · Round 1',   desc: 'Simulate first round of group matches' },
  { key: 'round2', label: '③ Group Stage · Round 2',   desc: 'Simulate second round of group matches' },
  { key: 'round3', label: '④ Group Stage · Round 3',   desc: 'Simulate final round (standings set)' },
  { key: 'r32',    label: '⑤ Round of 32',             desc: 'Top 2 from each group + 8 best 3rd place' },
  { key: 'r16',    label: '⑥ Round of 16',             desc: '16 teams remain' },
  { key: 'qf',     label: '⑦ Quarterfinals',           desc: '8 teams remain' },
  { key: 'sf',     label: '⑧ Semifinals',              desc: '4 teams remain' },
  { key: 'final',  label: '⑨ Final',                   desc: 'Champion crowned' },
]

interface Match {
  id: string
  home_team: string
  away_team: string
  home_score: number
  away_score: number
  status: string
  stage: string
  group_name?: string
}

interface Pick {
  id: string
  name: string
  team1: string; team2: string; team3: string; team4: string
  total_points: number
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed]   = useState(false)
  const [log, setLog]         = useState<string[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [picks, setPicks]     = useState<Pick[]>([])

  async function call(action: string) {
    setLoading(action)
    setLog(prev => [...prev, `\n→ ${action}…`])
    try {
      const url = action === 'sync' ? '/api/admin/sync-scores' : '/api/admin'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLog(prev => [...prev, `✗ ${data.error}`])
      } else {
        setLog(prev => [...prev, ...(data.log ?? ['✓ done'])])
        await refreshData()
      }
    } catch (e) {
      setLog(prev => [...prev, `✗ ${e}`])
    } finally {
      setLoading(null)
    }
  }

  async function refreshData() {
    const [mr, pr] = await Promise.all([
      fetch('/api/admin/matches'),
      fetch('/api/ranking'),
    ])
    if (mr.ok) setMatches(await mr.json())
    if (pr.ok) setPicks(await pr.json())
  }

  useEffect(() => { if (authed) refreshData() }, [authed])

  const finishedCount = matches.filter(m => m.status === 'FINISHED').length

  if (!authed) {
    return (
      <div className="max-w-sm mx-auto px-4 py-32 text-center">
        <h1 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#F5C518' }}>ADMIN</h1>
        <p className="text-white/50 text-sm mb-6">Enter admin password to continue</p>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setAuthed(true)}
          placeholder="Password"
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-white text-center mb-3 focus:outline-none focus:border-[#F5C518]/50"
        />
        <button
          onClick={() => setAuthed(true)}
          className="w-full py-2 rounded-lg font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #D72638, #8B0A1A)' }}
        >
          Enter
        </button>
        <p className="text-white/30 text-xs mt-3">Set ADMIN_PASSWORD in .env.local</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 style={{ fontFamily: 'Impact, sans-serif', fontSize: '2rem', color: '#F5C518' }} className="mb-2">
        SIMULATION ADMIN
      </h1>
      <p className="text-white/40 text-sm mb-8">
        {finishedCount} matches finished · {picks.length} picks submitted
      </p>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left: controls */}
        <div className="space-y-4">

          {/* Real scores sync */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'linear-gradient(145deg, #0A1A0A, #111827)', border: '1px solid rgba(74,202,106,0.25)' }}
          >
            <p className="text-[#4ACA6A] text-xs font-bold uppercase tracking-widest mb-1">Real Tournament</p>
            <p className="text-white/40 text-xs mb-3">
              Pulls finished results from football-data.org and writes them to the matches table.
              Run after each match or batch of matches.
            </p>
            <button
              onClick={() => call('sync')}
              disabled={!!loading}
              className="w-full py-2.5 rounded-lg text-sm font-bold transition-all hover:scale-[1.01] disabled:opacity-50 cursor-pointer disabled:cursor-wait"
              style={{ background: 'rgba(74,202,106,0.15)', border: '1px solid rgba(74,202,106,0.4)', color: '#4ACA6A', fontFamily: 'Impact, sans-serif', letterSpacing: '0.05em' }}
            >
              {loading === 'sync' ? '…' : '⚡ Sync Real Scores'}
            </button>
          </div>

          <h2 className="text-white/70 text-xs uppercase tracking-widest pt-2">Simulation</h2>

          {STAGES.map(s => (
            <button
              key={s.key}
              onClick={() => call(s.key)}
              disabled={!!loading}
              className="w-full flex items-start gap-4 p-4 rounded-xl text-left transition-all hover:scale-[1.01] disabled:opacity-50 cursor-pointer disabled:cursor-wait"
              style={{
                background: 'linear-gradient(145deg, #0D1F4A, #111827)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '1rem', color: '#F5C518', minWidth: '3rem' }}>
                {loading === s.key ? '…' : s.key.toUpperCase()}
              </span>
              <div>
                <p className="text-white text-sm font-semibold">{s.label}</p>
                <p className="text-white/40 text-xs mt-0.5">{s.desc}</p>
              </div>
            </button>
          ))}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => call('reset')}
              disabled={!!loading}
              className="flex-1 py-2 rounded-lg text-sm font-bold border border-[#D72638]/50 text-[#D72638] hover:bg-[#D72638]/10 disabled:opacity-50 transition-colors cursor-pointer"
            >
              🗑 Reset All Matches
            </button>
            <button
              onClick={() => call('full')}
              disabled={!!loading}
              className="flex-1 py-2 rounded-lg text-sm font-bold border border-[#F5C518]/50 text-[#F5C518] hover:bg-[#F5C518]/10 disabled:opacity-50 transition-colors cursor-pointer"
            >
              ⚡ Simulate Full WC
            </button>
          </div>
        </div>

        {/* Right: log + ranking */}
        <div className="space-y-6">
          {/* Log */}
          <div
            style={{ background: '#060B1A', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'monospace' }}
            className="rounded-xl p-4 h-56 overflow-y-auto text-xs text-white/60"
          >
            {log.length === 0
              ? <span className="text-white/30">Click a stage to run it…</span>
              : log.map((l, i) => <div key={i} className={l.startsWith('✓') ? 'text-[#4ACA6A]' : l.startsWith('✗') ? 'text-[#D72638]' : l.startsWith('→') ? 'text-[#F5C518] font-bold' : ''}>{l}</div>)
            }
          </div>

          {/* Ranking */}
          {picks.length > 0 && (
            <div>
              <h2 className="text-white/70 text-xs uppercase tracking-widest mb-3">Current Ranking</h2>
              <div className="space-y-2">
                {picks.map((p, i) => (
                  <div
                    key={p.id}
                    style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.08)' }}
                    className="rounded-lg p-3 flex items-center justify-between gap-2"
                  >
                    <span className="text-white/40 text-sm w-6">#{i + 1}</span>
                    <span className="text-white text-sm font-medium flex-1">{p.name}</span>
                    <span className="text-white/50 text-xs hidden sm:block">
                      {[p.team1, p.team2, p.team3, p.team4].join(' · ')}
                    </span>
                    <span style={{ fontFamily: 'Impact, sans-serif', color: '#F5C518', fontSize: '1rem' }}>
                      {p.total_points.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Groups preview */}
          <div>
            <h2 className="text-white/70 text-xs uppercase tracking-widest mb-3">Groups</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(GROUPS).map(([g, teams]) => (
                <div
                  key={g}
                  style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.08)' }}
                  className="rounded-lg p-2"
                >
                  <p className="text-[#F5C518] text-xs font-bold mb-1">Group {g}</p>
                  {teams.map(t => <p key={t} className="text-white/60 text-xs">{t}</p>)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
