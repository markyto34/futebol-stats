PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  source_match_id TEXT NOT NULL,
  competition TEXT NOT NULL,
  season TEXT NOT NULL,
  kickoff_utc TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_goals INTEGER,
  away_goals INTEGER,
  home_corners INTEGER,
  away_corners INTEGER,
  home_shots INTEGER,
  away_shots INTEGER,
  home_shots_on_target INTEGER,
  away_shots_on_target INTEGER,
  home_possession REAL,
  away_possession REAL,
  home_yellow_cards INTEGER,
  away_yellow_cards INTEGER,
  home_red_cards INTEGER,
  away_red_cards INTEGER,
  stats_updated_at TEXT,
  source_updated_at TEXT,
  UNIQUE(source, source_match_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_comp_season_date
  ON matches(competition, season, kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_matches_teams_date
  ON matches(home_team, away_team, kickoff_utc);

CREATE TABLE IF NOT EXISTS odds (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  source_match_id TEXT NOT NULL,
  bookmaker TEXT NOT NULL,
  market TEXT NOT NULL,
  selection TEXT NOT NULL,
  decimal_odds REAL NOT NULL CHECK(decimal_odds > 1),
  captured_at_utc TEXT NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('prematch', 'live', 'closing', 'opening')),
  FOREIGN KEY(source, source_match_id)
    REFERENCES matches(source, source_match_id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_odds_match_market_time
  ON odds(source, source_match_id, market, selection, captured_at_utc);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  started_at_utc TEXT NOT NULL,
  finished_at_utc TEXT,
  status TEXT NOT NULL CHECK(status IN ('running', 'success', 'partial', 'failed')),
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_inserted_or_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);
