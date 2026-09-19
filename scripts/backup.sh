#!/usr/bin/env bash
#
# Dump the database named by DATABASE_URL to a timestamped file in pg_dump's
# custom format (-Fc), which pg_restore can read selectively and in parallel.
#
#   scripts/backup.sh [destination-directory]
#
# DATABASE_URL   required. Read from the environment, or from backend/.env.
# BACKUP_DIR     where dumps are written. Overridden by the argument.
#                Defaults to a temp directory, deliberately: a dump of the whole
#                academic record must not land inside the working tree.
# PG_CONTAINER   run pg_dump inside this docker container instead of on the
#                host. Needed when the host's client is older than the server;
#                pg_dump refuses to dump a newer server than itself.

set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(dirname -- "$script_dir")

if [[ -z ${DATABASE_URL:-} && -f "$repo_root/.env" ]]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$repo_root/.env" | tail -n 1 | cut -d '=' -f 2-)
fi

if [[ -z ${DATABASE_URL:-} ]]; then
  echo "backup: DATABASE_URL is not set. Refusing to guess which database to dump." >&2
  exit 1
fi

database_name=${DATABASE_URL##*/}
database_name=${database_name%%\?*}

destination=${1:-${BACKUP_DIR:-${TMPDIR:-/tmp}/studviro-backups}}
mkdir -p "$destination"
dump_file="$destination/${database_name}-$(date -u +%Y%m%dT%H%M%SZ).dump"

trap 'rm -f -- "$dump_file"' ERR

started=${EPOCHREALTIME//[.,]/}

if [[ -n ${PG_CONTAINER:-} ]]; then
  docker exec -i "$PG_CONTAINER" pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > "$dump_file"
else
  pg_dump --format=custom --no-owner --no-privileges --file="$dump_file" "$DATABASE_URL"
fi

elapsed_ms=$(((${EPOCHREALTIME//[.,]/} - started) / 1000))
trap - ERR

echo "backup: dumped '$database_name' to $dump_file"
printf 'backup: %s in %d.%03ds\n' "$(du -h -- "$dump_file" | cut -f 1)" "$((elapsed_ms / 1000))" "$((elapsed_ms % 1000))"
echo "backup: restore it with  scripts/restore.sh $dump_file"
