/**
 * Server-Sent Events stream that simulates the full 2026 World Cup in ~5 minutes.
 * No Supabase required — all state is in-memory.
 * GET /api/simulate-live
 */

import { NextRequest } from 'next/server'
import { allGroupMatches } from '@/lib/tournament'
import { simulateMatch, buildStandings, advancing, makeKnockoutMatches } from '@/lib/simulation'
import { calculatePickPoints } from '@/lib/scoring'
import { TEAM_MAP } from '@/lib/teams'
import type { Match, Pick } from '@/types'

export const dynamic = 'force-dynamic'

// ── Timing (sums to ~300 s / 5 min) ──────────────────────────────────────────
const T = {
  groupMatch:  1800,   // 1.8s per group match  → 24 × 1.8 = 43.2 s per round
  afterRound:  8000,   // 8s pause + ranking between rounds
  afterGroups: 8000,   // 8s to show group standings
  r32Match:    3000,   // 3s per R32 match      → 16 × 3 = 48 s
  afterR32:   10000,
  r16Match:    4000,   // 4s per R16 match      →  8 × 4 = 32 s
  afterR16:    8000,
  qfMatch:     5000,   // 5s per QF             →  4 × 5 = 20 s
  afterQF:     6000,
  sfMatch:     7000,   // 7s per SF             →  2 × 7 = 14 s
  afterSF:     5000,
  finalBuildup:3000,   // drama before the final
  finalMatch:  3000,   // final itself
}
// Total ≈ 43.2×3 + 24 + 48+10 + 32+8 + 20+6 + 14+5 + 6 ≈ 302 s

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── Seed picks ────────────────────────────────────────────────────────────────
const SEED: { name: string; team1: string; team2: string; team3: string; team4: string }[] = [
  { name: 'Fede',    team1: 'Brazil',    team2: 'Colombia',       team3: 'Scotland',       team4: 'Tunisia' },
  { name: 'Arturo',  team1: 'France',    team2: 'Belgium',        team3: 'Egypt',          team4: 'Qatar' },
  { name: 'Rodrigo', team1: 'Scotland',  team2: 'Australia',      team3: 'Haiti',          team4: 'Curacao' },
  { name: 'Elena',   team1: 'Germany',   team2: 'Morocco',        team3: 'Czech Republic', team4: 'New Zealand' },
  { name: 'Mateo',   team1: 'Argentina', team2: 'Colombia',       team3: 'Ecuador',        team4: 'Panama' },
  { name: 'Sofía',   team1: 'England',   team2: 'Norway',         team3: 'Sweden',         team4: 'Czech Republic' },
  { name: 'Pablo',   team1: 'Japan',     team2: 'Senegal',        team3: 'Bosnia',         team4: 'Saudi Arabia' },
  { name: 'Carmen',  team1: 'Mexico',    team2: 'USA',            team3: 'Canada',         team4: 'Panama' },
  { name: 'Luisa',   team1: 'Spain',     team2: 'Croatia',        team3: 'South Korea',    team4: 'Iraq' },
  { name: 'Diego',   team1: 'Portugal',  team2: 'Uruguay',        team3: 'Ghana',          team4: 'Cape Verde' },
]

function makePicks(): Pick[] {
  return SEED.map((s, i) => ({
    id: String(i),
    created_at: new Date().toISOString(),
    email: undefined,
    total_points: 0,
    scorer1: undefined, scorer2: undefined, scorer3: undefined,
    ...s,
    total_cost: [s.team1, s.team2, s.team3, s.team4]
      .reduce((sum, t) => sum + (TEAM_MAP.get(t)?.cost ?? 0), 0),
  }))
}

// ── In-memory store ───────────────────────────────────────────────────────────
function makeStore() {
  const matches: Match[] = []
  let counter = 0

  function insert(rows: Omit<Match, 'id'>[]) {
    rows.forEach(r => matches.push({ ...r, id: String(counter++) }))
  }

  function finish(id: string, hs: number, as_: number) {
    const m = matches.find(m => m.id === id)
    if (m) { m.home_score = hs; m.away_score = as_; m.status = 'FINISHED' }
  }

  function scheduled(stage: string) {
    return matches.filter(m => m.stage === stage && m.status === 'SCHEDULED')
  }

  function finished() {
    return matches.filter(m => m.status === 'FINISHED')
  }

  return { insert, finish, scheduled, finished, matches }
}

