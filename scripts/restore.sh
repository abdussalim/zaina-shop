#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Pemakaian: $0 /path/backup.dump --yes" >&2
}

[[ $# -eq 2 && "$2" == "--yes" ]] || { usage; exit 2; }
[[ -f "$1" ]] || { echo "File backup tidak ditemukan: $1" >&2; exit 2; }

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
backup_file="$(CDPATH= cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")"
if [[ -f "$backup_file.sha256" ]]; then
  (cd -- "$(dirname -- "$backup_file")" && sha256sum -c "$(basename -- "$backup_file.sha256")")
fi
compose_file="${COMPOSE_FILE:-$repo_root/compose.production.yaml}"
compose=(docker compose --project-directory "$repo_root" -f "$compose_file")
if [[ -f "$repo_root/.env" ]]; then
  compose=(docker compose --project-directory "$repo_root" --env-file "$repo_root/.env" -f "$compose_file")
fi

if "${compose[@]}" ps --status running --services | grep -qx 'api'; then
  echo "Hentikan API terlebih dahulu: docker compose -f $compose_file stop api web" >&2
  exit 2
fi

echo "Memulihkan $backup_file. Isi database saat ini akan diganti."
"${compose[@]}" exec -T database sh -c \
  'exec pg_restore --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction' \
  < "$backup_file"
"${compose[@]}" exec -T database sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command "SELECT COUNT(*) FROM schema_migrations"'

echo "Restore selesai. Jalankan kembali API dan web."
