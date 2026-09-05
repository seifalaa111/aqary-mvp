# Aqary

**Egypt's secondary marketplace for real-estate installment contracts.**

Aqary is not a property listing site. It is transaction infrastructure for
**installment-contract assignment (التنازل)**: a contract holder who can no
longer carry their instalments transfers the contract to a new buyer **with no
overprice**, receives in cash the amount they have already paid, and the buyer
continues the remaining instalments **at the old contractual price**.

- **0% commission from the seller.**
- **2% success fee from the buyer, charged only on a completed assignment.**
- **No listing goes live without a human analyst signing off every figure.**

This repository is a working MVP: real Postgres, real domain logic, real state
machines, real audit trail. External integrations (document AI, PSP, KYC,
messaging) sit behind provider interfaces and ship with realistic mocks, so the
whole product runs with **no API keys and no third-party accounts**.

---

## 1. Run it

Prerequisites: **Node 20+**, **Docker** (for Postgres), and a network connection
the first time (to download property photography).

```bash
git clone <this repo>
cd aqary

npm install
cp .env.example .env          # no secrets to fill in — the defaults work

npm run setup                 # docker compose up · prisma generate · migrate · fetch photos · seed
npm run dev                   # http://localhost:3000
```

`npm run setup` is idempotent. If you only want to reset the data:

```bash
npm run db:reset && npm run seed
```

Individual steps, if you prefer to run them yourself:

| Command | What it does |
|---|---|
| `npm run db:up` | Starts Postgres 16 on port **55432** via `docker-compose.yml` |
| `npm run db:deploy` | Applies migrations |
| `npm run assets:fetch` | Downloads property photography into `public/property/` and writes `ASSETS.md` |
| `npm run seed` | Builds the demo marketplace (see §4) — takes about three minutes |
| `npm run dev` | Next.js dev server |
| `npm run worker` | Runs the background job runner in a loop (optional — see §6) |
| `npm test` | Vitest: financial calculators + domain invariants |
| `npm run test:e2e` | Playwright: the three critical paths |
| `npm run db:studio` | Prisma Studio, if you want to poke at rows directly |

### No Docker?

Point `DATABASE_URL` at any Postgres 14+ instance and skip `db:up`. Nothing else
in the stack needs a container.

---

## 2. Walk the whole business in five minutes

Every demo account uses the password **`aqary2026`**. Phone sign-in also works —
the one-time code is printed on screen in development instead of being sent.

| Role | Email | Phone |
|---|---|---|
| Seller | `ahmed.seller@aqary.test` | `+201001110001` |
| Buyer — priority tier | `mostafa.buyer@aqary.test` | `+201002220001` |
| Buyer — verified tier | `laila.buyer@aqary.test` | `+201002220002` |
| Analyst | `heba.analyst@aqary.test` | `+201003330001` |
| Admin (analyst + admin) | `admin@aqary.test` | `+201004440001` |
| Developer partner | `partner@aqary.test` | `+201005550001` |
| Seller **and** buyer (workspace switcher) | `dual@aqary.test` | `+201006660001` |

### The five-minute walkthrough

1. **See the marketplace as a stranger.** Open `/` — the opportunity grid at the
   bottom is pulled live from Postgres. Click through to any opportunity: every
   money figure carries a provenance chip saying where it came from. Click a chip.

2. **Be the analyst.** Sign in as `heba.analyst@aqary.test` → **Verification
   queue**. Files with open critical signals sort to the top. Open
   **AQ-1029** (the receipt-mismatch file) or **AQ-1030** (the suspicious-receipt
   file).
   - **Fields** tab: `j`/`k` to move, `Enter` to accept, `o` to jump the document
     viewer to the exact region the value was read from. Accepting a field is
     what writes a verified value — nothing else can.
   - **Reconciliation** tab: seller declared vs sum of verified receipts vs
     developer statement vs the schedule rebuilt from the contract's own terms,
     with the delta in large type.
   - **Fraud** tab: signals with their evidence, each needing a written
     disposition.
   - **Decision** tab: try **Approve & publish**. It is disabled, and the panel
     lists exactly which server-enforced precondition is missing.

3. **Publish one.** Open a `QUEUE_CLEAN` file, verify the receipts (Receipts
   tab → Verify), promote every required field, approve the media, then publish.
   The listing appears on `/opportunities` immediately.

