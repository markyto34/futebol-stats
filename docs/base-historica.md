# Historical data foundation

This folder introduces a persistent history layer without changing the existing GitHub Pages interface.

## Files
- `data/schema.sql`: SQLite tables for fixtures/results, match statistics, odds snapshots and ingestion logs.
- `scripts/import_matches.py`: validates and upserts a normalized CSV into SQLite. It does not make network requests.

## Import
Run from the repository root:
```bash
python scripts/import_matches.py --db data/football.sqlite --csv /path/to/normalized_matches.csv --source authorized-provider
```

The CSV must include `source_match_id,competition,season,home_team,away_team`. Optional headers are `kickoff_utc,status,home_goals,away_goals,home_corners,away_corners,home_shots,away_shots,home_shots_on_target,away_shots_on_target,home_possession,away_possession,home_yellow_cards,away_yellow_cards,home_red_cards,away_red_cards,stats_updated_at,source_updated_at`. Empty statistics remain NULL. Dates should be ISO 8601 UTC. Keep decimal odds in a separate odds CSV/table process so each bookmaker, market, selection, capture time and phase is preserved.

## Important boundaries
Flashscore/Livesport terms currently prohibit automated requests and scraping/aggregation without express consent. See the [official terms](https://www.livesport.eu/terms-of-use/en), especially the database-content and unauthorized-interference sections. This repository therefore does not include a Flashscore scraper or make automated requests to Flashscore. To connect it, first obtain written permission or a provider-approved feed/API and document the permitted fields, rate limits and retention rules.

## Current status
This is a local persistence/import foundation, not yet a scheduled production ingestion. GitHub Pages is static and cannot safely store secrets or run a private database. A later scheduled job should run in a server-side environment, store credentials as secrets, and publish only validated, permitted output files for the website. Do not commit credentials or a generated SQLite database.
