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
          Choose 4 teams. Stay under <strong className="text-white">230 points</strong>.
          Pick at most <strong className="text-white">1 elite-tier team</strong>. Then lock it in.
        </p>
      </div>
      <PickForm />
    </section>
  )
}
