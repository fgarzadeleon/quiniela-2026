@AGENTS.md

# Quiniela 2026 — Project Guide

World Cup 2026 pick-em game for a private friend group (~10 players). Live at **quinielalive.live** (hosted on Vercel, code on GitHub at `fgarzadeleon/quiniela-2026`).

## Stack

- **Next.js** (App Router, `force-dynamic` on all API routes)
- **Supabase** (Postgres, service role key for all server writes)
- **Tailwind CSS v4** (`@theme inline` in `globals.css` — not the v3 config file)
- **football-data.org API** for squad data (key in `.env.local`)

## Environment Variables (`.env.local` — never commit)

```
NEXT_PUBLIC_SUPABASE_URL=https://rizrofntveuxpwktqfhl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
FOOTBALL_DATA_API_KEY=59f9b26e489247708e7b68f9bd08f7e8
ADMIN_PASSWORD=quiniela2026
```

## Game Rules

- Pick **5 teams** from 48 World Cup participants (new this year — was 4)
- **300pt budget** (team costs based on betting odds via log-scale formula)
- Max **1 Tier A** (elite) team
- Pick **3 goalscorers** from your selected teams (required, not optional)
- No two players can have the same combination of 5 teams
- **Deadline: June 11 2026 at 16:00 UTC** (`new Date('2026-06-11T16:00:00Z')`) — hardcoded in 4 places:
  - `src/app/api/picks/route.ts`
  - `src/app/api/my-picks/route.ts`
  - `src/app/api/ranking/route.ts`
  - `src/components/PickForm.tsx`
- Before deadline: unlimited free edits to all 5 picks + scorers
- After deadline: picks locked, one **Wildcard** per player (keep 2, swap 3 teams). Scorers editable with wildcard.

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

## Hosts Challenge (bonus points)

Players can answer 5 questions about USA/Mexico/Canada at `/hosts`. Each correct answer = **100pts** added to ranking total.

Questions: dirtiest (most cards), best (goes furthest), worst (eliminated first), most goals scored, most goals conceded.

Answers are stored in the `host_answers` table. Set them when results are known:

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
- `total_points` — calculated at query time by `calculatePickPoints()` + host bonus
- `wildcard_used` — boolean, flipped to true when wildcard is played
- `email` — legacy column, no longer collected

### `host_predictions`
One row per player (linked by `pick_id`). Columns: `dirtiest`, `best`, `worst`, `most_goals_for`, `most_goals_against` — each is `'USA'`, `'Mexico'`, or `'Canada'`.

### `host_answers`
5 rows, one per question key. `value` is NULL until the admin sets it after the tournament.

### `matches`
Populated by the football-data.org sync. Columns: `home_team`, `away_team`, `home_score`, `away_score`, `status`, `stage`, `group_name`.

## Running the Real Tournament (Scoring)

**Important:** The `/scores` page shows live match data fetched from football-data.org (display only). The **ranking scoring** reads from the `matches` Supabase table — these are two separate things. Real results do not automatically flow into the ranking.

To score real matches, update the `matches` table in Supabase as results come in:

```sql
-- After a real match finishes:
UPDATE matches
SET home_score = 2, away_score = 1, status = 'FINISHED'
WHERE home_team = 'Brazil' AND away_team = 'Mexico';
```

Or use the **Admin Panel** at `/admin` (password: `ADMIN_PASSWORD` env var, default `quiniela2026`):

| Action | What it does |
|---|---|
| `init` | Creates all 96 group stage matches in the DB (run once at start) |
| `round1/2/3` | Simulates group stage rounds with random scores |
| `r32/r16/qf/sf/final` | Simulates knockout rounds, auto-generates fixtures from winners |
| `reset` | Wipes all matches from the DB |
| `full` | Runs the entire tournament simulation end-to-end |

The simulation uses random scores — useful for testing, not for real scoring. For production, update match scores manually via SQL as results come in.

