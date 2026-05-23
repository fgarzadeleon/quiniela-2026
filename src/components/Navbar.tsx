'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',         label: 'Home' },
  { href: '/picks',    label: 'Make Your Pick' },
  { href: '/ranking',  label: 'Ranking' },
  { href: '/scores',   label: 'Live Scores' },
]

export default function Navbar() {
  const path = usePathname()

  return (
    <nav
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

        {/* Mobile menu */}
        <div className="flex sm:hidden items-center gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`p-2 rounded-md text-xs transition-colors ${
                path === l.href
                  ? 'text-[#F5C518]'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {l.label === 'Home' ? '🏠' : l.label === 'Make Your Pick' ? '✅' : l.label === 'Ranking' ? '🏆' : '⚽'}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
