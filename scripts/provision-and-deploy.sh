#!/usr/bin/env bash
#
# Provision a Neon Postgres through the Vercel marketplace and deploy Aqary.
#
#   ./scripts/provision-and-deploy.sh
#
# Prerequisite, and the only thing that cannot be automated: Neon's marketplace
# terms must be accepted once, in a browser, at
#   https://vercel.com/<team>/~/integrations/accept-terms/neon?source=cli
# The CLI reports `userActionRequired` until that is done.
#
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${NEON_REGION:-fra1}"   # closest offered region to Egypt
PLAN="${NEON_PLAN:-free_v3}"

if npx vercel integration installations 2>&1 | grep -qi "No marketplace installations found"; then
  echo "==> Installing Neon ($PLAN, $REGION)"
  npx vercel integration add neon --plan "$PLAN" --no-claim -m region="$REGION"
fi

echo "==> Pulling the injected DATABASE_URL"
npx vercel env pull .env.production.local --environment=production --yes

# The integration injects DATABASE_URL (and usually a pooled variant). Prefer
# the pooled endpoint: serverless opens many short-lived connections and a
# direct endpoint runs out of them well before the app runs out of traffic.
DATABASE_URL="$(grep -E '^DATABASE_URL_POOLED=|^POSTGRES_PRISMA_URL=|^DATABASE_URL=' .env.production.local \
  | head -1 | cut -d= -f2- | tr -d '"')"

if [[ -z "$DATABASE_URL" ]]; then
  echo "No DATABASE_URL found in .env.production.local — check the integration." >&2
  exit 1
fi
export DATABASE_URL
echo "==> Using ${DATABASE_URL%%@*}@…"

exec ./scripts/deploy.sh
