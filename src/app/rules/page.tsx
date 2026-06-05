import Link from 'next/link'

export const metadata = { title: 'Rules · Quiniela 2026' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-6 mb-4"
      style={{ background: 'linear-gradient(145deg, #0D1F4A, #111827)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <h2
        style={{ fontFamily: 'Impact, sans-serif', fontSize: '1.2rem', letterSpacing: '0.06em', color: '#F5C518' }}
        className="mb-3"
      >
        {title}
      </h2>
      {children}
    </div>
  )
}

function Rule({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-white/70 text-sm leading-relaxed">
      <span className="text-[#F5C518] mt-0.5 shrink-0">—</span>
      <span>{children}</span>
    </li>
  )
}

export default function RulesPage() {
  return (
    <div>
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
          THE RULES
        </h1>
        <p className="text-white/50 text-sm mt-2">Everything you need to know before locking in your picks.</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">

        <Section title="1. PICKING YOUR TEAMS">
          <ul className="space-y-2">
            <Rule>Pick exactly <strong className="text-white">5 national teams</strong> from the 48 World Cup participants. <span className="text-[#F5C518] font-semibold">New this year — up from 4.</span></Rule>
            <Rule>Each team has a point cost based on their betting odds. Your 5 teams combined cannot exceed <strong className="text-white">300 points</strong>.</Rule>
            <Rule>You may only pick <strong className="text-white">1 team from Tier A</strong> (the elite tier: France, Spain, England, Brazil, Argentina, Portugal, Germany…). The rest can come from any tier.</Rule>
            <Rule>No two players can pick the exact same combination of 5 teams. If your combination is already taken, you&apos;ll be told to change it.</Rule>
          </ul>
        </Section>

        <Section title="2. TEAM TIERS &amp; COSTS">
          <p className="text-white/50 text-sm mb-3">Teams are grouped into 4 tiers based on their World Cup odds. Cheaper teams earn more points when they win — picking underdogs pays off.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-sm">
            {[
              { tier: 'A', label: 'Elite', cost: '85–100 pts', color: '#D72638' },
              { tier: 'B', label: 'Strong', cost: '55–80 pts', color: '#6A90F0' },
              { tier: 'C', label: 'Mid', cost: '30–50 pts', color: '#4ACA6A' },
              { tier: 'D', label: 'Underdog', cost: '10–25 pts', color: '#D4A017' },
            ].map(t => (
              <div key={t.tier} className="rounded-lg p-3" style={{ border: `1px solid ${t.color}22`, background: `${t.color}11` }}>
                <div className="font-bold text-lg" style={{ color: t.color }}>Tier {t.tier}</div>
                <div className="text-white/60 text-xs">{t.label}</div>
                <div className="text-white/40 text-xs mt-1">{t.cost}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="3. TOP SCORERS">
          <ul className="space-y-2">
            <Rule>Along with your teams, you must pick <strong className="text-white">3 goalscorers</strong> — players you think will score the most goals in the tournament.</Rule>
            <Rule>Your scorers should come from your 5 selected teams — the player list is pre-filtered to your squad, but you can type any name freely.</Rule>
            <Rule>The player with the most combined goals from their 3 picks wins the <strong className="text-white">Top Scorer prize</strong>.</Rule>
            <Rule>You can update your scorers any time before kick-off, and again when you use your Wildcard.</Rule>
          </ul>
        </Section>

        <Section title="4. SCORING SYSTEM">
          <p className="text-white/50 text-sm mb-3">Points are awarded after every match. Tier D teams earn more per win to balance out their lower odds.</p>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th className="text-left py-2 text-white/40 font-normal text-xs uppercase tracking-wider">Event</th>
                <th className="text-center py-2 text-xs" style={{ color: '#D72638' }}>Tier A</th>
                <th className="text-center py-2 text-xs" style={{ color: '#6A90F0' }}>Tier B</th>
                <th className="text-center py-2 text-xs" style={{ color: '#4ACA6A' }}>Tier C</th>
                <th className="text-center py-2 text-xs" style={{ color: '#D4A017' }}>Tier D</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Win',              a: '+70',  b: '+85',  c: '+100', d: '+120' },
                { label: 'Draw',             a: '+10',  b: '+30',  c: '+40',  d: '+60'  },
                { label: 'Loss',             a: '−60',  b: '−45',  c: '−30',  d: '−10'  },
                { label: 'Goal scored',      a: '+10',  b: '+10',  c: '+10',  d: '+10'  },
                { label: 'Goal conceded',    a: '−5',   b: '−5',   c: '−5',   d: '−5'   },
                { label: 'Round advanced',   a: '+120', b: '+150', c: '+200', d: '+250' },
                { label: 'Champion',         a: '+500', b: '+500', c: '+500', d: '+500' },
              ].map(r => (
                <tr key={r.label} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td className="py-2 pr-4 text-white/70">{r.label}</td>
                  <td className="py-2 text-center font-mono text-[#D72638]">{r.a}</td>
                  <td className="py-2 text-center font-mono text-[#6A90F0]">{r.b}</td>
                  <td className="py-2 text-center font-mono text-[#4ACA6A]">{r.c}</td>
                  <td className="py-2 text-center font-mono text-[#D4A017]">{r.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="5. DEADLINES &amp; LOCKING">
          <ul className="space-y-2">
            <Rule>Picks open now and close at <strong className="text-white">kick-off on June 11, 2026</strong>.</Rule>
            <Rule>Before June 11 you can change your 5 teams and scorers as many times as you like — for free.</Rule>
            <Rule>Once the tournament starts, all picks are <strong className="text-white">locked in</strong>. No further changes unless you use your Wildcard.</Rule>
          </ul>
        </Section>

        <Section title="6. THE WILDCARD 🃏">
          <ul className="space-y-2">
            <Rule>Each player gets <strong className="text-white">one Wildcard</strong> for the entire tournament.</Rule>
            <Rule>Using it lets you <strong className="text-white">keep 2 of your 5 teams</strong> and swap the other 3 for any new teams you want.</Rule>
            <Rule>You can also update your 3 scorers when you play your Wildcard.</Rule>
            <Rule>Budget and tier rules still apply to your new combination.</Rule>
            <Rule>Use it any time after the tournament starts — but only once. Once it&apos;s gone, it&apos;s gone.</Rule>
            <Rule>If you&apos;re happy with your picks, you never have to use it.</Rule>
          </ul>
        </Section>

        <Section title="7. ACCOUNTS &amp; PASSWORDS">
          <ul className="space-y-2">
            <Rule>When you submit your picks, you set a password. Use it to log back in via <strong className="text-white">My Picks</strong> to edit or use your Wildcard.</Rule>
            <Rule>Forgot your password? Message the group admin — they can reset it.</Rule>
          </ul>
        </Section>

        <div className="text-center mt-8">
          <Link
            href="/picks"
            className="inline-block px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-all duration-200 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #D72638, #8B0A1A)',
              color: '#fff',
              fontFamily: 'Impact, sans-serif',
              fontSize: '1rem',
              letterSpacing: '0.1em',
            }}
          >
            ⚽ Make Your Pick
          </Link>
        </div>
      </div>
    </div>
  )
}
