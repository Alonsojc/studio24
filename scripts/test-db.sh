#!/usr/bin/env bash
set -euo pipefail
: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to an empty local studio24_test database}"
case "$TEST_DATABASE_URL" in
  postgres*://*@127.0.0.1:*/studio24_test|postgres*://*@localhost:*/studio24_test) ;;
  *) printf 'Only the isolated local studio24_test database is allowed.\n' >&2; exit 1 ;;
esac
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-db-bootstrap.sql
for file in supabase/migrations/*.sql; do
  case "$file" in
    *inpc_cron*) continue ;;
    *202604270008*) psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-db-compat.sql ;;
  esac
  psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$file"
done
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-reliability.sql
