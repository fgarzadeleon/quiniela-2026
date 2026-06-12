'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

const links = [
  { href: '/',          label: 'Home',          icon: '🏠' },
  { href: '/picks',     label: 'Make Your Pick', icon: '✅' },
  { href: '/rules',     label: 'Rules',          icon: '📋' },
  { href: '/ranking',   label: 'Ranking',        icon: '🏆' },
  { href: '/scores',    label: 'Live Scores',    icon: '⚽' },
  { href: '/scorers',   label: 'Scorers',        icon: '👟' },
  { href: '/my-picks',  label: 'My Picks',       icon: '🃏' },
]

export default function Navbar() {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  // Close when navigating
  useEffect(() => { setOpen(false) }, [path])

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <nav
      ref={navRef}
      style={{ background: 'linear-gradient(90deg, #060B1A 0%, #0B1B4D 100%)' }}
      className="sticky top-0 z-50 border-b border-white/10"
    >
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">⚽</span>
          <span
            style={{
              fontFamily: 'Impact, sans-serif',
              background: 'linear-gradient(90deg, #F5C518, #D72638)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontSize: '1.2rem',
              letterSpacing: '0.1em',
            }}
          >
            QUINIELA 2026
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden sm:flex items-center gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                path === l.href
                  ? 'bg-[#D72638] text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-2 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          onClick={() => setOpen(v => !v)}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="18" y2="18" />
              <line x1="18" y1="4" x2="4" y2="18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="19" y2="6" />
              <line x1="3" y1="11" x2="19" y2="11" />
              <line x1="3" y1="16" x2="19" y2="16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div
          className="sm:hidden border-t border-white/10"
          style={{ background: 'linear-gradient(180deg, #0D1F4A 0%, #060B1A 100%)' }}
        >
          {links.map(l => {
            const active = path === l.href
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-5 py-3.5 text-sm font-medium border-b border-white/5 last:border-0 transition-colors"
                style={{
                  color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  background: active ? 'rgba(215,38,56,0.12)' : 'transparent',
                  borderLeft: active ? '3px solid #D72638' : '3px solid transparent',
                }}
              >
                <span className="text-base w-5 text-center">{l.icon}</span>
                {l.label}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#D72638]" />}
              </Link>
            )
          })}
        </div>
      )}
    </nav>
  )
}
