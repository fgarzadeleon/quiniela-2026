'use client'
import { useEffect, useState } from 'react'
import Flag from './Flag'

interface Outcomes {
  homeWin: string[]
  drawHomePens: string[]
  drawAwayPens: string[]
  awayWin: string[]
}

interface PredictorData {
  available: boolean
  alreadyPlayed?: boolean
  home?: { name: string; code: string }
  away?: { name: string; code: string }
  outcomes?: Outcomes
}

const TABS = [
  { rank: 0, label: '🥇 1st', color: '#F5C518' },
  { rank: 1, label: '🥈 2nd', color: '#C9D2E0' },
  { rank: 2, label: '🥉 3rd', color: '#D4A017' },
  { rank: 3, label: '4th', color: '#8FA0C0' },
]

export default function FinalPredictor() {
  const [data, setData] = useState<PredictorData | null>(null)
  const [tab, setTab] = useState(0)

  useEffect(() => {
    fetch('/api/final-predictor').then(r => r.json()).then(setData).catch(() => setData({ available: false }))
  }, [])

  if (!data || !data.available || !data.home || !data.away || !data.outcomes) return null

  const { home, away, outcomes } = data
  const active = TABS[tab]

  const rows = [
    { key: 'homeWin', label: `${home.name} win`, names: outcomes.homeWin },
    { key: 'drawHomePens', label: `Draw — ${home.name} on pens`, names: outcomes.drawHomePens },
    { key: 'drawAwayPens', label: `Draw — ${away.name} on pens`, names: outcomes.drawAwayPens },
    { key: 'awayWin', label: `${away.name} win`, names: outcomes.awayWin },
  ]

  return (
    <section className="max-w-3xl mx-auto px-4 py-16">
      <h2
        style={{ fontFamily: 'Impact, sans-serif', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', letterSpacing: '0.05em' }}
        className="text-center mb-1"
      >
        FINAL PREDICTOR
      </h2>
      <p className="text-center text-white/40 text-sm mb-2">
        {data.alreadyPlayed
          ? 'The Final is done — here\'s how each result would have shaken out.'
          : 'Pick a result for the Final and see who takes each prize.'}
      </p>
      <div className="flex items-center justify-center gap-2 mb-8 text-white/50 text-xs">
        <Flag code={home.code} name={home.name} size={18} /> {home.name} vs {away.name} <Flag code={away.code} name={away.name} size={18} />
      </div>

      {/* Tabs */}
      <div className="flex justify-center gap-1 p-1 rounded-xl mb-6 w-fit mx-auto" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.map(t => (
          <button
            key={t.rank}
            onClick={() => setTab(t.rank)}
            className="px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all"
            style={{
              fontFamily: 'Impact, sans-serif', letterSpacing: '0.06em',
              background: tab === t.rank ? 'linear-gradient(135deg, #D72638, #8B0A1A)' : 'transparent',
              color: tab === t.rank ? '#fff' : 'rgba(255,255,255,0.4)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {rows.map(r => (
          <div
            key={r.key}
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="text-white/60 text-sm">{r.label}</span>
            <span className="font-bold" style={{ color: active.color, fontFamily: 'Impact, sans-serif', letterSpacing: '0.03em' }}>
              {r.names[active.rank] ?? '—'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-center text-white/25 text-[11px] mt-4">
        Both finalists are the same tier, so the exact scoreline doesn&apos;t change the outcome — only who wins, draws, or loses does.
      </p>
    </section>
  )
}