export async function GET(req: NextRequest) {
  const enc = new TextEncoder()
  let closed = false
  req.signal.addEventListener('abort', () => { closed = true })

  const stream = new ReadableStream({
    async start(ctrl) {
      function send(event: string, data: unknown) {
        if (closed) return
        try {
          ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch { closed = true }
      }

      const store = makeStore()
      const picks = makePicks()

      // Ranking helper
      function ranking() {
        const fin = store.finished()
        return picks
          .map(p => ({ id: p.id, name: p.name, team1: p.team1, team2: p.team2, team3: p.team3, team4: p.team4, total_cost: p.total_cost, pts: calculatePickPoints(p, fin) }))
          .sort((a, b) => b.pts - a.pts)
          .map((p, i) => ({ ...p, rank: i + 1 }))
      }

      // ── Kick off ──
      send('init', { picks: picks.map(p => ({ name: p.name, team1: p.team1, team2: p.team2, team3: p.team3, team4: p.team4, total_cost: p.total_cost })) })
      await sleep(500)

      // ── Group stage ──
      store.insert(allGroupMatches())

      for (let round = 1; round <= 3; round++) {
        if (closed) return
        send('stage', { label: `GROUP STAGE · ROUND ${round}`, round })

        const base = new Date('2026-06-11T16:00:00Z').getTime()
        const ranges: Record<number, [number, number]> = {
          1: [base,                   base + 3 * 86400_000],
          2: [base + 4 * 86400_000,   base + 8 * 86400_000],
          3: [base + 9 * 86400_000,   base + 20 * 86400_000],
        }
        const [from, to] = ranges[round]
        const pending = store.scheduled('GROUP_STAGE')
          .filter(m => new Date(m.match_date).getTime() >= from && new Date(m.match_date).getTime() <= to)

        for (const m of pending) {
          if (closed) return
          await sleep(T.groupMatch)
          const r = simulateMatch(m.home_team, m.away_team)
          store.finish(m.id, r.home_score, r.away_score)
          send('match', { home_team: m.home_team, away_team: m.away_team, home_score: r.home_score, away_score: r.away_score, stage: 'GROUP_STAGE', group: m.group_name })
          send('ranking', ranking())
        }

        await sleep(T.afterRound)
        if (round === 3) {
          const fin = store.finished().filter(m => m.stage === 'GROUP_STAGE')
          send('standings', buildStandings(fin))
          await sleep(T.afterGroups)
        }
      }

      // ── Knockouts ──
      const koStages = [
        { key: 'ROUND_OF_32' as const,    label: 'ROUND OF 32',    matchDelay: T.r32Match, pause: T.afterR32 },
        { key: 'ROUND_OF_16' as const,    label: 'ROUND OF 16',    matchDelay: T.r16Match, pause: T.afterR16 },
        { key: 'QUARTER_FINALS' as const, label: 'QUARTERFINALS',  matchDelay: T.qfMatch,  pause: T.afterQF },
        { key: 'SEMI_FINALS' as const,    label: 'SEMIFINALS',     matchDelay: T.sfMatch,  pause: T.afterSF },
        { key: 'FINAL' as const,          label: 'THE FINAL',      matchDelay: T.finalMatch, pause: 0 },
      ]

      for (const stage of koStages) {
        if (closed) return
        send('stage', { label: stage.label, round: null })

        let teams: string[]
        if (stage.key === 'ROUND_OF_32') {
          const fin = store.finished().filter(m => m.stage === 'GROUP_STAGE')
          teams = advancing(buildStandings(fin))
        } else {
          const prev: Record<string, string> = {
            ROUND_OF_16: 'ROUND_OF_32', QUARTER_FINALS: 'ROUND_OF_16',
            SEMI_FINALS: 'QUARTER_FINALS', FINAL: 'SEMI_FINALS',
          }
          teams = store.finished()
            .filter(m => m.stage === prev[stage.key])
            .map(m => m.home_score > m.away_score ? m.home_team : m.away_team)
        }

        const newMatches = makeKnockoutMatches(teams, stage.key, new Date()) as Omit<Match, 'id'>[]
        store.insert(newMatches)

        if (stage.key === 'FINAL') await sleep(T.finalBuildup)

        const pending = store.scheduled(stage.key)
        for (const m of pending) {
          if (closed) return
          await sleep(stage.matchDelay)
          let { home_score: hs, away_score: as_ } = simulateMatch(m.home_team, m.away_team)
          if (hs === as_) { Math.random() > 0.5 ? hs++ : as_++ }
          store.finish(m.id, hs, as_)
          const winner = hs > as_ ? m.home_team : m.away_team
          send('match', { home_team: m.home_team, away_team: m.away_team, home_score: hs, away_score: as_, stage: stage.key, winner })
          send('ranking', ranking())
        }

        if (stage.pause > 0) await sleep(stage.pause)
      }

      // Champion
      const final = store.finished().find(m => m.stage === 'FINAL')!
      const champion = final.home_score > final.away_score ? final.home_team : final.away_team
      send('champion', { team: champion, flag: TEAM_MAP.get(champion)?.flag ?? '🏆' })
      send('done', {})
      ctrl.close()
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