4. **Be the buyer.** Sign in as `mostafa.buyer@aqary.test` → **Matches**. The
   scores are computed from that buyer's cash and instalment capacity against
   every live contract. Open one:
   - **Your total cost** recomputes live and compares against buying the same
     unit from the developer today.
   - **Does this fit you?** runs the same `affordability()` function the match
     scoring uses.
   - **Make an offer.** Type more than the asking cash — the button disables and
     the server refuses it too.

5. **Be the seller.** Sign in as `ahmed.seller@aqary.test`, open the listing with
   offers, and **accept** one. A deal room opens.

6. **Close the deal.** In the deal room, pay the reservation deposit — try
   **Simulate a failed payment** first. The payment record is created, the
   milestone blocks, the failure reason is on the record, and **Retry** creates a
   new attempt with a fresh idempotency key. Then simulate success, and walk the
   milestones to `COMPLETED`.

7. **Switch to Arabic** with the toggle in the header. The whole layout mirrors —
   `dir="rtl"`, logical CSS properties throughout, Arabic contract documents.

Already-seeded shortcuts: **AQ-1026** is an active deal part-way through, and
**AQ-1027** is a deal that ran all the way to completion (including a payment
that failed and was retried).

---

## 3. The domain model

The full schema is `prisma/schema.prisma`. Four things in it matter more than
the rest.

### 3.1 Five parallel sources of truth (`ContractField`)

Every material contract value — total price, amount paid, outstanding balance,
instalment, delivery date — is stored as **five independent values that coexist
forever**:

| Column group | Origin | Written by |
|---|---|---|
| `declared*` | what the seller typed | seller |
| `extracted*` (+ confidence, documentId, page, bbox) | document intelligence | AI service only |
| `receiptDerived*` | computed from verified receipts | reconciliation service |
| `developerStated*` | the developer's account statement | analyst, on document evidence |
| `verified*` (+ `verifiedSource`, `verifiedBy`, `verifiedAt`, `overrideReason`) | the adopted truth | **analyst action only** |

Nothing overwrites anything. When two present sources disagree beyond tolerance
the reconciliation service creates a `Discrepancy` with both values and the
evidence — **it does not pick a winner**. Buyer-facing surfaces read `verified*`
and display `verifiedSource` as the provenance chip; a field with no analyst
signature renders as *pending*, never as the seller's claim.

### 3.2 The listing state machine

```
DRAFT → SUBMITTED → AI_PROCESSING → PENDING_REVIEW → VERIFIED → LISTED
      → UNDER_OFFER → RESERVED → ASSIGNMENT_IN_PROGRESS → COMPLETED
(+ INFO_REQUESTED, REJECTED, WITHDRAWN, EXPIRED)
```

Transitions are enumerated in `src/lib/services/listings.ts`, enforced
server-side and audited. `INFO_REQUESTED` always produces an itemised checklist
the seller can act on — never a generic "more info needed".

### 3.3 The publish gate

`checkPublishReadiness()` is the only authority on whether a listing may go
live, and `approveAndPublish()` calls it again **inside** the write. A listing
cannot publish without:

- an analyst signature (`humanVerifiedBy` + `humanVerifiedAt`)
- a verified value for every required field
- zero unresolved `CRITICAL` discrepancies
- zero open `CRITICAL` fraud signals
- at least `MIN_APPROVED_IMAGES` (5) analyst-approved images
- an approved floor plan
- an asking cash that does not exceed the verified amount paid

A stale browser cannot talk the server into publishing an unverified file.

### 3.4 Money

`Decimal` everywhere, never float. Currency is EGP everywhere.
`src/lib/money.ts` is the single formatting authority; `formatMoney` produces
`EGP 9,450,000` and money renders with tabular figures so columns align. Every
economic constant lives in `src/lib/config.ts` — `PLATFORM_FEE_BPS = 200`,
`SELLER_FEE_BPS = 0` — and is read from there, never inlined.

---

## 4. What the seed builds

`npm run seed` produces a marketplace with deliberately interesting scenarios,
not just volume:

- **12 developers** with real names and explicitly synthetic assignment policies,
  across **29 projects** in New Cairo, the New Capital, Sheikh Zayed, 6th of
  October, Mostakbal City, the North Coast, Ain Sokhna and New Mansoura.
- **37 contracts**, of which **25 are published**.
- **~770 documents / ~910 rendered pages** — real, readable Arabic contract
  pages, payment receipts and developer account statements, generated from each
  contract's own figures (see §5).
