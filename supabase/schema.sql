-- Quiniela 2026 · Supabase schema
-- Run this in the Supabase SQL Editor after creating your project.

-- Participants' team selections
CREATE TABLE IF NOT EXISTS picks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT,
  team1          TEXT NOT NULL,
  team2          TEXT NOT NULL,
  team3          TEXT NOT NULL,
  team4          TEXT NOT NULL,
  team5          TEXT NOT NULL,
  scorer1        TEXT,
  scorer2        TEXT,
  scorer3        TEXT,
  total_cost     INTEGER NOT NULL CHECK (total_cost <= 300),
  total_points   FLOAT DEFAULT 0,
  password_hash  TEXT,
  wildcard_used  BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Match results (populated manually or via an update script)
CREATE TABLE IF NOT EXISTS matches (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id    INTEGER UNIQUE,
  home_team      TEXT NOT NULL,
  away_team      TEXT NOT NULL,
  home_score     INTEGER DEFAULT 0,
  away_score     INTEGER DEFAULT 0,
  status         TEXT DEFAULT 'SCHEDULED'
                   CHECK (status IN ('SCHEDULED','IN_PLAY','PAUSED','FINISHED','SUSPENDED','POSTPONED')),
  match_date     TIMESTAMPTZ NOT NULL,
  stage          TEXT NOT NULL
                   CHECK (stage IN ('GROUP_STAGE','ROUND_OF_32','ROUND_OF_16','QUARTER_FINALS','SEMI_FINALS','FINAL')),
  group_name     TEXT,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update updated_at on matches
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Wildcard columns on picks (added post-launch)
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_used_at       TIMESTAMPTZ;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_effective_from TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_old_team1     TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_old_team2     TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_old_team3     TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_old_team4     TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_old_team5     TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_old_scorer1   TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_old_scorer2   TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS wildcard_old_scorer3   TEXT;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS paid                   BOOLEAN DEFAULT false;
ALTER TABLE picks ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ;

-- Scorer goal snapshots (one row per scorer per stage boundary)
CREATE TABLE IF NOT EXISTS scorer_snapshots (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scorer_name    TEXT NOT NULL,
  goals          INTEGER NOT NULL DEFAULT 0,
  effective_stage TEXT NOT NULL,
  captured_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Daily/stage ranking snapshots for position_change tracking and BumpsChart
CREATE TABLE IF NOT EXISTS ranking_snapshots (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pick_id       UUID NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
  rank          INTEGER NOT NULL,
  total_points  FLOAT NOT NULL,
  snapshot_date DATE NOT NULL,
  label         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Host challenge predictions (one row per player)
CREATE TABLE IF NOT EXISTS host_predictions (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pick_id             UUID NOT NULL REFERENCES picks(id) ON DELETE CASCADE,
  dirtiest            TEXT,
  best                TEXT,
  worst               TEXT,
  most_goals_for      TEXT,
  most_goals_against  TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pick_id)
);

-- Host challenge answers (set after tournament, one row per question key)
CREATE TABLE IF NOT EXISTS host_answers (
  key        TEXT PRIMARY KEY,
  value      TEXT
);

-- Public read on picks (so the ranking page works without auth)
ALTER TABLE picks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read picks"   ON picks   FOR SELECT USING (true);
CREATE POLICY "anyone can insert picks" ON picks   FOR INSERT WITH CHECK (true);
-- Service-role key handles all updates (wildcard swaps, admin edits)
CREATE POLICY "service role can update picks" ON picks FOR UPDATE USING (true);
CREATE POLICY "anyone can read matches" ON matches FOR SELECT USING (true);
-- Only service-role key can insert/update matches (via admin scripts)
