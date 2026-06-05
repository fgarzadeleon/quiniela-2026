import PickForm from '@/components/PickForm'
import Link from 'next/link'

export const metadata = { title: 'Make Your Pick · Quiniela 2026' }

const RULES = [
  { icon: '5️⃣', title: 'Pick 5 Teams', body: 'For the first time, choose 5 national teams from the 48 World Cup participants — up from 4.', featured: true },
  { icon: '💰', title: '300 Point Budget', body: "Each team has a cost based on betting odds. Your 5 teams can't exceed 300 points total." },
  { icon: '⭐', title: 'Max 1 Elite Team', body: 'You may only pick one team from Tier A (France, Spain, England, Brazil, Argentina…).' },
  { icon: '⚽', title: 'Live Scoring', body: 'Every win, goal, draw, and advancement earns (or costs) you points. Underdogs pay off more.' },
  { icon: '🎯', title: 'Top Scorers', body: 'Pick 3 goalscorers from your teams. Most combined goals wins the scorer prize.' },
]

export default function PicksPage() {
  return (
    <section>
      <div
        style={{ background: 'linear-gradient(135deg, #060B1A 0%, #0B1B4D 60%, #1A0A0A 100%)' }}
        className="py-12 px-4 text-center"
      >
        <h1
          style={{
            fontFamily: 'Impact, sans-serif',
            fontSize: 'clamp(2rem, 6vw, 3.5rem)',
            background: 'linear-gradient(90deg, #F5C518, #D72638)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '0.05em',
          }}
        >
          MAKE YOUR PICK
        </h1>
        <p className="text-white/60 mt-2 text-sm max-w-lg mx-auto">
          Choose <strong className="text-white">5 teams</strong>. Stay under <strong className="text-white">300 points</strong>.
          Pick at most <strong className="text-white">1 elite-tier team</strong>. Then lock it in.
        </p>
      </div>

      {/* Rules */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        {/* Pick 5 Teams — featured */}
        <div
          className="rounded-xl p-5 mb-3 flex items-center gap-4"
          style={{ background: 'linear-gradient(135deg, #1A1400, #0D1F4A)', border: '2px solid rgba(245,197,24,0.5)' }}
        >
          <div className="text-4xl shrink-0">5️⃣</div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-white font-bold">Pick 5 Teams</h3>
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#F5C518', color: '#000' }}>New this year</span>
            </div>
            <p className="text-white/60 text-sm">For the first time, choose 5 national teams from the 48 World Cup participants — up from 4.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {RULES.slice(1).map(r => (
            <div key={r.title} style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.08)' }} className="rounded-xl p-4">
              <div className="text-2xl mb-2">{r.icon}</div>
              <h3 className="text-white font-bold text-sm mb-1">{r.title}</h3>
              <p className="text-white/50 text-xs leading-relaxed">{r.body}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-white/30 text-xs mb-6">
          Full scoring breakdown on the <Link href="/rules" className="text-[#F5C518] hover:underline">Rules page</Link>
        </p>
      </div>

      {/* Wildcard explainer */}
      <div className="max-w-2xl mx-auto px-4 mt-8">
        <div
          className="rounded-xl p-5 flex gap-4 items-start"
          style={{ background: 'linear-gradient(135deg, #1A1200, #0D1F4A)', border: '1px solid rgba(245,197,24,0.3)' }}
        >
          <span className="text-3xl shrink-0">🃏</span>
          <div>
            <h2 className="text-[#F5C518] font-bold mb-1" style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.1rem', letterSpacing: '0.05em' }}>
              WHAT IS THE WILDCARD?
            </h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Once the tournament starts your picks are <strong className="text-white">locked in</strong>. But each player gets <strong className="text-white">one Wildcard</strong> for the entire tournament — use it to swap out <strong className="text-white">3 of your 5 teams</strong> and keep the other 2. Use it whenever you want, but only once. If you&apos;re happy with your picks, you never have to use it.
            </p>
          </div>
        </div>
      </div>

      <PickForm />
    </section>
  )
}
