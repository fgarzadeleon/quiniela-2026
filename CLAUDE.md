@AGENTS.md

# Quiniela 2026 — Project Guide

World Cup 2026 pick-em game for 30 players. Live at **quinielalive.live** (Vercel, GitHub: `fgarzadeleon/quiniela-2026`).

## Current State (as of late June 2026)

Tournament is in the **Round of 32** (knockout stage). Group stage is fully complete. Key facts:

- **29 paying players** × $500 MXN = $14,500 MXN pot (£609). Prizes: 1st $6k / 2nd $3k / 3rd $2k / 4th $1k / Scorers $2.5k.
- **2 wildcards used so far**: Hoolie (GROUP_STAGE_MD2) and JL (GROUP_STAGE_MD2). Both valid.
- Frech also wildcarded (GROUP_STAGE_MD3). Valid.
- **Scorer snapshots** taken at GROUP_STAGE_MD2 and GROUP_STAGE_MD3 — needed for scorer leaderboard wildcard splits.
- **FD has a paid live subscription** — it is the primary source for all match data (live, finished, upcoming). FDIO is fallback only.

## Stack

- **Next.js** (App Router, `force-dynamic` on all API routes)
- **Supabase** (Postgres, service role key for all server writes)
- **Tailwind CSS v4** (`@theme inline` in `globals.css` — not the v3 config file)
- **football-data.org API** — primary source for all match data (live subscription). Key: `FOOTBALL_DATA_API_KEY`
- **footballdata.io API** — fallback only if FD is down. Key: `FDIO_API_KEY`

## Environment Variables (`.env.local` — never commit)

```
NEXT_PUBLIC_SUPABASE_URL=https://rizrofntveuxpwktqfhl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
FOOTBALL_DATA_API_KEY=59f9b26e489247708e7b68f9bd08f7e8
FDIO_API_KEY=fd_7d485cebce87558df108c94d56c3937fa405f02f7a7ce1aa
ADMIN_PASSWORD=quiniela2026
```

## Game Rules (v1.2)

- Pick **5 teams** from 48 WC participants, **300pt budget**, max **1 Tier A** team
- Pick **3 goalscorers** from your selected teams
- No two players can share the same 5-team combo (including wildcarded-away lineups)
- **Deadline: 2026-06-11T19:00:00Z** — hardcoded in multiple files, search `DEADLINE` to find all
- One **Wildcard** per player post-deadline: keep ≥2 teams, swap the rest. Scorers do NOT auto-change — must be updated manually when wildcarding.

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

**Knockout scoring rules:**
- Extra time counts as part of the match (W/L if decided in ET using `score.extraTime`)
- Penalties = Draw result for both teams. Winner on pens gets the **Round Advanced** bonus.
- Round Advanced triggers from R16 onwards (not R32). Teams earn it per round they play in from R16 to Final.

Implemented in `src/lib/scoring.ts` → `calculatePickPoints(pick, matches)`.

## Key Architectural Decisions

- **Ranking computes live** from FD matches — not from a `matches` DB table. The `matches` table is only for admin simulation.
- **Group qualification** is computed from standings via `computeGroupQualifiers()` in `scoring.ts`. Awards bonus when:
  - 6pts from 2+ games (mathematically confirmed top-2 early)
  - Group complete: top 2 get it
  - Best 8 third-place: awarded progressively as groups complete (`8 - remaining_groups` guaranteed spots)
- **Wildcard splits**: `wildcard_effective_from` stage + `MD_SPLIT_DATES` determines which matches score for old vs new teams
- **Scorer splits**: Uses `scorer_snapshots` table (cumulative goals at each stage boundary) to split goals before/after wildcard
- **Team name mapping**: Our names ≠ FD names. Mapping in `FD_TO_OURS` constant in each route file. Key ones: `United States→USA`, `Korea Republic→South Korea`, `Côte d'Ivoire→Ivory Coast`, `Czechia→Czech Republic`, `Congo DR→DR Congo`, `Bosnia-Herzegovina→Bosnia and Herzegovina`

## Wildcard Stages & Deadlines

```
GROUP_STAGE_MD2  — deadline 2026-06-18T16:00:00Z
GROUP_STAGE_MD3  — deadline 2026-06-24T19:00:00Z
ROUND_OF_32      — deadline 2026-06-28T19:00:00Z
ROUND_OF_16      — deadline 2026-07-04T17:00:00Z
QUARTER_FINALS   — deadline 2026-07-09T20:00:00Z
SEMI_FINALS      — deadline 2026-07-14T19:00:00Z
FINAL            — deadline 2026-07-19T19:00:00Z
```

Defined in `src/lib/scoring.ts` → `WILDCARD_DEADLINES`.

## Database Tables

### `picks`
- `team1`–`team5` — current teams
- `scorer1`–`scorer3` — current scorers
- `wildcard_used`, `wildcard_used_at`, `wildcard_effective_from`
- `wildcard_old_team1`–`wildcard_old_team5` — teams before wildcard
- `wildcard_old_scorer1`–`wildcard_old_scorer3` — scorers before wildcard
- `paid`, `password_hash` (plain text — small group, admin needs recovery)

