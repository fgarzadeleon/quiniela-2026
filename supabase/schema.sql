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
  scorer1        TEXT,
  scorer2        TEXT,
  scorer3        TEXT,
  total_cost     INTEGER NOT NULL CHECK (total_cost <= 230),
  total_points   FLOAT DEFAULT 0,
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

-- Public read on picks (so the ranking page works without auth)
ALTER TABLE picks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read picks"   ON picks   FOR SELECT USING (true);
CREATE POLICY "anyone can insert picks" ON picks   FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone can read matches" ON matches FOR SELECT USING (true);
-- Only service-role key can insert/update matches (via admin scripts)
