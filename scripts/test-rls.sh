#!/usr/bin/env bash
#
# Run the RLS test suite against a real PostgreSQL instance.
#
# RLS is database behaviour: the Jest suite mocks Supabase and therefore cannot
# see a policy at all. This script applies the real migrations to a real
# Postgres, then runs supabase/tests/ against them.
#
# Two modes:
#
#   1. An existing server, when DATABASE_URL is set (CI service container):
#        DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
#          ./scripts/test-rls.sh
#
#   2. A throwaway cluster, when it is not. Requires PostgreSQL server binaries
#      (initdb / pg_ctl). The cluster is created in a temp directory and removed
#      on exit, so it never touches an existing installation.
#
# Exits non-zero if any assertion fails.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"
TESTS_DIR="$REPO_ROOT/supabase/tests"

# psql must stop at the first error, otherwise a broken migration would be
# reported as a passing test run.
PSQL_FLAGS=(--quiet --no-psqlrc --set ON_ERROR_STOP=1)

log() { printf '\033[1m==>\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Locate the server binaries. They are not always on PATH (Debian/Ubuntu keep
# them under /usr/lib/postgresql/<version>/bin).
# ---------------------------------------------------------------------------
find_pg_bindir() {
  if command -v initdb >/dev/null 2>&1 && command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v initdb)"
    return 0
  fi
  local candidate
  # Newest major version first.
  for candidate in $(ls -1dr /usr/lib/postgresql/*/bin 2>/dev/null); do
    if [ -x "$candidate/initdb" ] && [ -x "$candidate/pg_ctl" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

apply_sql_files() {
  # $1: connection URI, remaining args: files, applied in the given order.
  local uri="$1"; shift
  local file
  for file in "$@"; do
    log "applying $(basename "$file")"
    psql "${PSQL_FLAGS[@]}" "$uri" --file "$file"
  done
}

run_suite() {
  local uri="$1"

  # The shim first (auth schema + roles the migrations depend on), then the
  # real migrations in lexical order, then the harness, then the assertions.
  local migrations=()
  while IFS= read -r m; do migrations+=("$m"); done \
    < <(find "$MIGRATIONS_DIR" -name '*.sql' | sort)

  if [ ${#migrations[@]} -eq 0 ]; then
    echo "No migrations found in $MIGRATIONS_DIR" >&2
    return 1
  fi

  apply_sql_files "$uri" \
    "$TESTS_DIR/00_supabase_shim.sql" \
    "${migrations[@]}" \
    "$TESTS_DIR/01_test_helpers.sql"

  log "running RLS assertions"
  # The assertion output arrives as INFO/WARNING notices; show them.
  PGOPTIONS='--client-min-messages=info' \
    psql "${PSQL_FLAGS[@]}" "$uri" --file "$TESTS_DIR/02_rls_test.sql"
}

# ---------------------------------------------------------------------------
# Mode 1: use the server we were pointed at.
# ---------------------------------------------------------------------------
if [ -n "${DATABASE_URL:-}" ]; then
  log "using existing PostgreSQL from DATABASE_URL"
  run_suite "$DATABASE_URL"
  log "RLS suite passed"
  exit 0
fi

# ---------------------------------------------------------------------------
# Mode 2: throwaway cluster.
# ---------------------------------------------------------------------------
PG_BINDIR="$(find_pg_bindir)" || {
  cat >&2 <<'EOF'
error: no PostgreSQL server binaries found (initdb / pg_ctl).

Either install PostgreSQL, or point the suite at a running server:

  DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
    ./scripts/test-rls.sh
EOF
  exit 1
}
log "using PostgreSQL binaries from $PG_BINDIR"

WORKDIR="$(mktemp -d)"
PGDATA="$WORKDIR/data"
PGSOCK="$WORKDIR/sock"
mkdir -p "$PGDATA" "$PGSOCK"

# initdb refuses to run as root. When this script is run as root, hand the
# cluster to an unprivileged account instead.
RUN_AS=""
if [ "$(id -u)" -eq 0 ]; then
  for candidate in postgres nobody; do
    if id "$candidate" >/dev/null 2>&1; then
      RUN_AS="$candidate"
      break
    fi
  done
  if [ -z "$RUN_AS" ]; then
    echo "error: running as root and no unprivileged user found to own the cluster" >&2
    exit 1
  fi
  chown -R "$RUN_AS" "$WORKDIR"
  log "running the cluster as '$RUN_AS' (script invoked as root)"
fi

as_pg() {
  if [ -n "$RUN_AS" ]; then
    su "$RUN_AS" -c "$*"
  else
    bash -c "$*"
  fi
}

STARTED=0
cleanup() {
  if [ "$STARTED" -eq 1 ]; then
    as_pg "'$PG_BINDIR/pg_ctl' -D '$PGDATA' -m immediate -w stop" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

log "creating a throwaway cluster"
as_pg "'$PG_BINDIR/initdb' -D '$PGDATA' -A trust -U postgres --no-sync" \
  > "$WORKDIR/initdb.log" 2>&1 || { cat "$WORKDIR/initdb.log" >&2; exit 1; }

# No TCP listener: a unix socket in the temp dir keeps the cluster private and
# avoids colliding with anything already bound to 5432.
as_pg "'$PG_BINDIR/pg_ctl' -D '$PGDATA' \
        -o '-k $PGSOCK -c listen_addresses= -c fsync=off' \
        -w -l '$WORKDIR/server.log' start" \
  > /dev/null 2>&1 || { cat "$WORKDIR/server.log" >&2; exit 1; }
STARTED=1

as_pg "'$PG_BINDIR/createdb' -h '$PGSOCK' -U postgres trygkreds_test"

run_suite "postgresql://postgres@/trygkreds_test?host=$PGSOCK"

log "RLS suite passed"
