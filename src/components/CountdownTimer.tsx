'use client'
import { useEffect, useState } from 'react'

// 2026 FIFA World Cup kick-off: June 11, 2026 16:00 UTC (first match)
const WC_START = new Date('2026-06-11T16:00:00Z')

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function calcTimeLeft(): TimeLeft {
  const diff = WC_START.getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  }
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
  const [time, setTime] = useState<TimeLeft>(calcTimeLeft())
  const [started, setStarted] = useState(false)

  useEffect(() => {
    setStarted(true)
    const id = setInterval(() => setTime(calcTimeLeft()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!started) return null

  const isLive = WC_START <= new Date()

  return (
    <div className="text-center">
      {isLive ? (
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
      ) : (
        <>
          <p className="text-white/50 text-sm uppercase tracking-widest mb-3">Tournament begins in</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Unit value={time.days}    label="Days"    />
            <Unit value={time.hours}   label="Hours"   />
            <Unit value={time.minutes} label="Minutes" />
            <Unit value={time.seconds} label="Seconds" />
          </div>
        </>
      )}
    </div>
  )
}
