@AGENTS.md

# Quiniela 2026 — Project Guide

World Cup 2026 pick-em game for a private friend group (~10 players). Live at **quinielalive.live** (hosted on Vercel, code on GitHub at `fgarzadeleon/quiniela-2026`).

## Handover — Current State (as of June 2026)

The tournament started on 2026-06-12. Picks are now locked (deadline passed). Key things a new Claude session needs to know:

- **Ranking reads from football-data.org directly** — not from a Supabase `matches` table. Points are computed on the fly by `src/app/api/ranking/route.ts` which fetches finished matches from the football-data.org API and passes them to `calculatePickPoints()`. The `matches` table in Supabase is only used by the admin simulation (for testing).
- **Flags use flagcdn.com** — `src/components/Flag.tsx` always fetches `w40/w80` images and uses CSS attributes to scale. Do not use arbitrary sizes like `w32` — those URLs 404.
- **Goalscorer autocomplete** lives in `src/components/PlayerSelect.tsx` — shared by `PickForm.tsx` and `my-picks/page.tsx`.
- **Wildcard** is available post-deadline — players keep ≥2 teams and swap the rest. Scoring splits by `wildcard_effective_from` stage so old teams score for earlier rounds.
- **Host challenge answers** are NULL until admin sets them in the `host_answers` table after the tournament ends.
- **Payments** tracking at `/admin/payments` — password-protected toggle per player.
- **Scorers page** at `/scorers` — quiniela scorer prize leaderboard + tournament golden boot from football-data.org.

## Stack

- **Next.js** (App Router, `force-dynamic` on all API routes)
- **Supabase** (Postgres, service role key for all server writes)
- **Tailwind CSS v4** (`@theme inline` in `globals.css` — not the v3 config file)
- **football-data.org API** for squad data, live scores, and golden boot (key in `.env.local`)

## Environment Variables (`.env.local` — never commit)

```
NEXT_PUBLIC_SUPABASE_URL=https://rizrofntveuxpwktqfhl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
FOOTBALL_DATA_API_KEY=59f9b26e489247708e7b68f9bd08f7e8
ADMIN_PASSWORD=quiniela2026
```

## Game Rules

- Pick **5 teams** from 48 World Cup participants
- **300pt budget** (team costs based on betting odds via log-scale formula)
- Max **1 Tier A** (elite) team
- Pick **3 goalscorers** from your selected teams (required, not optional)
- No two players can have the same combination of 5 teams
- **Deadline: 2026-06-11T19:00:00Z** (20:00 BST) — hardcoded in multiple files, search for `DEADLINE` to find all occurrences
- Before deadline: unlimited free edits to all 5 picks + scorers
- After deadline: picks locked, one **Wildcard** per player (keep ≥2, swap the rest). Scorers editable with wildcard.

## Scoring (per team, per match)

| Event | Tier A | Tier B | Tier C | Tier D |
|---|---|---|---|---|
| Win | +70 | +85 | +100 | +120 |
| Draw | +10 | +30 | +40 | +60 |
| Loss | −60 | −45 | −30 | −10 |
| Goal scored | +10 | +10 | +10 | +10 |
| Goal conceded | −5 | −5 | −5 | −5 |
| Round advanced | +120 | +150 | +200 | +250 |
| Champion | +500 | +500 | +500 | +500 |

Implemented in `src/lib/scoring.ts` → `calculatePickPoints(pick, matches)`.

## Hosts Challenge (bonus points)

Players can answer 5 questions about USA/Mexico/Canada at `/hosts`. Each correct answer = **100pts** added to ranking total (max 500).

Questions: dirtiest (most cards), best (goes furthest), worst (eliminated earliest), most goals scored, most goals conceded.

Answers stored in `host_answers` table. Set them when results are known:

```sql
UPDATE host_answers SET value = 'Mexico' WHERE key = 'dirtiest';
UPDATE host_answers SET value = 'USA'    WHERE key = 'best';
UPDATE host_answers SET value = 'Canada' WHERE key = 'worst';
UPDATE host_answers SET value = 'Mexico' WHERE key = 'most_goals_for';
UPDATE host_answers SET value = 'Canada' WHERE key = 'most_goals_against';
```

