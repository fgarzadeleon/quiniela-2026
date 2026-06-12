# Quiniela 2026

World Cup 2026 pick-em game for a private friend group (~10 players). Live at **quinielalive.live**.

## Stack

- **Next.js 15** (App Router, `force-dynamic` on all API routes)
- **Supabase** (Postgres, service role key for all server writes)
- **Tailwind CSS v4** (`@theme inline` in `globals.css` — not a v3 config file)
- **football-data.org** free tier API for squads and live scores

## Local Setup

### Prerequisites

- Node.js 20+
- A Supabase project (or ask for the existing credentials)
- A football-data.org API key (free at football-data.org)

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env.local`

Never commit this file — it's in `.gitignore`.

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
FOOTBALL_DATA_API_KEY=<your key>
ADMIN_PASSWORD=quiniela2026
```

### 3. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000.

### 4. Verify things work

| Check | How |
|---|---|
| Homepage loads | Visit http://localhost:3000 |
| Team picker works | `/picks` — budget counter, tier limit, goalscorer autocomplete |
| Ranking loads | `/ranking` — shows all players ordered by points |
| Live scores | `/scores` — calls football-data.org, shows real match data |
| Scorers page | `/scorers` — quiniela scorer prize + tournament golden boot |
| Hosts page | `/hosts` — 5-question minigame for USA/Mexico/Canada predictions |
| Admin panel | `/admin` — needs `ADMIN_PASSWORD` env var |
| Payments page | `/admin/payments` — same password, shows paid/unpaid status |

## Architecture Overview

```
User browser
    │
    ├── Next.js App Router (Vercel)
    │       ├── /api routes (server-side only)
    │       │       ├── /api/ranking      ← computes scores from football-data.org + Supabase picks
    │       │       ├── /api/scores       ← live match data (display only, no DB writes)
    │       │       ├── /api/players      ← squad lists for goalscorer picker
    │       │       ├── /api/scorers      ← tournament golden boot + quiniela scorer leaderboard
    │       │       ├── /api/picks        ← submit new picks
    │       │       ├── /api/my-picks     ← login, edit picks, wildcard
    │       │       ├── /api/host-predictions ← hosts minigame answers
    │       │       ├── /api/admin        ← tournament simulation (testing only)
    │       │       └── /api/admin/payments ← payments tracker
    │       └── Pages (RSC or 'use client')
    │
    ├── Supabase (Postgres)
    │       ├── picks             ← all player entries
    │       ├── host_predictions  ← hosts minigame answers per player
    │       └── host_answers      ← correct answers (set by admin after tournament)
    │
    └── football-data.org API
            ├── /competitions/WC/matches  ← finished scores for ranking + display
            ├── /competitions/WC/scorers  ← golden boot data
            └── /teams/{id}/             ← squad lists for goalscorer picker
```

### Key design decision: ranking fetches from football-data.org directly

Points are calculated on the fly from football-data.org finished matches — not from a Supabase `matches` table. This keeps the system simpler (no sync step needed) and always current. The ranking API caches the football-data.org response for 60 seconds via `next: { revalidate: 60 }` inside the `force-dynamic` route.

The `matches` table still exists in Supabase but is only used by the admin simulation feature for testing.

## Database Schema

### `picks`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `name` | text | player display name |
| `password_hash` | text | plain text password (small friend group, admin recovers) |
| `team1`–`team5` | text | selected team names |
| `scorer1`–`scorer3` | text | goalscorer picks |
| `total_cost` | int | sum of team costs, validated server-side |
| `total_points` | int | legacy column — actual points computed live in `/api/ranking` |
| `wildcard_used` | bool | flipped to true when wildcard is played |
| `wildcard_used_at` | timestamptz | when wildcard was played |
| `wildcard_effective_from` | text | stage from which new teams apply (`ROUND_OF_32`, etc.) |
| `wildcard_old_team1`–`wildcard_old_team5` | text | snapshot of teams before wildcard swap |
| `email` | text | legacy column, no longer collected |
| `paid` | bool | whether the entry fee has been paid |
| `created_at` | timestamptz | submission time |

### `host_predictions`

One row per player. Linked to `picks` via `pick_id`.

Columns: `pick_id`, `dirtiest`, `best`, `worst`, `most_goals_for`, `most_goals_against` — each is `'USA'`, `'Mexico'`, or `'Canada'`.

### `host_answers`

5 rows, one per question key. `value` is NULL until admin sets it after the tournament ends.

```sql
UPDATE host_answers SET value = 'Mexico' WHERE key = 'dirtiest';
UPDATE host_answers SET value = 'USA'    WHERE key = 'best';
UPDATE host_answers SET value = 'Canada' WHERE key = 'worst';
UPDATE host_answers SET value = 'Mexico' WHERE key = 'most_goals_for';
UPDATE host_answers SET value = 'Canada' WHERE key = 'most_goals_against';
```

## Game Rules

- Pick **5 teams** from 48 World Cup participants
- **300pt budget** — team costs derived from betting odds (log-scale formula)
- Max **1 Tier A** (elite) team
- Pick **3 goalscorers** from your selected teams
- No two players can have the same combination of 5 teams
- **Deadline: 2026-06-11T19:00:00Z** — hardcoded in multiple places (search for `DEADLINE` to find them all)
- Before deadline: unlimited free edits to picks and scorers
- After deadline: picks locked, one **Wildcard** per player (keep ≥2 teams, swap the rest)

## Scoring

Points are calculated in `src/lib/scoring.ts` via `calculatePickPoints(pick, matches)`.

### Per-team, per-match points