- **~645 receipts**, **~390 media assets**, **35 extraction runs**.
- Scenarios you can open by name:
  - `AQ-1029` — **receipt mismatch**: the seller declares ~16% more than the
    receipts support, and the developer statement is missing.
  - `AQ-1030` — **suspicious receipt**: one file re-uploaded under a second
    receipt number (caught by exact hash) plus one carrying a Photoshop tag.
  - `AQ-1031` — **incomplete documents**: no statement, no ID, three images.
  - `AQ-1032` / `AQ-1033` — **information requested**, with itemised lists.
  - `AQ-1034` — **rejected**, with the reason on the seller's file.
  - `AQ-1022` / `AQ-1023` — **live offers**; `AQ-1024` — **an open negotiation**
    with a seller counter; `AQ-1025` — **an active deal**; `AQ-1026` — **a
    completed deal** including a failed-then-retried payment.
  - Two **drafts** mid-wizard.

Every seeded row carries `isDemo: true`, and the app shows a standing banner
saying so.

---

## 5. Real vs mocked

> **Mocked external services are allowed. Fake application behavior is not.**

| Capability | Status | What is real |
|---|---|---|
| Auth, roles, sessions | **Real** | Phone-OTP + password, server-side RBAC on every route and query, denials audited |
| Seller intake | **Real** | Resumable across devices; every step is a row before the UI advances |
| Uploads | **Real** | SHA-256, 256-bit dHash, EXIF stripped, blur detection, responsive variants via `sharp` |
| Extraction pipeline | **Mock provider, real pipeline** | Persists `Extraction` + `ExtractionField` with confidence, document, page and bbox; promotes only to `extracted*` |
| Reconciliation | **Real, never mocked** | Four-way comparison, typed `Discrepancy` records with severity and evidence |
| Fraud signals | **Real computations** | Hash duplicates, perceptual near-duplicates, EXIF/editor tags, date-sequence anomalies, arithmetic impossibility, cross-listing document reuse |
| Valuation | **Real computation, synthetic inputs** | Range + confidence + drivers + comparables; comparables and developer pricing are seed data and labelled as such |
| Matching | **Real, never mocked** | Financial compatibility first, with blockers |
| Verification score | **Real** | Eight weighted components, each with its own measurement and explanation |
| Payments | **Mock PSP, real everything else** | Payment records, idempotency keys, INITIATED→PROCESSING→SUCCEEDED/FAILED, webhook-shaped callbacks, retry as a new attempt, audit events |
| KYC | **Mock bureau, real local checks** | National-ID checksum, DOB and governorate derivation, document presence |
| Notifications | **Real in-app, mocked delivery** | `Notification` rows always; WhatsApp/SMS/email delivery simulated |
| Storage | **Real, local** | `StorageProvider` with a local-filesystem implementation; documents served only through signed, expiring, access-logged URLs |
| Background jobs | **Real** | Persisted job table with retry, backoff, dead-letter, visible in the ops console |

Switch AI to live with `AI_MODE=live` plus `ANTHROPIC_API_KEY` and
`npm i @anthropic-ai/sdk`. No calling code changes.

### The generated documents

The seed renders **real, readable pages** rather than grey rectangles:
`src/lib/docgen/pages.ts` draws Arabic/English contract pages, payment receipts
and developer account statements containing each contract's actual figures, and
writes a `.truth.json` sidecar recording where on the page every value was
drawn. The mock extraction engine reads those pages and cites the real regions —
which is why clicking a citation in the analyst workspace highlights the actual
number. See `ASSETS.md`.

---

## 6. Environment

Everything in `.env.example` has a working default. The switches that matter:

```dotenv
DATABASE_URL="postgresql://aqary:aqary@localhost:55432/aqary?schema=public"
AUTH_SECRET="dev-only-secret-change-me-0123456789abcdef"

PLATFORM_FEE_BPS=200      # 2% buyer success fee
SELLER_FEE_BPS=0          # 0% seller commission

AI_MODE=mock              # mock | live   — mock needs no API key
PAYMENT_MODE=mock
KYC_MODE=mock
NOTIFICATION_MODE=mock
STORAGE_MODE=local

SURFACE_OTP_IN_DEV=true   # show the OTP on screen instead of sending it
SHOW_DEMO_BANNER=true
```

**Background jobs.** Extraction runs inline when a seller submits (so they land
on their review screen with results) and payment callbacks are resolved by the
action that started them, so the demo works without a worker. `npm run worker`
runs the queue continuously if you want it draining in the background; failures,
retries and dead letters are visible at `/admin/jobs` either way (admin only).

