#!/usr/bin/env bash
# Loads the geography dumps into the running Postgres/PostGIS container.
# Order matters: counties → constituencies → wards → polling_stations (FKs).
# Idempotent-ish: the dumps CREATE TABLE, so run this against a fresh DB.
#
# Usage:  ./scripts/load-geo.sh
set -euo pipefail

cd "$(dirname "$0")/.."

# Load env for POSTGRES_USER / POSTGRES_DB
set -a; [ -f .env ] && . ./.env; set +a
DB_USER="${POSTGRES_USER:-mtazamo}"
DB_NAME="${POSTGRES_DB:-mtazamo}"

DUMPS=(counties constituencies wards polling_stations)

echo "Ensuring PostGIS extension..."
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# wards.sql installs a trigger referencing this function, which the per-table
# pg_dump did not export. It enforces that a ward's county_id matches the
# county of its constituency. Define it before loading wards.
echo "Ensuring ward/county consistency function..."
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" <<'SQL'
CREATE OR REPLACE FUNCTION public.check_ward_county_consistency() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.constituencies c
    WHERE c.id = NEW.constituency_id AND c.county_id = NEW.county_id
  ) THEN
    RAISE EXCEPTION 'ward % (%) county_id does not match its constituency''s county',
      NEW.id, NEW.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
SQL

for name in "${DUMPS[@]}"; do
  file="exports/geo/${name}.sql"
  echo "Loading ${file} ..."
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$file"
done

echo ""
echo "── Row counts ──────────────────"
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT 'counties' AS tbl, count(*) FROM counties
   UNION ALL SELECT 'constituencies', count(*) FROM constituencies
   UNION ALL SELECT 'wards', count(*) FROM wards
   UNION ALL SELECT 'polling_stations', count(*) FROM polling_stations;"
