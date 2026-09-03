#!/usr/bin/env bash
#
# Deploy Aqary to Vercel.
#
#   DATABASE_URL="postgresql://…" ./scripts/deploy.sh
#
# The ordering here is not cosmetic. Storage keys embed the CUIDs of the rows
# they belong to, so the seeded documents on disk and the rows in the database
# are one artifact: seeding a fresh database mints new CUIDs, which orphans the
# storage directory generated for the previous one. The seed and the upload must
# therefore happen against the same database, in this order, or every document
# in the analyst workspace 404s.
#
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (a Postgres reachable from Vercel)." >&2
  exit 1
fi
export DATABASE_URL

cd "$(dirname "$0")/.."

echo "==> Schema"
npx prisma migrate deploy

echo "==> Seed (regenerating ./storage to match the new row IDs)"
rm -rf storage
npx prisma generate
node --conditions=react-server --import tsx prisma/seed/index.ts

echo "==> Point the deployment at this database"
printf '%s' "$DATABASE_URL" | npx vercel env add DATABASE_URL production --force

echo "==> Deploy"
npx vercel deploy --prod --yes

echo
echo "Done. Demo accounts and the walkthrough are in README.md."
