#!/bin/sh
# One-off migration step. Needs MIGRATE_DATABASE_URL (owner role, DIRECT non-pooled host).
# Run from a trusted machine or CI job, NOT from the runtime web service.
set -e
[ -n "$MIGRATE_DATABASE_URL" ] || { echo "MIGRATE_DATABASE_URL not set"; exit 1; }
DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy
