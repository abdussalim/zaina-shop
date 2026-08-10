#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="${COMPOSE_FILE:-$repo_root/compose.production.yaml}"
backup_dir="${BACKUP_DIR:-$repo_root/backups}"
retention_days="${RETENTION_DAYS:-14}"

case "$retention_days" in
  ''|*[!0-9]*) echo "RETENTION_DAYS harus berupa bilangan bulat." >&2; exit 2 ;;
esac
case "$backup_dir" in
  ''|/) echo "BACKUP_DIR tidak boleh kosong atau root filesystem." >&2; exit 2 ;;
esac

mkdir -p -- "$backup_dir"
umask 077

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
backup_file="$backup_dir/zaina-$timestamp.dump"
temporary_file="$backup_file.tmp"
trap 'rm -f -- "$temporary_file"' EXIT

compose=(docker compose --project-directory "$repo_root" -f "$compose_file")
if [[ -f "$repo_root/.env" ]]; then
  compose=(docker compose --project-directory "$repo_root" --env-file "$repo_root/.env" -f "$compose_file")
fi

"${compose[@]}" exec -T database sh -c \
  'exec pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --compress=9' \
  > "$temporary_file"

[[ -s "$temporary_file" ]] || { echo "Backup kosong; file tidak disimpan." >&2; exit 1; }
mv -- "$temporary_file" "$backup_file"
backup_hash="$(sha256sum "$backup_file" | awk '{print $1}')"
printf '%s  %s\n' "$backup_hash" "$(basename -- "$backup_file")" > "$backup_file.sha256"

find "$backup_dir" -maxdepth 1 -type f -name 'zaina-*.dump' -mtime "+$retention_days" -delete
find "$backup_dir" -maxdepth 1 -type f -name 'zaina-*.dump.sha256' -mtime "+$retention_days" -delete

echo "Backup selesai: $backup_file"