### `scorer_snapshots`
- `scorer_name`, `goals`, `effective_stage`, `captured_at`
- Snapshots of cumulative FD goals at each stage boundary
- Used by `/api/scorers` to split goals before/after wildcard
- **Take a new snapshot at each wildcard deadline** via `POST /api/admin/snapshot-scorers { password, stage }`
- Already taken: `GROUP_STAGE_MD2`, `GROUP_STAGE_MD3`
- Still needed: `ROUND_OF_32`, `ROUND_OF_16`, `QUARTER_FINALS`, `SEMI_FINALS`, `FINAL`

### `ranking_snapshots`
- `pick_id`, `rank`, `total_points`, `snapshot_date`, `label`
- Daily/stage snapshots for position_change tracking and BumpsChart
- Take stage snapshots via `POST /api/admin/snapshot-ranking { password, label }`

### `host_predictions` / `host_answers`
- 5 questions about USA/Mexico/Canada hosts. Each correct = 100pts.
- Answers in `host_answers` table — set after tournament ends (currently NULL).

### `matches`
- Admin simulation only. Real ranking ignores this table.

## API Routes

```
/api/ranking              — live ranking with points, team_points, wildcard info
/api/ranking/breakdown    — points earned per period (MD1/MD2/MD3/R32/R16...) per player
/api/ranking/history      — stage snapshots for BumpsChart
/api/scores               — live/upcoming/finished matches (FD primary, FDIO fallback)
/api/scorers              — scorer leaderboard with wildcard splits + golden boot
/api/team-form            — W/D/L dots + qualified rings per team (fetches matches + standings)
/api/heat-index           — upcoming match importance scores (affected players, pts at stake)
/api/heat-index           — uses FD standings + picks for 48h upcoming matches
/api/admin/snapshot-ranking   — POST { password, label? } — take ranking snapshot
/api/admin/snapshot-scorers   — POST { password, stage } — take scorer goals snapshot
```

## Ranking Page Tabs

1. **🏆 Ranking** — main leaderboard with team pills (W/D/L dots, gold rings for advancement), live filter
2. **🌍 By Country** — all picked teams (incl. wildcard old teams) with their quiniela points
3. **📅 By Matchday** — F1-style BumpsChart + sortable heatmap table (click column to sort)
4. **📊 Fun Stats** — most goals, most wins, etc.

## Scoring Page

- Shows upcoming matches with **Heat Index** (importance score 0–100 based on affected players + pts at stake + round bonus)
- Player names tagged by team for each upcoming match
- Finished matches grouped by date, most recent first
- Each match card shows points earned per team (tier-based)

## Privacy Rules

- Wildcard pending: hide new teams + strip all wildcard fields from API response. Show old lineup silently.
- `password_hash`, `email` stripped from all responses
- Team picks hidden until `tournamentStarted` (deadline passed)

## Flags

`src/components/Flag.tsx` — uses `flagcdn.com/w40/{code}.png`. Only use `w40` or `w80` — other sizes 404.

## Scorer Lookup Fuzzy Matching

`lookupScorer()` / `lookupGoals()` in ranking and scorers routes:
- Exact normalized name first
- Last-name match if >3 chars
- Substring match if >4 chars
- Returns **highest goal count** across all matches (prevents single-name picks like "Salah" returning 0 from a 0-goal entry)

## Hosts Challenge

`/hosts` — 5 questions about USA/Mexico/Canada. 100pts per correct answer. Answers stored in `host_answers`. Set via SQL when tournament ends.

## Admin

Password: `ADMIN_PASSWORD` env var. `/admin` has simulation actions (test only) and sync button. `/admin/payments` tracks paid status.

## Rules Page

`/rules` — versioned with changelog (v1.0 → v1.1 → v1.2). Update `CHANGELOG` array at top of file when rules change. Current version: **v1.2**.

## Key Files

```
src/lib/
  scoring.ts        — calculatePickPoints(), computeGroupQualifiers(), WILDCARD_DEADLINES, ROUND_STARTS
  teams.ts          — TEAMS array, TEAM_MAP, SCORING by tier, STAGE_ORDER
  squad-validation.ts — fetchSquadMap(), matchesPlayer(), isValidScorer()
  supabase.ts       — createServerClient()

src/app/api/
  ranking/route.ts           — main ranking computation
  ranking/breakdown/route.ts — per-period points breakdown
  ranking/history/route.ts   — stage snapshots for BumpsChart
  scores/route.ts            — live scores (FD primary)
  scorers/route.ts           — scorer leaderboard with snapshot-based wildcard splits
  team-form/route.ts         — W/D/L form + gold rings (fetches matches + standings from FD)
  heat-index/route.ts        — match importance scorer

src/components/
  BumpsChart.tsx    — F1-style position chart (SVG, hover to highlight)
  Flag.tsx          — flagcdn.com flag images
  WildcardDeadlinesTable.tsx

src/types/index.ts  — Pick, Match, Team, Tier, MatchStage interfaces
```

## Deployment

Push to `main` → Vercel auto-deploys. Domain: `quinielalive.live` (GoDaddy → Vercel A `76.76.21.21`). Env vars in Vercel dashboard.

## Things to do at each knockout deadline

1. `POST /api/admin/snapshot-scorers { password: "quiniela2026", stage: "ROUND_OF_32" }` (etc.)
2. `POST /api/admin/snapshot-ranking { password: "quiniela2026", label: "R32" }` (etc.)