## Database Tables

### `picks`
Main player entries. Key columns:
- `name` — player display name
- `password_hash` — stores plain text password (no hashing — small friend group, admin needs to recover)
- `team1`–`team5` — selected teams
- `scorer1`–`scorer3` — goalscorer picks
- `total_cost` — sum of team costs
- `total_points` — legacy column, not used for ranking (ranking computes live)
- `wildcard_used` — boolean, flipped to true when wildcard is played
- `wildcard_used_at` — timestamp when wildcard was played
- `wildcard_effective_from` — stage name (`ROUND_OF_32`, `ROUND_OF_16`, etc.) from which new teams score
- `wildcard_old_team1`–`wildcard_old_team5` — snapshot of previous teams before wildcard swap
- `paid` — boolean, whether entry fee has been paid (managed via `/admin/payments`)
- `email` — legacy column, no longer collected

### `host_predictions`
One row per player (linked by `pick_id`). Columns: `dirtiest`, `best`, `worst`, `most_goals_for`, `most_goals_against` — each is `'USA'`, `'Mexico'`, or `'Canada'`.

### `host_answers`
5 rows, one per question key. `value` is NULL until the admin sets it after the tournament.

### `matches`
Used only by the admin simulation feature for testing. The **real ranking does not use this table** — it fetches finished matches from football-data.org directly.

## Ranking — How Points Are Calculated

`GET /api/ranking` does three things in parallel:
1. Fetches all picks from Supabase
2. Fetches finished matches from `football-data.org/v4/competitions/WC/matches?status=FINISHED` (cached 60s)
3. Fetches `host_predictions` and `host_answers` from Supabase

Points = `calculatePickPoints(pick, finishedMatches)` + host bonus (100pts per correct hosts answer).

Team picks and scorers are stripped from the response until `tournamentStarted` (i.e. `new Date() >= DEADLINE`).

## Admin Panel (`/admin`)

Password: `ADMIN_PASSWORD` env var (default `quiniela2026`).

### Simulation actions (testing only — do not affect real ranking)

| Action | What it does |
|---|---|
| `init` | Creates all 96 group stage fixtures in the `matches` DB table |
| `round1/2/3` | Simulates group stage rounds with random scores |
| `r32/r16/qf/sf/final` | Simulates knockout rounds, auto-generates fixtures from winners |
| `reset` | Wipes all matches from the `matches` table |
| `full` | Runs entire tournament simulation end-to-end |

### Real score sync (`/admin` → "Sync Real Scores" button)

Calls `POST /api/admin/sync-scores` — fetches all finished matches from football-data.org and upserts them into the `matches` table. This is optional because the real ranking doesn't use the `matches` table, but it can be useful for debugging or if you ever want to switch back.

## Common Admin SQL Operations

**Reset a player's password:**
```sql
UPDATE picks SET password_hash = 'newpassword' WHERE name = 'Jorge Garza';
```

**Look up a player's password:**
```sql
SELECT name, password_hash FROM picks WHERE name = 'Jorge Garza';
```

**Check all picks:**
```sql
SELECT name, team1, team2, team3, team4, team5, total_cost, wildcard_used FROM picks ORDER BY created_at;
```

**Delete a test entry:**
```sql
DELETE FROM picks WHERE name ILIKE 'test%';
```

**Find players who haven't answered the hosts questions:**
```sql
SELECT p.name FROM picks p
LEFT JOIN host_predictions hp ON hp.pick_id = p.id
WHERE hp.pick_id IS NULL AND p.name NOT ILIKE 'test%';
```

**Manually set host challenge answers** (see Hosts Challenge section above).

## Test Users

Any player whose name starts with `test` (case-insensitive) is:
- Hidden from the public ranking
- Excluded from the duplicate team combo check

Use `test1`, `testJorge`, etc. to test wildcards and other features without polluting the real ranking.

## Key Source Files

