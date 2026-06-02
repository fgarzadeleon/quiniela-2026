'use client'
import { useState } from 'react'
import { allGroupMatches } from '@/lib/tournament'
import { simulateMatch, buildStandings, advancing, makeKnockoutMatches } from '@/lib/simulation'
import { calculatePickPoints } from '@/lib/scoring'
import { TEAM_MAP } from '@/lib/teams'
import type { Match, Pick } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamRecord { team: string; pts: number; gd: number; gf: number; group: string; played: number }
interface RankEntry { id: string; name: string; team1: string; team2: string; team3: string; team4: string; total_cost: number; pts: number; rank: number }

// ── Seed picks ────────────────────────────────────────────────────────────────

const SEED = [
  { name: 'Fede',    team1: 'Brazil',    team2: 'Colombia',              team3: 'Scotland',       team4: 'Tunisia',    team5: 'Jordan' },
  { name: 'Arturo',  team1: 'France',    team2: 'Belgium',               team3: 'Egypt',          team4: 'Qatar',      team5: 'Haiti' },
  { name: 'Rodrigo', team1: 'Scotland',  team2: 'Australia',             team3: 'Haiti',          team4: 'Curacao',    team5: 'Panama' },
  { name: 'Elena',   team1: 'Germany',   team2: 'Morocco',               team3: 'Czech Republic', team4: 'New Zealand',team5: 'Iraq' },
  { name: 'Mateo',   team1: 'Argentina', team2: 'Colombia',              team3: 'Ecuador',        team4: 'Panama',     team5: 'Qatar' },
  { name: 'Sofía',   team1: 'England',   team2: 'Norway',                team3: 'Sweden',         team4: 'Czech Republic', team5: 'Jordan' },
  { name: 'Pablo',   team1: 'Japan',     team2: 'Senegal',               team3: 'Bosnia and Herzegovina', team4: 'Saudi Arabia', team5: 'Uzbekistan' },
  { name: 'Carmen',  team1: 'Mexico',    team2: 'USA',                   team3: 'Canada',         team4: 'Panama',     team5: 'Curacao' },
  { name: 'Luisa',   team1: 'Spain',     team2: 'Croatia',               team3: 'South Korea',    team4: 'Iraq',       team5: 'Haiti' },
  { name: 'Diego',   team1: 'Portugal',  team2: 'Uruguay',               team3: 'Ghana',          team4: 'Cape Verde', team5: 'Uzbekistan' },
]

function makePicks(): Pick[] {
  return SEED.map((s, i) => ({
    id: String(i), created_at: new Date().toISOString(),
    email: undefined, total_points: 0,
    scorer1: undefined, scorer2: undefined, scorer3: undefined,
    ...s,
    total_cost: [s.team1, s.team2, s.team3, s.team4, s.team5]
      .reduce((sum, t) => sum + (TEAM_MAP.get(t)?.cost ?? 0), 0),
  }))
}

// ── Stage config — one colour per stage, rainbow progression ──────────────────

const STAGES = [
  { label: 'GROUP STAGE · ROUND 1', cta: 'SIMULATE ROUND 2',  color: '#FFD700', dark: true  },
  { label: 'GROUP STAGE · ROUND 2', cta: 'SIMULATE ROUND 3',  color: '#FF8C00', dark: false },
  { label: 'GROUP STAGE · ROUND 3', cta: 'ROUND OF 32',       color: '#FF3A2D', dark: false },
  { label: 'ROUND OF 32',           cta: 'ROUND OF 16',       color: '#00D48A', dark: true  },
  { label: 'ROUND OF 16',           cta: 'QUARTERFINALS',     color: '#0099FF', dark: false },
  { label: 'QUARTERFINALS',         cta: 'SEMIFINALS',        color: '#B040F0', dark: false },
  { label: 'SEMIFINALS',            cta: 'THE FINAL',         color: '#FF3A2D', dark: false },
  { label: 'THE FINAL',             cta: 'PLAY AGAIN ↺',      color: '#FFD700', dark: true  },
]

