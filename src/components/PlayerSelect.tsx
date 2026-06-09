'use client'
import { useState, useEffect, useRef } from 'react'

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface PlayerInfo { id: number; name: string; position: string }
export interface TeamSquad { team: string; players: PlayerInfo[] }

const POSITION_SHORT: Record<string, string> = {
  Forward: 'FW', Midfielder: 'MF', Defender: 'DF', Goalkeeper: 'GK',
}

export default function PlayerSelect({
  index,
  value,
  onChange,
  squads,
  otherPicks,
}: {
  index: number
  value: string
  onChange: (v: string) => void
  squads: TeamSquad[]
  otherPicks: string[]
}) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const allPlayers = squads.flatMap(s => s.players.map(p => ({ ...p, team: s.team })))
  const filtered = query.length >= 1
    ? allPlayers.filter(p => norm(p.name).includes(norm(query)) && !otherPicks.includes(p.name))
    : allPlayers.filter(p => !otherPicks.includes(p.name))

  const grouped = squads.map(s => ({
    team: s.team,
    players: filtered.filter(p => p.team === s.team),
  })).filter(g => g.players.length > 0)

  function select(name: string) {
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        placeholder={`Scorer ${index + 1} — search player name`}
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#F5C518]/50"
      />
      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1 rounded-lg overflow-auto z-50 shadow-xl"
          style={{ background: '#0D1F4A', border: '1px solid rgba(255,255,255,0.15)', maxHeight: '220px' }}
        >
          {grouped.length === 0 && (
            <p className="px-3 py-2 text-white/40 text-sm">
              No match — just type the name directly and it will be saved.
            </p>
          )}
          {grouped.map(g => (
            <div key={g.team}>
              <p className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-widest text-white/30 font-bold">{g.team}</p>
              {g.players.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={() => select(p.name)}
                  className="w-full text-left px-3 py-1.5 text-sm text-white hover:bg-white/10 flex items-center justify-between gap-2"
                >
                  <span>{p.name}</span>
                  <span className="text-[10px] text-white/30 font-mono">{POSITION_SHORT[p.position] ?? p.position}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