```
src/
  app/
    page.tsx                    — homepage (hero, rules, scoring table, team preview)
    picks/page.tsx              — pick submission page
    rules/page.tsx              — full rules page
    hosts/page.tsx              — hosts challenge minigame
    ranking/page.tsx            — live ranking with flag pills
    scorers/page.tsx            — scorer prize leaderboard + tournament golden boot
    my-picks/page.tsx           — login + edit picks + wildcard UI
    live/page.tsx               — client-side tournament simulator (demo only)
    admin/
      page.tsx                  — admin panel (simulation + sync buttons)
      payments/page.tsx         — paid/unpaid tracker per player
    api/
      picks/route.ts            — POST new pick, GET all picks
      my-picks/route.ts         — POST login, PATCH edit or wildcard
      ranking/route.ts          — GET ranking (fetches live from football-data.org)
      scores/route.ts           — GET live scores from football-data.org (display only)
      scorers/route.ts          — GET golden boot + quiniela scorer leaderboard
      host-predictions/route.ts — POST/GET hosts challenge answers
      players/route.ts          — GET squad lists from football-data.org
      admin/route.ts            — POST simulation actions, password-protected
      admin/sync-scores/route.ts — POST sync finished matches to `matches` table
      admin/payments/route.ts   — GET/PATCH payments status
      admin/matches/route.ts    — GET all matches from DB (used by admin panel display)
      simulate-live/route.ts    — SSE stream simulating a full tournament in ~5 min (demo)
  components/
    Navbar.tsx            — sticky nav with 8 links
    PickForm.tsx          — full pick submission form with PlayerSelect dropdown
    PlayerSelect.tsx      — goalscorer autocomplete (shared by PickForm and my-picks)
    Flag.tsx              — flag image (flagcdn.com/w40/{code}.png, CSS-scaled)
    CountdownTimer.tsx    — countdown to deadline
  lib/
    teams.ts              — TEAMS array, TEAM_MAP, costs, tiers, MAX_BUDGET=300, TEAMS_TO_PICK=5
    scoring.ts            — calculatePickPoints(), getCurrentRound(), ROUND_STARTS
    supabase.ts           — createServerClient()
    tournament.ts         — group stage match generation
    simulation.ts         — match simulation logic for demo
  types/index.ts          — Pick, Match, Team, Tier, MatchStage interfaces
```

## football-data.org API Notes

- **Rate limit:** 10 requests/minute on the free tier
- **`/api/ranking`** — fetches `WC/matches?status=FINISHED`. Response cached 60s via `next: { revalidate: 60 }`.
- **`/api/scores`** — fetches live match data for display on `/scores`. Revalidates every 30s. Does NOT write to DB.
- **`/api/scorers`** — fetches `WC/scorers?limit=50` for the golden boot. Revalidates every 60s.
- **`/api/players`** — fetches squad lists for the goalscorer picker. Only called when a player has selected all 5 teams.

### Team name mapping

Our names differ from football-data.org. Mapping used in `ranking/route.ts`, `admin/sync-scores/route.ts`, and `players/route.ts`:

| Our name | football-data.org name |
|---|---|
| USA | United States |
| South Korea | Korea Republic |
| Ivory Coast | Côte d'Ivoire |
| Bosnia and Herzegovina | Bosnia-Herzegovina |
| Czech Republic | Czechia |
| DR Congo | Congo DR |

If a player's squad is missing or wrong in the scorer picker, check this mapping first.

## Team Costs

Log-scale formula from betting odds: `cost = round5(-35.64 * log10(avg_decimal_odds) + 126.54)`, min 10.

Costs last updated from OddsChecker (27 bookmakers) on 07/06/2026. To update costs, edit `src/lib/teams.ts` — the `TEAMS` array has all 48 teams with `name`, `flag`, `code`, `cost`, and `tier`.

## Deployment

- Push to `main` branch on GitHub → Vercel auto-deploys
- Custom domain: `quinielalive.live` (GoDaddy DNS → Vercel A record `76.76.21.21`)
- Env vars set in Vercel dashboard (not in git)

## SQL Injection Safety

All DB access uses the Supabase JS client with parameterized queries (`.insert()`, `.eq()`, `.ilike()`). Values are never interpolated into raw SQL strings. Safe by default.

## Privacy

- Team picks and scorers are hidden in the ranking API until the tournament starts (server-side strip, not client-side)
- `password_hash` and `email` columns are stripped from all API responses before sending to the client
