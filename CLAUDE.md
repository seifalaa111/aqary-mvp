# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Aqary is a verified secondary-market platform for Egyptian off-plan property contracts.
`README.md` documents the product and domain in depth; `ASSUMPTIONS.md` records every
judgement call and mocked integration. This file covers what you need to *operate* in
the repo.

## Commands

```bash
npm run setup          # db:up + generate + deploy + assets:fetch + seed — first run, ~5 min
npm run dev            # Next dev server
npm run build          # production build (typecheck runs as part of it)
npm run typecheck      # tsc --noEmit
npm test               # Vitest, single run
npm run test:watch
npm run test:e2e       # Playwright — builds the app and serves it on :3100
npm run worker         # drain the job queue continuously (optional; see below)
npm run db:up / db:down / db:migrate / db:deploy / db:studio
npm run seed
```

Run a single unit test file or filter by name — arguments pass straight through:

```bash
npm test -- tests/unit/calculators.test.ts
npm test -- -t "no-overprice"
npx playwright test -g "seller intake"
```

**Do not invoke `vitest` or the seed directly.** Both npm scripts wrap the runner in
`node --env-file=.env --conditions=react-server`. The `react-server` condition is what
lets the `server-only` import guard resolve, and `--env-file` is the only thing loading
`DATABASE_URL`. `npx vitest` fails on both counts.

There is **no lint script and no ESLint config**; `next.config.ts` sets
`eslint.ignoreDuringBuilds`. `npm run typecheck` is the only static gate, and
`typescript.ignoreBuildErrors` is `false`, so a type error fails the build.

## Tests

- `tests/unit/calculators.test.ts` — pure financial functions, no database.
- `tests/unit/invariants.test.ts` — **requires a migrated, seeded database.** It proves
  the domain guarantees hold in the running system, not just in isolation. `vitest.config.ts`
  sets `fileParallelism: false` because of it.
- `tests/e2e/critical-paths.spec.ts` — `workers: 1`, since all three paths share one
  seeded database and would otherwise fight over the same listings.

## Architecture

### Five parallel sources of truth

The core of the domain. Every material contract value is stored as five coexisting
columns on `ContractField` — `declared*`, `extracted*`, `receiptDerived*`,
`developerStated*`, `verified*` — and **nothing ever overwrites anything**. Only an
analyst writes `verified*`; the AI provider may only write `extracted*`. When sources
disagree beyond tolerance the reconciliation service records a `Discrepancy` carrying
both values and the evidence — it deliberately does not pick a winner. Buyer-facing
surfaces read `verified*` and render `verifiedSource` as a provenance chip; an
unverified field shows as *pending*, never as the seller's claim.

`src/lib/domain/fields.ts` is the only correct way to read this shape.

### Server-side authority

Mutations happen exclusively in `src/app/actions/*.ts` (`"use server"`), which return a
discriminated `{ ok: true } | { ok: false, error }` rather than throwing at the client.
Every one authorises through `src/lib/auth/guard.ts` (`requireRole`, `requireListingAccess`,
`requireDealAccess`, `requireBuyerTier`) and writes to the append-only trail in
`src/lib/audit.ts`. Denials are audited too. The client is never asked what role it holds.

`checkPublishReadiness()` in `src/lib/services/listings.ts` is the single authority on
whether a listing may go live, and `approveAndPublish()` calls it **again inside the
write** so a stale browser cannot talk the server into publishing an unverified file.
Listing state transitions are enumerated in the same file.

### Providers

`src/lib/providers/index.ts` is a registry: calling code asks for a capability
(`ai()`, `payments()`, `kyc()`, `notifications()`, `storage`), never an implementation.
Every `*_MODE` defaults to mock, so **the app runs fully with no API keys**. Swapping in
a live integration is a config change, not a code change — preserve that property.

The distinction that matters throughout: *mocked external services are fine, faked
application behaviour is not*. The mock providers drive the real pipeline — real rows,
real state machines, real audit events.

### Money

`Decimal` (decimal.js) everywhere, never float. `src/lib/money.ts` is the single EGP
formatting authority. Every economic constant lives in `src/lib/config.ts` and is read
from there — never inline a fee, threshold or tolerance.

### Storage and the seed/storage coupling

Documents are never served from a static path. `src/app/api/files/[key]/route.ts`
requires a valid short-lived signature or a server-side authorization check, and logs
every read. `.truth.json` sidecars (extraction-engine input) are hard-404'd there.

**Storage keys embed the CUIDs of the rows that own them**, so `./storage` and the
database are one artifact. Reseeding mints new CUIDs and orphans an existing `storage`
directory — every document 404s. Seed and deploy must target the same database;
`scripts/deploy.sh` encodes that ordering.

On a read-only host (`READ_ONLY_FS`, auto-detected from `VERCEL`), `storage.ts` reads
from the bundled tree and writes to a temp overlay searched first, so runtime uploads
shadow bundled objects without mutating them — and do not survive an instance recycle.
`next.config.ts` declares `./storage/**/*` for the file route only; adding it to other
routes costs ~44 MB per function for nothing.

### i18n

`localePrefix: "always"` — every URL carries `/en` or `/ar`. Redirect targets built in
server code must include the locale or they 404. `src/middleware.ts` rescues un-prefixed
paths.

> The middleware matcher contains `.*\..*` with a **double** backslash. In a JavaScript
> string `\.` collapses to `.`, which turns the lookahead into `.*..*` and silently
> disables the middleware for nearly every route. Do not "tidy" it.

## Conventions

- Design tokens in `src/app/globals.css` are the only source of colour, space, radius and
  type. Components must not introduce raw hex. (A comment there cites an ESLint rule that
  does not currently exist — this is convention, enforced by review.)
- Seeded rows carry `isDemo: true` and the app shows a standing banner. The demo password
  (`src/lib/demo.ts`) is deliberately public.
- Synthetic imagery must never be presented as an actual property photograph — see
  `ASSETS.md`.
- `.gitignore` excludes `.env*` broadly and re-includes `.env.example`; keep that
  exception when editing it.

## Background jobs

Extraction runs inline on seller submit and payment callbacks resolve in the action that
started them, so the demo works with no worker running. `npm run worker` drains the queue
continuously; on Vercel `/api/jobs/drain` runs on a schedule as a retry net. Failures,
retries and dead letters are visible at `/analyst/jobs` either way.

## Known issue

The sign-in inputs (`#identifier`, `#password`) have **no `name` attributes** — they are
controlled React state submitted through a server action. A click that lands before
hydration submits the form natively as a GET and silently drops the credentials. Browser
automation must wait for the React fiber key to appear before filling:

```js
await page.waitForFunction(() => {
  const el = document.querySelector("#identifier");
  return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
});
```

The real fix is `name` attributes plus a non-JS form path; it is not yet applied.