Knockout match dates hardcoded in `src/app/api/admin/route.ts`:
- R32: 2026-06-27, R16: 2026-07-03, QF: 2026-07-08, SF: 2026-07-13, Final: 2026-07-19

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

**Manually set host challenge answers** (see Hosts Challenge section above).

**Enter a real match result:**
```sql
UPDATE matches
SET home_score = 3, away_score = 1, status = 'FINISHED'
WHERE home_team = 'France' AND away_team = 'Argentina' AND stage = 'FINAL';
```

**Check current match table state:**
```sql
SELECT home_team, away_team, home_score, away_score, status, stage FROM matches ORDER BY match_date;
```

## Test Users

Any player whose name starts with `test` (case-insensitive) is:
- Hidden from the public ranking
- Excluded from the duplicate team combo check

Use `test1`, `testJorge`, etc. to test wildcards and other features without polluting the real ranking.

## Key Source Files

```
src/
  app/
    page.tsx              — homepage (hero, rules, scoring table, team preview)
    picks/page.tsx        — pick submission page
    rules/page.tsx        — full rules page
    hosts/page.tsx        — hosts challenge minigame
    ranking/page.tsx      — live ranking
    my-picks/page.tsx     — login + edit picks + wildcard UI
    live/page.tsx         — client-side tournament simulator (demo only)
    admin/page.tsx        — admin panel (password: ADMIN_PASSWORD env var)
    api/
      picks/route.ts      — POST new pick, GET all picks
      my-picks/route.ts   — POST login, PATCH edit or wildcard
      ranking/route.ts    — GET ranking with scoring + host bonus
      host-predictions/route.ts — POST/GET hosts challenge answers
      players/route.ts    — GET squad lists from football-data.org
      scores/route.ts     — GET live scores from football-data.org (display only, not used for ranking)
      admin/route.ts      — POST admin actions (init/simulate matches), password-protected
      admin/matches/route.ts — GET all matches from DB (used by admin panel)
      simulate-live/route.ts — SSE stream simulating a full tournament in ~5 min (demo/testing)
  components/
    Navbar.tsx            — sticky nav, 7 links
    PickForm.tsx          — full pick submission form with PlayerSelect dropdown
    CountdownTimer.tsx    — countdown to June 11
  lib/
    teams.ts              — TEAMS array, TEAM_MAP, costs, tiers, MAX_BUDGET=300, TEAMS_TO_PICK=5
    scoring.ts            — calculatePickPoints() function
    supabase.ts           — createServerClient()
    tournament.ts         — group stage match generation
    simulation.ts         — match simulation logic for demo
  types/index.ts          — Pick, Match, Team, Tier interfaces
```

## football-data.org API Notes

- **Rate limit:** 10 requests/minute on the free tier
- **`/api/scores`** — fetches live match data for display on the `/scores` page. Revalidates every 30s. Does NOT write to the DB.
- **`/api/players`** — fetches squad lists for the goalscorer picker. Only called when a player has selected all 5 teams.
- **Team name mapping** — our names differ from football-data.org names. Mapping in `src/app/api/players/route.ts`:

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

Log-scale formula from betting odds: `cost = round5(-36.2 * log10(decimal_odds) + 124.56)`

Costs last updated from OddsChecker on 02/06/2026. To update costs, edit `src/lib/teams.ts` — the `TEAMS` array has all 48 teams with `name`, `flag`, `cost`, and `tier`.

## Deployment

- Push to `main` branch on GitHub → Vercel auto-deploys
- Custom domain: `quinielalive.live` (GoDaddy DNS → Vercel A record `76.76.21.21`)
- Env vars set in Vercel dashboard (not in git)

## SQL Injection Safety

All DB access uses the Supabase JS client with parameterized queries (`.insert()`, `.eq()`, `.ilike()`). Values are never interpolated into raw SQL strings. Safe by default.

## Privacy

- Team picks and scorers are hidden in the ranking API until the tournament starts (server-side strip, not client-side)
- `password_hash` and `email` columns are stripped from all API responses before sending to the client
