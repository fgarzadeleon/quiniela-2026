'use client'
import { useEffect, useState } from 'react'
import { WILDCARD_DEADLINES } from '@/lib/scoring'

function fmtLocal(d: Date) {
  return d.toLocaleString(undefined, {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZoneName: 'short',
  })
}

export default function WildcardDeadlinesTable() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()) }, [])
  if (!now) return null

  return (
    <div className="mt-4 space-y-1">
      {WILDCARD_DEADLINES.map(({ label, deadline }) => {
        const isPast = now >= deadline
        return (
          <div
            key={deadline.toISOString()}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs"
            style={{
              background: isPast ? 'rgba(255,255,255,0.02)' : 'rgba(245,197,24,0.05)',
              border: `1px solid ${isPast ? 'rgba(255,255,255,0.06)' : 'rgba(245,197,24,0.15)'}`,
            }}
          >
            <span style={{ color: isPast ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)' }}>
              {label}
            </span>
            <span
              className="tabular-nums shrink-0"
              style={{
                color: isPast ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.45)',
                textDecoration: isPast ? 'line-through' : 'none',
              }}
            >
              {fmtLocal(deadline)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
