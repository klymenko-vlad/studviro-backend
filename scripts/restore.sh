#!/usr/bin/env bash
#
# Restore a custom-format dump over the database named by DATABASE_URL.
# This drops and recreates every object in that database. It is the most
# destructive thing in this repository, so it asks before it does it.
#
#   scripts/restore.sh <dump-file> [--i-mean-it]
#
# --i-mean-it    the only way to run with NODE_ENV=production. Without it the
#                script refuses outright rather than prompting, so a production
#                restore is never one stray keystroke away.
#
# DATABASE_URL      required. Read from the environment, or from backend/.env.
#                   The database it names is the one overwritten; point it at a
#                   scratch database to rehearse.
# CONFIRM_RESTORE   set to the target database name to skip the prompt. Required
#                   when stdin is not a terminal.
# PG_CONTAINER      run pg_restore inside this docker container instead of on
#                   the host, for when the host's client is older than the server.

set -euo pipefail

dump_file=
i_mean_it=false

for argument in "$@"; do
  case "$argument" in
    --i-mean-it) i_mean_it=true ;;
    -*) echo "restore: unknown option '$argument'" >&2; exit 1 ;;
    *) dump_file=$argument ;;
  esac
done

if [[ -z $dump_file ]]; then
  echo "restore: usage: scripts/restore.sh <dump-file> [--i-mean-it]" >&2
  exit 1
fi

if [[ ! -r $dump_file ]]; then
  echo "restore: cannot read dump file '$dump_file'" >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(dirname -- "$script_dir")

if [[ -z ${DATABASE_URL:-} && -f "$repo_root/.env" ]]; then
  DATABASE_URL=$(grep -E '^DATABASE_URL=' "$repo_root/.env" | tail -n 1 | cut -d '=' -f 2-)
fi

if [[ -z ${DATABASE_URL:-} ]]; then
  echo "restore: DATABASE_URL is not set. Refusing to guess which database to overwrite." >&2
  exit 1
fi

database_name=${DATABASE_URL##*/}
database_name=${database_name%%\?*}
host_and_port=${DATABASE_URL#*@}
host_and_port=${host_and_port%%/*}

if [[ ${NODE_ENV:-} == production && $i_mean_it != true ]]; then
  echo "restore: NODE_ENV=production. Pass --i-mean-it to restore over a live database." >&2
  exit 1
fi

echo "restore: about to overwrite database '$database_name' on $host_and_port"
echo "restore: from $dump_file ($(du -h -- "$dump_file" | cut -f 1))"
echo "restore: every table, row and sequence currently in '$database_name' is replaced."

if [[ -n ${CONFIRM_RESTORE:-} ]]; then
  confirmation=$CONFIRM_RESTORE
elif [[ -t 0 ]]; then
  read -r -p "restore: type the database name to continue: " confirmation
else
  echo "restore: stdin is not a terminal. Set CONFIRM_RESTORE=$database_name to confirm." >&2
  exit 1
fi

if [[ $confirmation != "$database_name" ]]; then
  echo "restore: confirmation did not match '$database_name'. Nothing was changed." >&2
  exit 1
fi

started=${EPOCHREALTIME//[.,]/}

if [[ -n ${PG_CONTAINER:-} ]]; then
  docker exec -i "$PG_CONTAINER" pg_restore --clean --if-exists --no-owner --no-privileges \
    --dbname="$DATABASE_URL" < "$dump_file"
else
  pg_restore --clean --if-exists --no-owner --no-privileges \
    --dbname="$DATABASE_URL" "$dump_file"
fi

elapsed_ms=$(((${EPOCHREALTIME//[.,]/} - started) / 1000))
printf "restore: '%s' restored in %d.%03ds\n" "$database_name" "$((elapsed_ms / 1000))" "$((elapsed_ms % 1000))"