// ── Date ranges for group-stage rounds ────────────────────────────────────────

const BASE_MS = new Date('2026-06-11T00:00:00Z').getTime()
const ROUND_RANGES: Record<number, [number, number]> = {
  1: [BASE_MS,                    BASE_MS + 7 * 86400_000],
  2: [BASE_MS + 7 * 86400_000,    BASE_MS + 13 * 86400_000],
  3: [BASE_MS + 13 * 86400_000,   BASE_MS + 20 * 86400_000],
}

// ── Simulation logic (pure, client-side) ─────────────────────────────────────

function simGroupRound(matches: Match[], round: number): { next: Match[]; results: Match[] } {
  const [from, to] = ROUND_RANGES[round]
  const next = [...matches]
  const results: Match[] = []
  matches.forEach((m, i) => {
    if (m.stage !== 'GROUP_STAGE' || m.status !== 'SCHEDULED') return
    const ms = new Date(m.match_date).getTime()
    if (ms < from || ms >= to) return
    const r = simulateMatch(m.home_team, m.away_team)
    next[i] = { ...m, home_score: r.home_score, away_score: r.away_score, status: 'FINISHED' }
    results.push(next[i])
  })
  return { next, results }
}

const PREV_STAGE: Record<string, string> = {
  ROUND_OF_16: 'ROUND_OF_32', QUARTER_FINALS: 'ROUND_OF_16',
  SEMI_FINALS: 'QUARTER_FINALS', FINAL: 'SEMI_FINALS',
}

function simKnockout(matches: Match[], stage: string): { next: Match[]; results: Match[] } {
  let teams: string[]
  if (stage === 'ROUND_OF_32') {
    teams = advancing(buildStandings(matches.filter(m => m.stage === 'GROUP_STAGE' && m.status === 'FINISHED')))
  } else {
    teams = matches
      .filter(m => m.stage === PREV_STAGE[stage] && m.status === 'FINISHED')
      .map(m => m.home_score > m.away_score ? m.home_team : m.away_team)
  }
  const templates = makeKnockoutMatches(teams, stage, new Date()) as Omit<Match, 'id'>[]
  let ctr = matches.length
  const results: Match[] = templates.map(tpl => {
    let { home_score: hs, away_score: as_ } = simulateMatch(tpl.home_team, tpl.away_team)
    if (hs === as_) { Math.random() > 0.5 ? hs++ : as_++ }
    return { ...tpl, id: String(ctr++), home_score: hs, away_score: as_, status: 'FINISHED' as const }
  })
  return { next: [...matches, ...results], results }
}

// ── Visual: concentric rectangles — the 2026 WC tunnel ───────────────────────

const TUNNEL_BANDS = ['#FF3A2D', '#FF8C00', '#FFD700', '#00D48A', '#0099FF', '#5040EE', '#B040F0']