| Event | Tier A | Tier B | Tier C | Tier D |
|---|---|---|---|---|
| Win | +70 | +85 | +100 | +120 |
| Draw | +10 | +30 | +40 | +60 |
| Loss | −60 | −45 | −30 | −10 |
| Goal scored | +10 | +10 | +10 | +10 |
| Goal conceded | −5 | −5 | −5 | −5 |
| Advancing a round | +120 | +150 | +200 | +250 |
| Champion | +500 | +500 | +500 | +500 |

### Hosts Challenge bonus

5 questions about USA, Mexico, Canada. Each correct answer = **100 pts** added to ranking total (max 500). Answers stored in `host_answers` table — all NULL until admin fills them in post-tournament.

### Wildcard scoring split

When a wildcard is played, the scoring uses old teams for rounds before `wildcard_effective_from` and new teams for rounds at or after it. This prevents retroactive point manipulation.

## Team Tiers and Costs

Costs are calculated from OddsChecker odds (27 bookmakers) using:
```
cost = round5(-35.64 * log10(avg_decimal_odds) + 126.54)   # min 10
```

- **Tier A** (85–100 pts): France, Spain, England, Brazil, Argentina, Portugal, Germany
- **Tier B** (55–80 pts): Netherlands, Norway, Belgium, Colombia, Japan, Morocco, USA, Mexico, Uruguay, Switzerland, Croatia, Turkey, Ecuador, Senegal, Sweden
- **Tier C** (30–50 pts): Austria, Canada, Paraguay, Scotland, Ivory Coast, Czech Republic, and others
- **Tier D** (10–25 pts): remaining participants

To update costs, edit the `TEAMS` array in `src/lib/teams.ts`.

## Key Source Files

```
src/
  app/
    page.tsx                       — homepage
    picks/page.tsx                 — pick submission
    ranking/page.tsx               — live ranking with flag pills
    my-picks/page.tsx              — login + edit + wildcard UI
    hosts/page.tsx                 — hosts minigame (5 questions)
    scorers/page.tsx               — scorer prize + golden boot
    admin/
      page.tsx                     — admin panel (simulation + sync)
      payments/page.tsx            — paid/unpaid tracker
    api/
      picks/route.ts               — POST submit pick, GET all picks
      my-picks/route.ts            — POST login, PATCH edit/wildcard
      ranking/route.ts             — GET ranking (fetches scores from football-data.org live)
      scores/route.ts              — GET live match data (display only)
      scorers/route.ts             — GET golden boot + quiniela scorer leaderboard
      players/route.ts             — GET squad lists from football-data.org
      host-predictions/route.ts    — GET/POST hosts minigame answers
      admin/route.ts               — POST simulation actions (testing)
      admin/sync-scores/route.ts   — POST sync finished matches to DB (optional)
      admin/payments/route.ts      — GET/PATCH payments status
  components/
    Navbar.tsx                     — sticky nav
    PickForm.tsx                   — pick submission form
    PlayerSelect.tsx               — goalscorer autocomplete (shared component)
    Flag.tsx                       — flag image from flagcdn.com/w40/{code}.png
    CountdownTimer.tsx             — countdown to deadline
  lib/
    teams.ts                       — TEAMS array, TEAM_MAP, costs, tiers, scoring table
    scoring.ts                     — calculatePickPoints()
    supabase.ts                    — createServerClient()
    tournament.ts                  — group stage fixture generation
    simulation.ts                  — random match simulation for testing
  types/index.ts                   — Pick, Match, Team, Tier, MatchStage interfaces
```

## football-data.org API

- **Rate limit:** 10 requests/minute (free tier)
- Competition code: `WC`
- Header: `X-Auth-Token: <FOOTBALL_DATA_API_KEY>`
- Ranking route caches responses for 60s: `next: { revalidate: 60 }`

### Team name mapping

football-data.org uses different names from ours. The mapping lives in both `src/app/api/ranking/route.ts` and `src/app/api/admin/sync-scores/route.ts`:

| Our name | football-data.org |
|---|---|
| USA | United States |
| South Korea | Korea Republic |
| Ivory Coast | Côte d'Ivoire |
| Bosnia and Herzegovina | Bosnia-Herzegovina |
| Czech Republic | Czechia |
| DR Congo | Congo DR |

If a team's squad is missing in the scorer picker, check `src/app/api/players/route.ts` for the same mapping.

## Common Admin SQL

```sql
-- Reset a player's password
UPDATE picks SET password_hash = 'newpass' WHERE name = 'Player Name';

-- Find players who haven't answered the hosts questions
SELECT p.name FROM picks p
LEFT JOIN host_predictions hp ON hp.pick_id = p.id
WHERE hp.pick_id IS NULL AND p.name NOT ILIKE 'test%';

-- Check current picks
SELECT name, team1, team2, team3, team4, team5, total_cost, wildcard_used
FROM picks ORDER BY created_at;

-- Delete a test entry
DELETE FROM picks WHERE name ILIKE 'test%';

-- Set hosts challenge answers after tournament
UPDATE host_answers SET value = 'Mexico' WHERE key = 'dirtiest';
```

## Test Users

Any player whose name starts with `test` (case-insensitive) is:
- Hidden from the public ranking
- Excluded from the duplicate team combo check

Use names like `test1` or `testJorge` to test wildcards and other features without affecting the real ranking.

## Deployment

- Push to `main` branch → Vercel auto-deploys
- Custom domain: `quinielalive.live` (GoDaddy DNS → Vercel A record `76.76.21.21`)
- Env vars are set in the Vercel dashboard — never in git

## Security Notes

- All DB access uses the Supabase JS client with parameterized queries — safe from SQL injection
- `password_hash` and `email` columns are stripped from all API responses before sending to clients
- Team picks and scorers are hidden in the ranking API until the tournament starts (server-side, not client-side)
- `.env.local` is gitignored and must never be committed
