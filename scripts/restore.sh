#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Pemakaian: $0 /path/backup.dump --yes" >&2
}

[[ $# -eq 2 && "$2" == "--yes" ]] || { usage; exit 2; }
[[ -f "$1" ]] || { echo "File backup tidak ditemukan: $1" >&2; exit 2; }

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
backup_file="$(CDPATH= cd -- "$(dirname -- "$1")" && pwd)/$(basename -- "$1")"
[[ -f "$backup_file.sha256" ]] || {
  echo "Checksum tidak ditemukan: $backup_file.sha256" >&2
  exit 2
}
(cd -- "$(dirname -- "$backup_file")" && sha256sum -c "$(basename -- "$backup_file.sha256")")
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
verification_sql="SELECT (SELECT COUNT(*) >= 2 FROM schema_migrations) AND to_regclass('users') IS NOT NULL AND to_regclass('products') IS NOT NULL AND to_regclass('stock_movements') IS NOT NULL AND to_regclass('sales') IS NOT NULL AND to_regclass('store_settings') IS NOT NULL AND to_regclass('session') IS NOT NULL AND EXISTS (SELECT 1 FROM users) AND EXISTS (SELECT 1 FROM store_settings)"
verification="$("${compose[@]}" exec -T database sh -c \
  'exec psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --set ON_ERROR_STOP=1 --command "$1"' sh "$verification_sql")"
[[ "$verification" == "t" ]] || {
  echo "Verifikasi restore gagal: tabel inti, migrasi, pengguna, atau pengaturan tidak lengkap." >&2
  exit 1
}

echo "Restore selesai. Jalankan kembali API dan web."
