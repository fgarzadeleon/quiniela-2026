'use client'
import { useEffect, useState } from 'react'
import { WILDCARD_DEADLINES, WildcardDeadline } from '@/lib/scoring'

const WC_START = new Date('2026-06-11T19:00:00Z')

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calcTimeLeft(target: Date): TimeLeft {
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
}

function getNextDeadline(now: Date): WildcardDeadline | null {
  return WILDCARD_DEADLINES.find(d => now < d.deadline) ?? null
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div
        style={{
          background: 'linear-gradient(145deg, #0D1F4A, #1A2E6B)',
          border: '1px solid rgba(245,197,24,0.3)',
          fontFamily: 'Impact, sans-serif',
          fontSize: 'clamp(1.8rem, 5vw, 3rem)',
          lineHeight: 1,
          minWidth: '4rem',
        }}
        className="rounded-lg px-3 py-2 text-[#F5C518] text-center"
      >
        {String(value).padStart(2, '0')}
      </div>
      <span className="text-white/50 text-xs mt-1 uppercase tracking-widest">{label}</span>
    </div>
  )
}

export default function CountdownTimer() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!now) return null

  // Before tournament: countdown to kick-off
  if (now < WC_START) {
    const time = calcTimeLeft(WC_START)
    return (
      <div className="text-center">
        <p className="text-white/50 text-sm uppercase tracking-widest mb-3">Tournament begins in</p>
        <div className="flex justify-center gap-3 flex-wrap">
          <Unit value={time.days}    label="Days"    />
          <Unit value={time.hours}   label="Hours"   />
          <Unit value={time.minutes} label="Minutes" />
          <Unit value={time.seconds} label="Seconds" />
        </div>
      </div>
    )
  }

  // Tournament live — show next wildcard deadline if one exists
  const next = getNextDeadline(now)
  if (next) {
    const time = calcTimeLeft(next.deadline)
    const deadlineLocal = next.deadline.toLocaleString(undefined, {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
      timeZoneName: 'short',
    })
    return (
      <div className="text-center">
        <div className="inline-flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white/50 text-sm uppercase tracking-widest">Tournament live</span>
        </div>
        <p className="text-white/60 text-xs uppercase tracking-widest mb-2">
          🃏 Wildcard closes for <strong className="text-white/80">{next.label}</strong> in
        </p>
        <div className="flex justify-center gap-3 flex-wrap">
          <Unit value={time.days}    label="Days"    />
          <Unit value={time.hours}   label="Hours"   />
          <Unit value={time.minutes} label="Minutes" />
          <Unit value={time.seconds} label="Seconds" />
        </div>
        <p className="text-white/30 text-xs mt-3 tabular-nums">{deadlineLocal}</p>
      </div>
    )
  }

  // All deadlines passed
  return (
    <p
      style={{
        fontFamily: 'Impact, sans-serif',
        fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
        background: 'linear-gradient(90deg, #F5C518, #D72638)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
      }}
    >
      🔴 THE WORLD CUP IS LIVE!
    </p>
  )
}