---

## 7. Tests

```bash
npm test          # Vitest — 67 tests
npm run test:e2e  # Playwright — the three critical paths
```

`tests/unit/calculators.test.ts` covers the financial logic: the no-overprice
invariant at the boundary (including a float-precision case), the fee
computation read from config, installment-schedule reconstruction closing
exactly on the total price, expected-paid-to-date, outstanding balance, total
effective cost with and without a developer comparison, affordability across
payment frequencies, and the brief's own cancellation worked example.

`tests/unit/invariants.test.ts` runs against the seeded database and proves the
guarantees hold **in the system**: no listing anywhere asks above its verified
amount paid; `approveAndPublish` refuses an unverified file and rolls its own
signature back; every published listing has an analyst, five approved images and
every required verified field; every verified field names the analyst who
promoted it and that person really holds the role; sources are preserved
alongside the verified value; milestones never complete out of order; money
milestones never close without a settled payment.

`tests/e2e/critical-paths.spec.ts` drives the browser: seller intake →
resumable draft → analyst queue; analyst review workspace → publish gate refuses
→ published listing renders with provenance; buyer signs in → over-asking offer
refused → at-asking offer persists and notifies the seller. Plus cross-role
access denial and Arabic RTL.

---

## 8. Where things live

```
prisma/
  schema.prisma            the domain model
  seed/                    the demo marketplace builder
src/
  app/
    [locale]/              every page, under next-intl routing
      (marketing)/         landing, marketplace, opportunity detail, documents
      (auth)/              sign in, sign up + role fork
      seller/              dashboard, 6-step intake wizard, extraction review, offers
      analyst/             queue, review workspace, pipeline, policies, users, metrics, jobs
      buyer/               onboarding, matches, offers, saved
      deals/               deal room
      partner/             Phase-2 preview
    actions/               server actions — every mutation, authorised server-side
    api/                   signed file serving, uploads
  components/              design-system primitives + feature components
  lib/
    config.ts              every economic constant
    money.ts               the single EGP formatting authority
    domain/                pure calculators, contract-field provenance, national ID
    services/              reconciliation, fraud, valuation, matching, verification,
                           listings, offers, deals, payments, jobs, notifications
    providers/             AiProvider · PaymentProvider · KycProvider ·
                           NotificationProvider · StorageProvider (+ mocks)
    queries/               read models for the marketplace, opportunity and offers
    assets/ · docgen/      photography catalogue, plan drawing, document rendering
tests/
  unit/                    calculators + invariants
  e2e/                     the three critical paths
```

---

## 9. Read next

- **`ASSUMPTIONS.md`** — every judgement call, every mocked integration and what
  replacing it would take, and every place real-world input is still needed.
- **`ASSETS.md`** — image sources, licences, and exactly what the photography is
  and is not.

## 10. Deploy to Vercel

The app runs on Vercel unchanged, but it needs a Postgres of its own and one
ordering rule respected.

```bash
DATABASE_URL="postgresql://…" ./scripts/deploy.sh
```

That script does four things in an order that matters:

1. `prisma migrate deploy` against the target database.
2. **Deletes `./storage` and reseeds.** Storage keys embed the CUIDs of the rows
   that own them, so the seeded documents on disk and the rows in the database
   are a single artifact. Seeding a fresh database mints new CUIDs; a `storage`
   directory built for a previous one is orphaned, and every document in the
   analyst workspace 404s. Seed and upload must target the same database.
3. Sets `DATABASE_URL` on the project.
4. `vercel deploy --prod`.

What differs from a local run:

| | Local | Vercel |
|---|---|---|
| Seeded documents | read from `./storage` | bundled into the deployment, read through the same signed-URL route |
| Uploaded documents | durable | written to a temp overlay, lost when the instance recycles |
| Job queue | `npm run worker` | `/api/jobs/drain`, on a schedule, as a retry net only |

Uploading on a hosted demo is still real work — hashing, rasterising,
extraction, rows, audit events — but the bytes are not durable. Swapping
`StorageProvider` for S3/R2 fixes it without touching a caller.
See `ASSUMPTIONS.md` §3.13.

**A hosted demo is public and its demo accounts share a published password**, and
OTP codes are shown on screen because there is no SMS provider. That is fine for
synthetic data and wrong for anything else. Vercel's Deployment Protection puts
a password in front of the whole thing.
