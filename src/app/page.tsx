import Link from 'next/link'
import CountdownTimer from '@/components/CountdownTimer'
import { TEAMS } from '@/lib/teams'
import { Tier } from '@/types'

const TIER_COLORS: Record<Tier, { bg: string; border: string }> = {
  A: { bg: '#1A0A0A', border: '#D72638' },
  B: { bg: '#0A0E1A', border: '#2A4AB0' },
  C: { bg: '#0A1A0A', border: '#1A6A2A' },
  D: { bg: '#1A1400', border: '#7A5A00' },
}


function ScoringRow({ label, a, b, c, d }: { label: string; a: string; b: string; c: string; d: string }) {
  return (
    <tr className="border-t border-white/5">
      <td className="py-2 pr-4 text-white/70 text-sm">{label}</td>
      <td className="py-2 px-2 text-center text-sm font-mono text-[#D72638]">{a}</td>
      <td className="py-2 px-2 text-center text-sm font-mono text-[#6A90F0]">{b}</td>
      <td className="py-2 px-2 text-center text-sm font-mono text-[#4ACA6A]">{c}</td>
      <td className="py-2 px-2 text-center text-sm font-mono text-[#D4A017]">{d}</td>
    </tr>
  )
}

export default function HomePage() {
  const topTeams = TEAMS.slice(0, 12)

  return (
    <div>
      {/* Hero */}
      <section
        style={{ background: 'linear-gradient(135deg, #060B1A 0%, #0B1B4D 50%, #1A0A0A 100%)' }}
        className="relative overflow-hidden"
      >
        {/* Decorative orbs */}
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(215,38,56,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: '40vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(circle, rgba(27,58,139,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div className="relative max-w-5xl mx-auto px-4 py-20 text-center">
          <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
            style={{ background: 'rgba(215,38,56,0.2)', border: '1px solid rgba(215,38,56,0.4)', color: '#D72638' }}
          >
            FIFA World Cup 2026 · USA · Mexico · Canada
          </div>

          <h1
            style={{
              fontFamily: 'Impact, sans-serif',
              fontSize: 'clamp(3rem, 10vw, 7rem)',
              lineHeight: 0.9,
              letterSpacing: '0.04em',
            }}
          >
            <span style={{ background: 'linear-gradient(180deg, #ffffff 0%, #a0a0c0 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              QUINIELA
            </span>
            <br />
            <span style={{ background: 'linear-gradient(90deg, #F5C518, #D72638)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              2026
            </span>
          </h1>

          <p className="text-white/60 mt-6 text-lg max-w-lg mx-auto">
            Stay under budget. Dominate the ranking.
          </p>

          {/* Key numbers */}
          <div className="flex flex-wrap justify-center gap-3 mt-6 mb-10">
            <div
              className="flex flex-col items-center px-6 py-3 rounded-2xl"
              style={{ background: 'rgba(245,197,24,0.12)', border: '2px solid rgba(245,197,24,0.5)' }}
            >
              <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '2.5rem', lineHeight: 1, color: '#F5C518' }}>5</span>
              <span className="text-xs uppercase tracking-widest text-white/60 mt-0.5">Teams</span>
              <span
                className="text-[10px] font-bold uppercase tracking-widest mt-1 px-2 py-0.5 rounded-full"
                style={{ background: '#F5C518', color: '#000' }}
              >
                New this year
              </span>
            </div>
            <div
              className="flex flex-col items-center px-6 py-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '2.5rem', lineHeight: 1, color: '#fff' }}>300</span>
              <span className="text-xs uppercase tracking-widest text-white/60 mt-0.5">Pt Budget</span>
            </div>
            <div
              className="flex flex-col items-center px-6 py-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <span style={{ fontFamily: 'Impact, sans-serif', fontSize: '2.5rem', lineHeight: 1, color: '#fff' }}>1</span>
              <span className="text-xs uppercase tracking-widest text-white/60 mt-0.5">Wildcard</span>
            </div>
          </div>

          <CountdownTimer />

          <div className="flex flex-col sm:flex-row justify-center gap-4 mt-12">
            <Link
              href="/picks"
              className="px-8 py-3 rounded-xl font-bold text-base uppercase tracking-widest transition-all duration-200 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, #D72638, #8B0A1A)',
                color: '#fff',
                fontFamily: 'Impact, sans-serif',
                fontSize: '1.1rem',
                letterSpacing: '0.1em',
              }}
            >
              ⚽ Make Your Pick
            </Link>
            <Link
              href="/ranking"
              className="px-8 py-3 rounded-xl font-bold text-base uppercase tracking-widest transition-all duration-200 hover:scale-105"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
                fontFamily: 'Impact, sans-serif',
                fontSize: '1.1rem',
                letterSpacing: '0.1em',
              }}
            >
              🏆 View Ranking
            </Link>
          </div>
        </div>
      </section>

      {/* Scoring table */}
      <section
        style={{ background: 'linear-gradient(135deg, #060B1A 0%, #0D1F4A 100%)' }}
        className="py-16"
      >
        <div className="max-w-3xl mx-auto px-4">
          <h2
            style={{ fontFamily: 'Impact, sans-serif', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', letterSpacing: '0.05em' }}
            className="text-center mb-2"
          >
            SCORING TABLE
          </h2>
          <p className="text-center text-white/40 text-sm mb-8">Cheaper teams earn more points per result — underdogs pay off big</p>
          <div
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            className="rounded-xl overflow-hidden"
          >
            <table className="w-full">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <th className="py-3 px-4 text-left text-white/50 text-xs uppercase tracking-wider">Event</th>
                  <th className="py-3 px-2 text-center text-xs uppercase tracking-wider" style={{ color: '#D72638' }}>Tier A<br/><span className="normal-case font-normal opacity-60">80–100 pts</span></th>
                  <th className="py-3 px-2 text-center text-xs uppercase tracking-wider" style={{ color: '#6A90F0' }}>Tier B<br/><span className="normal-case font-normal opacity-60">55–75 pts</span></th>
                  <th className="py-3 px-2 text-center text-xs uppercase tracking-wider" style={{ color: '#4ACA6A' }}>Tier C<br/><span className="normal-case font-normal opacity-60">30–50 pts</span></th>
                  <th className="py-3 px-2 text-center text-xs uppercase tracking-wider" style={{ color: '#D4A017' }}>Tier D<br/><span className="normal-case font-normal opacity-60">10–25 pts</span></th>
                </tr>
              </thead>
              <tbody className="px-4">
                <ScoringRow label="Win" a="+70" b="+85" c="+100" d="+120" />
                <ScoringRow label="Draw" a="+10" b="+30" c="+40" d="+60" />
                <ScoringRow label="Loss" a="−60" b="−45" c="−30" d="−10" />
                <ScoringRow label="Goal scored" a="+10" b="+10" c="+10" d="+10" />
                <ScoringRow label="Goal conceded" a="−5" b="−5" c="−5" d="−5" />
                <ScoringRow label="Round advanced" a="+120" b="+150" c="+200" d="+250" />
                <ScoringRow label="Champion 🏆" a="+500" b="+500" c="+500" d="+500" />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Team preview */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2
          style={{ fontFamily: 'Impact, sans-serif', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', letterSpacing: '0.05em' }}
          className="text-center mb-2"
        >
          THE FIELD
        </h2>
        <p className="text-center text-white/40 text-sm mb-8">48 teams · odds-based point costs</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {topTeams.map(t => (
            <div
              key={t.name}
              style={{ background: TIER_COLORS[t.tier].bg, border: `1px solid ${TIER_COLORS[t.tier].border}` }}
              className="rounded-lg p-3 flex items-center gap-2"
            >
              <span className="text-2xl">{t.flag}</span>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{t.name}</p>
                <p className="text-white/40 text-xs">{t.cost} pts · Tier {t.tier}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link href="/picks" className="text-[#F5C518] hover:underline text-sm">
            View all 48 teams →
          </Link>
        </div>
      </section>
    </div>
  )
}
