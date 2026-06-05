import PickForm from '@/components/PickForm'

export const metadata = { title: 'Make Your Pick · Quiniela 2026' }

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