function Tunnel({ size = 140 }: { size?: number }) {
  const step = Math.max(8, Math.floor(size / (TUNNEL_BANDS.length + 2)))
  const bw = Math.max(3, step - 2)
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {TUNNEL_BANDS.map((c, i) => (
        <div key={i} style={{
          position: 'absolute', inset: `${i * step}px`,
          border: `${bw}px solid ${c}`, borderRadius: 4,
        }} />
      ))}
      <div style={{
        position: 'absolute', inset: `${TUNNEL_BANDS.length * step}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#070B1A', borderRadius: 2,
        fontSize: `${Math.max(14, size * 0.18)}px`, lineHeight: 1,
      }}>🏆</div>
    </div>
  )
}

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({ m, accent, showAdv }: { m: Match; accent: string; showAdv?: boolean }) {
  const hWin = m.home_score > m.away_score
  const aWin = m.away_score > m.home_score
  const hTeam = TEAM_MAP.get(m.home_team)
  const aTeam = TEAM_MAP.get(m.away_team)
  return (
    <div style={{
      background: 'rgba(255,255,255,0.033)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderLeft: `3px solid ${accent}`,
      borderRadius: 8, padding: '0.4rem 0.7rem',
      display: 'flex', alignItems: 'center', gap: '0.4rem',
    }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.3rem', minWidth: 0 }}>
        <span style={{
          fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: hWin ? '#fff' : 'rgba(255,255,255,0.38)', fontWeight: hWin ? 700 : 400,
        }}>{m.home_team}</span>
        <span style={{ fontSize: '1.1rem', flexShrink: 0, lineHeight: 1 }}>{hTeam?.flag ?? '🏳'}</span>
      </div>
      <div style={{
        fontFamily: 'var(--font-bebas, Impact)', fontSize: '1.1rem', letterSpacing: '0.04em',
        color: accent, minWidth: '3rem', textAlign: 'center', flexShrink: 0,
      }}>{m.home_score} – {m.away_score}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.3rem', minWidth: 0 }}>
        <span style={{ fontSize: '1.1rem', flexShrink: 0, lineHeight: 1 }}>{aTeam?.flag ?? '🏳'}</span>
        <span style={{
          fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: aWin ? '#fff' : 'rgba(255,255,255,0.38)', fontWeight: aWin ? 700 : 400,
        }}>{m.away_team}</span>
      </div>
      {showAdv && (
        <span style={{
          fontSize: '0.6rem', color: 'rgba(255,255,255,0.28)',
          borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '0.4rem', flexShrink: 0,
        }}>{hWin ? '→' : aWin ? '←' : '='}</span>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LivePage() {
  const [stageIdx, setStageIdx]   = useState(-1)
  const [matches, setMatches]     = useState<Match[]>([])
  const [picks]                   = useState<Pick[]>(makePicks)
  const [lastResults, setResults] = useState<Match[]>([])
  const [prevRanks, setPrev]      = useState<Record<string, number>>({})
  const [standings, setStandings] = useState<Record<string, TeamRecord[]> | null>(null)
  const [champion, setChampion]   = useState<string | null>(null)

  function calcRanking(): RankEntry[] {
    const fin = matches.filter(m => m.status === 'FINISHED')
    return picks
      .map(p => ({ id: p.id, name: p.name, team1: p.team1, team2: p.team2, team3: p.team3, team4: p.team4, total_cost: p.total_cost, pts: calculatePickPoints(p, fin), rank: 0 }))
      .sort((a, b) => b.pts - a.pts)
      .map((p, i) => ({ ...p, rank: i + 1 }))
  }

  function commit(nextIdx: number, nextMatches: Match[], results: Match[]) {
    setPrev(calcRanking().reduce<Record<string, number>>((a, r) => { a[r.name] = r.rank; return a }, {}))
    setMatches(nextMatches)
    setResults(results)
    setStageIdx(nextIdx)
  }

  function handleClick() {
    if (stageIdx === 7) {
      setStageIdx(-1); setMatches([]); setResults([]); setPrev({}); setStandings(null); setChampion(null)
      return
    }
    if (stageIdx === -1) {
      const all = allGroupMatches().map((m, i) => ({ ...m, id: String(i) })) as Match[]
      const { next, results } = simGroupRound(all, 1)
      commit(0, next, results); return
    }
    if (stageIdx === 0) { const { next, results } = simGroupRound(matches, 2); commit(1, next, results); return }
    if (stageIdx === 1) {
      const { next, results } = simGroupRound(matches, 3)
      setStandings(buildStandings(next.filter(m => m.stage === 'GROUP_STAGE' && m.status === 'FINISHED')) as Record<string, TeamRecord[]>)
      commit(2, next, results); return
    }
    const KO = ['ROUND_OF_32', 'ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL']
    const ki = stageIdx - 2
    if (ki >= 0 && ki < KO.length) {
      const { next, results } = simKnockout(matches, KO[ki])
      if (KO[ki] === 'FINAL' && results[0]) {
        setChampion(results[0].home_score > results[0].away_score ? results[0].home_team : results[0].away_team)
      }
      commit(stageIdx + 1, next, results)
    }
  }

  const stage   = STAGES[stageIdx]
  const accent  = stage?.color ?? '#FFD700'
  const ctaDark = stage?.dark ?? true
  const ranked  = calcRanking()
  const isGroup = stageIdx >= 0 && stageIdx <= 2

  const byGroup = lastResults.reduce<Record<string, Match[]>>((acc, m) => {
    const k = m.group_name ?? 'Match'
    ;(acc[k] = acc[k] ?? []).push(m)
    return acc
  }, {})

  // ── IDLE ─────────────────────────────────────────────────────────────────────
  if (stageIdx === -1) return (
    <div style={{
      background: 'linear-gradient(160deg, #070B1A 0%, #0C1328 45%, #080A18 100%)',
      minHeight: 'calc(100vh - 3.5rem)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '2.5rem 1rem 2rem', gap: '2rem',
    }}>
      <Tunnel size={160} />

      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontFamily: 'var(--font-bebas, Impact), sans-serif',
          fontSize: 'clamp(2.6rem, 8vw, 5rem)', letterSpacing: '0.04em', margin: 0, lineHeight: 0.9,
          background: 'linear-gradient(120deg, #FFD700 0%, #FF8C00 45%, #FF3A2D 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>QUINIELA 2026</h1>
        <p style={{
          fontFamily: 'var(--font-bebas, Impact), sans-serif',
          fontSize: 'clamp(0.8rem, 2.5vw, 1.1rem)', letterSpacing: '0.38em',
          color: 'rgba(255,255,255,0.32)', margin: '0.5rem 0 0',
        }}>WORLD CUP SIMULATOR · 8 STAGES · 10 PARTICIPANTS</p>
      </div>

      {/* Participant grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))',
        gap: '0.5rem', width: '100%', maxWidth: '900px',
      }}>
        {picks.map(p => (
          <div key={p.id} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '0.6rem 0.85rem',
          }}>
            <div style={{ fontFamily: 'var(--font-bebas, Impact)', color: '#FFD700', fontSize: '1.05rem', letterSpacing: '0.06em' }}>{p.name}</div>
            <div style={{ display: 'flex', gap: '0.28rem', margin: '0.2rem 0 0.18rem', flexWrap: 'wrap' }}>
              {[p.team1, p.team2, p.team3, p.team4].map((t, i) => {
                const tm = TEAM_MAP.get(t)
                return tm ? <span key={i} title={t} style={{ fontSize: '1.2rem', lineHeight: 1 }}>{tm.flag}</span> : null
              })}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.24)', fontSize: '0.66rem' }}>{p.total_cost} / 230 pts</div>
          </div>
        ))}
      </div>

      <button onClick={handleClick} style={{
        fontFamily: 'var(--font-bebas, Impact), sans-serif',
        fontSize: '1.75rem', letterSpacing: '0.1em',
        background: 'linear-gradient(135deg, #FFD700, #FF8C00)',
        color: '#070B1A', border: 'none', borderRadius: 14,
        padding: '1rem 3.5rem', cursor: 'pointer',
        boxShadow: '0 0 50px rgba(255,200,0,0.28), 0 6px 28px rgba(0,0,0,0.55)',
      }}>▶ KICK OFF THE WORLD CUP</button>
    </div>
  )

  // ── CHAMPION OVERLAY ──────────────────────────────────────────────────────────
  const champFlag = champion ? (TEAM_MAP.get(champion)?.flag ?? '🏆') : ''

  // ── ACTIVE ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#070B1A', minHeight: 'calc(100vh - 3.5rem)' }}>

      {/* Champion overlay */}
      {champion && stageIdx === 7 && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(7,11,26,0.96)', backdropFilter: 'blur(14px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '1.25rem', padding: '2rem', textAlign: 'center',
        }}>
          <Tunnel size={160} />
          <div style={{ fontSize: '3.5rem', lineHeight: 1 }}>{champFlag}</div>
          <div>
            <div style={{
              fontFamily: 'var(--font-bebas, Impact)',
              fontSize: 'clamp(2.4rem, 9vw, 5.5rem)', lineHeight: 0.85, letterSpacing: '0.04em',
              background: 'linear-gradient(120deg, #FFD700, #FF8C00)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>{champion.toUpperCase()}</div>
            <div style={{
              fontFamily: 'var(--font-bebas, Impact)',
              fontSize: 'clamp(0.85rem, 2.5vw, 1.25rem)', letterSpacing: '0.32em', color: '#FFD700',
              marginTop: '0.3rem',
            }}>2026 WORLD CUP CHAMPION</div>
          </div>

          {ranked[0] && (
            <div style={{
              background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.18)',
              borderRadius: 12, padding: '0.8rem 1.6rem', width: '100%', maxWidth: '340px',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.62rem', letterSpacing: '0.22em', marginBottom: '0.55rem' }}>QUINIELA PODIUM</div>
              {ranked.slice(0, 3).map((r, i) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.22rem 0' }}>
                  <span style={{ fontFamily: 'var(--font-bebas, Impact)', color: i === 0 ? '#FFD700' : 'rgba(255,255,255,0.52)', fontSize: '1.05rem' }}>
                    {['🥇', '🥈', '🥉'][i]} {r.name}
                  </span>
                  <span style={{ fontFamily: 'var(--font-bebas, Impact)', color: i === 0 ? '#FFD700' : 'rgba(255,255,255,0.38)', fontSize: '1.05rem' }}>
                    {r.pts.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleClick} style={{
            fontFamily: 'var(--font-bebas, Impact)', fontSize: '1.15rem', letterSpacing: '0.16em',
            background: 'transparent', border: '2px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.58)', borderRadius: 10,
            padding: '0.55rem 2rem', cursor: 'pointer', marginTop: '0.25rem',
          }}>PLAY AGAIN ↺</button>
        </div>
      )}

      {/* Sticky stage header */}
      <div style={{
        position: 'sticky', top: '3.5rem', zIndex: 30,
        background: 'rgba(7,11,26,0.94)', backdropFilter: 'blur(18px)',
        borderBottom: `2px solid ${accent}`,
      }}>
        <div style={{
          maxWidth: '72rem', margin: '0 auto', padding: '0.6rem 1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
        }}>
          <div style={{
            fontFamily: 'var(--font-bebas, Impact)',
            fontSize: 'clamp(1rem, 3vw, 1.4rem)', letterSpacing: '0.12em', color: accent,
          }}>{stage?.label}</div>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            {STAGES.map((s, i) => (
              <div key={i} style={{
                borderRadius: '50%',
                width: i === stageIdx ? 10 : 6, height: i === stageIdx ? 10 : 6,
                background: i <= stageIdx ? s.color : 'rgba(255,255,255,0.14)',
                transition: 'all 0.3s ease',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '1rem' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">

          {/* ── Left: results ──────────────────────────────────────────────── */}
          <div>
            {/* Group standings — shown after Round 3 through R32 */}
            {standings && stageIdx >= 2 && stageIdx <= 4 && (
              <div style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12, padding: '0.9rem', marginBottom: '1rem',
              }}>
                <div style={{ fontFamily: 'var(--font-bebas, Impact)', fontSize: '0.9rem', letterSpacing: '0.22em', color: accent, marginBottom: '0.6rem' }}>
                  GROUP STANDINGS
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                  {Object.entries(standings).map(([g, table]) => (
                    <div key={g} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 7, padding: '0.42rem 0.55rem' }}>
                      <div style={{ color: accent, fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.14em', marginBottom: '0.22rem' }}>GROUP {g}</div>
                      {table.map((row, i) => (
                        <div key={row.team} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5px 0' }}>
                          <span style={{ fontSize: '0.63rem', color: i < 2 ? '#00D48A' : 'rgba(255,255,255,0.28)' }}>
                            {i < 2 ? '↑' : '·'}{' '}{row.team.length > 11 ? row.team.slice(0, 11) + '…' : row.team}
                          </span>
                          <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{row.pts}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.5rem' }}>
              <div style={{ width: 3, height: '1.1rem', background: accent, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-bebas, Impact)', fontSize: '0.85rem', letterSpacing: '0.22em', color: 'rgba(255,255,255,0.38)' }}>
                {lastResults.length} MATCHES
              </span>
            </div>

            {isGroup ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {Object.entries(byGroup).sort().map(([g, gms]) => (
                  <div key={g}>
                    <div style={{ fontFamily: 'var(--font-bebas, Impact)', fontSize: '0.72rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.28)', marginBottom: '0.28rem' }}>{g}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.26rem' }}>
                      {gms.map(m => <MatchCard key={m.id} m={m} accent={accent} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
                {lastResults.map(m => <MatchCard key={m.id} m={m} accent={accent} showAdv />)}
              </div>
            )}
          </div>

          {/* ── Right: ranking ─────────────────────────────────────────────── */}
          <div className="lg:sticky lg:top-28">
            <div style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{
                padding: '0.62rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.07)',
                fontFamily: 'var(--font-bebas, Impact)', fontSize: '0.9rem', letterSpacing: '0.24em', color: accent,
              }}>RANKING</div>
              <div>
                {ranked.map((p, i) => {
                  const prev = prevRanks[p.name]
                  const moved = prev !== undefined ? prev - p.rank : 0
                  const top = i === 0
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.42rem',
                      padding: '0.48rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: top ? `${accent}10` : 'transparent',
                    }}>
                      <span style={{ fontFamily: 'var(--font-bebas, Impact)', fontSize: '0.9rem', color: top ? accent : 'rgba(255,255,255,0.26)', width: '1rem', textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ width: '1.3rem', textAlign: 'center', flexShrink: 0 }}>
                        {moved > 0
                          ? <span style={{ color: '#00D48A', fontSize: '0.56rem' }}>▲{moved}</span>
                          : moved < 0
                          ? <span style={{ color: '#FF3A2D', fontSize: '0.56rem' }}>▼{Math.abs(moved)}</span>
                          : <span style={{ color: 'rgba(255,255,255,0.16)', fontSize: '0.56rem' }}>—</span>}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: top ? 700 : 400, color: top ? '#fff' : 'rgba(255,255,255,0.74)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ display: 'flex', gap: '0.15rem', marginTop: '0.1rem' }}>
                          {[p.team1, p.team2, p.team3, p.team4].map((t, j) => {
                            const tm = TEAM_MAP.get(t)
                            return tm ? <span key={j} title={t} style={{ fontSize: '0.78rem', lineHeight: 1 }}>{tm.flag}</span> : null
                          })}
                        </div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-bebas, Impact)', fontSize: '1rem', color: top ? accent : '#fff', minWidth: '3rem', textAlign: 'right', flexShrink: 0 }}>
                        {p.pts.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Next stage CTA */}
        {stageIdx < 7 && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0 1.5rem' }}>
            <button onClick={handleClick} style={{
              fontFamily: 'var(--font-bebas, Impact), sans-serif',
              fontSize: '1.6rem', letterSpacing: '0.11em',
              background: `linear-gradient(135deg, ${accent}, ${accent}BB)`,
              color: ctaDark ? '#070B1A' : '#fff',
              border: 'none', borderRadius: 14, padding: '0.9rem 3rem', cursor: 'pointer',
              boxShadow: `0 0 40px ${accent}28, 0 4px 22px rgba(0,0,0,0.55)`,
            }}>{stage?.cta}</button>
          </div>
        )}
      </div>
    </div>
  )
}
