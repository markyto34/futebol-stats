#!/usr/bin/env python3
"""Import normalized match CSV data into the local SQLite history.

This importer does not fetch or scrape websites. Prepare a CSV from a source
whose automated use is authorized, then run:
  python scripts/import_matches.py --db data/football.sqlite --csv matches.csv --source authorized-provider

Required CSV columns: source_match_id, competition, season, home_team, away_team.
Optional columns use the names in data/schema.sql. Empty stats stay NULL.
"""
from __future__ import annotations

import argparse
import csv
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

INTEGER_FIELDS = {
    "home_goals", "away_goals", "home_corners", "away_corners",
    "home_shots", "away_shots", "home_shots_on_target",
    "away_shots_on_target", "home_yellow_cards", "away_yellow_cards",
    "home_red_cards", "away_red_cards",
}
REAL_FIELDS = {"home_possession", "away_possession"}
OPTIONAL_FIELDS = INTEGER_FIELDS | REAL_FIELDS | {
    "kickoff_utc", "status", "stats_updated_at", "source_updated_at"
}
REQUIRED_FIELDS = {
    "source_match_id", "competition", "season", "home_team", "away_team"
}
COLUMNS = sorted(REQUIRED_FIELDS | OPTIONAL_FIELDS | {"source"})

def parse_value(field: str, raw: str | None):
    if raw is None or raw.strip() == "":
        return None
    value = raw.strip()
    if field in INTEGER_FIELDS:
        number = float(value.replace(",", "."))
        if not number.is_integer():
            raise ValueError(f"{field} must be an integer: {value}")
        return int(number)
    if field in REAL_FIELDS:
        return float(value.replace(",", ".").rstrip("%"))
    return value

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", required=True, help="SQLite database path")
    parser.add_argument("--csv", required=True, help="Normalized input CSV")
    parser.add_argument("--source", required=True, help="Authorized source name")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.is_file():
        parser.error(f"CSV not found: {csv_path}")

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    schema_path = Path(__file__).resolve().parents[1] / "data" / "schema.sql"
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    seen = inserted_or_updated = skipped = 0
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.executescript(schema_path.read_text(encoding="utf-8"))
        run_id = conn.execute(
            "INSERT INTO ingestion_runs(source, started_at_utc, status) VALUES (?, ?, 'running')",
            (args.source, now),
        ).lastrowid
        with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            missing = REQUIRED_FIELDS - set(reader.fieldnames or [])
            if missing:
                raise ValueError("Missing required CSV columns: " + ", ".join(sorted(missing)))
            for row in reader:
                seen += 1
                try:
                    values = {field: parse_value(field, row.get(field)) for field in OPTIONAL_FIELDS | REQUIRED_FIELDS}
                    if not values["source_match_id"] or not values["competition"] or not values["season"] or not values["home_team"] or not values["away_team"]:
                        raise ValueError("missing required value")
                    if values["home_team"].casefold() == values["away_team"].casefold():
                        raise ValueError("home and away teams are identical")
                    status = values.get("status") or "scheduled"
                    fields = ["source", *sorted(REQUIRED_FIELDS), *sorted(OPTIONAL_FIELDS)]
                    payload = {"source": args.source, **values, "status": status}
                    # Missing values in later CSV updates must not erase known stats.
                    update_fields = [f for f in fields if f not in {"source", "source_match_id"}]
                    sql = (
                        "INSERT INTO matches (" + ", ".join(fields) + ") VALUES (" +
                        ", ".join("?" for _ in fields) + ") ON CONFLICT(source, source_match_id) DO UPDATE SET " +
                        ", ".join(f"{f}=COALESCE(excluded.{f}, matches.{f})" for f in update_fields)
                    )
                    conn.execute(sql, [payload.get(f) for f in fields])
                    inserted_or_updated += 1
                except (ValueError, TypeError) as exc:
                    skipped += 1
                    print(f"Skipping CSV row {seen + 1}: {exc}")
        conn.execute(
            "UPDATE ingestion_runs SET finished_at_utc=?, status=?, rows_seen=?, rows_inserted_or_updated=?, rows_skipped=? WHERE id=?",
            (datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "partial" if skipped else "success", seen, inserted_or_updated, skipped, run_id),
        )
        conn.commit()
        print(f"Import complete: seen={seen}, upserted={inserted_or_updated}, skipped={skipped}, db={db_path}")
    except Exception as exc:
        conn.rollback()
        print(f"Import failed: {exc}")
        return 1
    finally:
        conn.close()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
