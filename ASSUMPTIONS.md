# ASSUMPTIONS

Every judgement call made building this MVP, every mocked integration and what
replacing it would take, and every place real-world input is still needed.

---

## 0. Missing inputs I proceeded without

The brief referenced files that were not present on disk. I recorded the gap and
kept building rather than stalling, as instructed.

| Referenced | Status | What I did |
|---|---|---|
| `SKILL (3).md` — the `web-design-engineer` skill | **Present, followed** | Ran the Design Read, the five dials and the design-system declaration; applied the anti-cliché rules (no purple→pink gradients, no emoji as icons, no left-border accent cards, no Inter/Roboto as display, no AI-drawn SVG people, no fabricated stats or logo walls) |
| `references/design-calibration.md`, `failure-patterns.md`, `block-library.md`, `advanced-patterns.md`, `style-recipes/*` | **Absent** | No `references/` directory exists next to the skill file. Proceeded on the SKILL.md content alone, as the brief instructs |
| The `dataviz` skill | **Absent** | Charts are hand-built SVG/CSS with a high data-ink ratio: colour encodes meaning (verified / pending / flagged), never decoration. No chart library is bundled |
| `Aqary_Project_Description.md` | **Present, followed** | Every market figure on the marketing site traces to it, with its caveats intact |

### One conflict in the source material

`aqary_source_data.md` (the founder's own site copy) states a **2%** buyer fee.
`AQARY_MASTER_PROMPT.md` and `Aqary_Project_Description.md` both state **1.25%**.
The original build followed the master prompt at `PLATFORM_FEE_BPS = 125`.

**Resolved in Phase 1 (public product): the fee is 2%.** The Phase 1 brief
states it directly — "The buyer success fee is 2%, NOT 1.25%" — which settles
the conflict in favour of the site copy. `PLATFORM_FEE_BPS` is now `200` in
`src/lib/config.ts`, `.env` and `.env.example`, and nothing anywhere reads a
percentage literal: every public and internal surface, the FAQ answers and the
fee page all render `config.PLATFORM_FEE_BPS / 100`.

Because `discountPctBps` on a listing is a cached saving against the developer's
price today, it depends on the fee and goes stale on an already-seeded database
when the constant changes. `npm run reproject` re-derives it (and the other
projected columns) in place, without minting new CUIDs — see
`scripts/reproject-listings.ts`. A fresh `npm run setup` needs no such step.

### The design checkpoint

The brief specifies one checkpoint — design system declaration plus v0, then
autonomy. This ran as a background job with no interactive channel, so I made
the call, documented it here, and kept building rather than stalling the run.
The direction is recorded in §1 below and every colour, type step, space, radius
and shadow is a token in `src/app/globals.css`, so changing direction is a token
edit rather than a rewrite.

---

## 1. Design direction (the declaration that would have been Checkpoint 1)

**Design Read**

```yaml
artifact:            marketing site + four role-specific product surfaces
audience:            Egyptian contract holders needing liquidity; buyers seeking
                     entry at an older contractual price; internal verification analysts
visual-language:     Information Architecture school × Modern Tool SaaS —
                     the seriousness of a financial instrument with the clarity
                     of a well-made product
mode:                greenfield
visual-variance:     4    (restraint; this is a money product)
motion-intensity:    3    (count-ups, timeline fills, ≤250ms transitions)
information-density: 8    (term-sheet density for contract data)
asset-dependence:    8    (property photography carries the emotion)
brand-fidelity:      2    (no identity exists yet — see §7)
```

**The system**

- **Palette** — a warm paper ground (`oklch(0.978 0.006 85)`), a deep desaturated
  green-black institutional ink (`oklch(0.215 0.019 168)`), one brass accent for
  action and money emphasis (`oklch(0.665 0.107 71)`), one verdigris for verified
  state (`oklch(0.505 0.086 172)`), plus a semantic set for
  `verified` / `pending` / `flagged` / `info`. Four colours and semantics.
  Everything derived with `oklch()`.
- **Typography** — **Newsreader** for display (a serif with real editorial
  character, not Inter/Roboto/system-ui), **IBM Plex Sans** for text with true
  tabular figures, **IBM Plex Mono** for references and provenance chips, and
  **IBM Plex Sans Arabic** as a first-class partner optically matched to the
  Latin face. Money always renders with `tabular-nums lining-nums` so EGP figures
  align in columns.
- **Type scale** — h1:body ratio of roughly 5.9×. Financial figures have their
  own scale; "cash to seller" reads at hero size on a card.
- **Structural signature** — the **hairline rule**. Contract data renders at
  term-sheet density against generous whitespace elsewhere: a bank statement
  rendered beautifully. The **provenance chip** is the repeated motif that ties
  every surface together.
- **Radius / shadow** — small consistent radii (2/3/5/8/12px); shadows only for
  genuine elevation, never decoration.
- **Motion** — count-ups on reveal, timeline fills, pipeline sequencing,
  ≤250ms page transitions, `prefers-reduced-motion` honoured globally.

Every one of these is a CSS custom property in `@theme`. No component contains a
raw hex value.

---

## 2. Mocked integrations, and what replacing each one takes

Every mock sits behind an interface in `src/lib/providers/types.ts`. Calling code
never knows which implementation it has.

### 2.1 Document intelligence — `AiProvider`

- **Mock** (`ai/mock.ts`, the default): receives the real uploaded document,
  reads the `.truth.json` sidecar the document generator wrote, and returns
  per-field values with confidence, document id, page and bounding box.
  Deterministic per document, varied across documents, and it disagrees with the
  seller often enough to generate real discrepancies. Where no sidecar exists (a
  seller uploading their own PDF) it degrades to a noisy read of the declared
  values at the low confidence a weak OCR pass would give.
- **Live** (`ai/live.ts`): the Anthropic Messages API with a JSON-schema tool,
  `claude-opus-5` for extraction. Already written. Enable with `AI_MODE=live`,
  `ANTHROPIC_API_KEY`, and `npm i @anthropic-ai/sdk`.
- **To replace:** nothing in the pipeline changes. `runExtractionPipeline()`
  calls `ai()` and does not care.
- **Not implemented:** PDF rasterisation. PDFs upload and are served, but their
  pages are not rendered to images, so the extraction engine and the analyst
  viewer see only images. Adding `pdfjs-dist` or `pdftoppm` in
  `uploadDocument()` would close this — it is one function.

### 2.2 Payments — `PaymentProvider`

- **Mock** (`payment/mock.ts`): Paymob/Fawry-shaped. Decides success or failure
  (deterministically per idempotency key, ~90% success, or forced by the demo
  controls) and **nothing else**. The application does the rest for real: the
  `Payment` record, the signed instruction reference, the idempotency key, the
  `INITIATED → PROCESSING → SUCCEEDED/FAILED` transitions, the webhook-shaped
  callback, the failure path, the milestone block, the retry as a **new attempt
  with a new key**, and the audit events.
- **To replace:** implement `createIntent` / `resolveIntent` against Paymob or
  Fawry and register it in `providers/index.ts`. The deal workflow does not
  change.
- **Not implemented:** a real escrow or settlement account. Deposits are modelled
  as `Payment` rows with a settlement semantic, not held anywhere. Real money
  movement needs a PSP contract, a client-money account and the regulatory
  position that goes with it.

### 2.3 KYC — `KycProvider`

- **Mock** (`kyc/mock.ts`): the checks that can genuinely be done locally are
  real — the Egyptian national-ID mod-11 checksum, date-of-birth and governorate
  derivation, document presence, Arabic name shape. The civil-registry lookup is
  simulated and labelled as such in its own result payload.
- **To replace:** point `verifyIdentity` at an identity bureau. The resulting
  `kycStatus` and buyer tier are already real state.

### 2.4 Notifications — `NotificationProvider`

- In-app `Notification` rows are **always real**. Only the outbound leg
  (WhatsApp / SMS / email) is simulated, and each simulated send is recorded as
  its own row with a `SIMULATED_DELIVERED` status so the ops console can show
  what would have gone out.
- **To replace:** implement `send` against WhatsApp Business, a bulk SMS gateway
  and an email provider.

### 2.5 Storage — `StorageProvider`

- Local filesystem under `./storage`, behind signed, expiring, access-logged
  URLs. An S3-compatible implementation is a drop-in: the interface is four
  methods.
- **Not implemented:** virus scanning. `Document.virusScanned` exists and is a
  stubbed hook.

### 2.6 Background jobs

- A persisted `Job` table with an in-process runner: retry, exponential backoff,
  dead-lettering and per-job status visible at `/admin/jobs`. No Redis, no
  BullMQ — deliberately, per the brief.
- Extraction runs inline on submit (so the seller lands on their review screen
  with results) while remaining a job, so a failure retries and is visible.

### 2.7 Developer NOC

- Modelled as a milestone with an owner, a due date and required documents. There
  is no integration with any developer's systems, because none is available.

### 2.8 Developer partnership contact — `PARTNERSHIPS_EMAIL`

- The public `/for-developers` page's primary action, "Discuss a partnership",
  is a `mailto:` link. There is no contact form, no CRM and no inbox behind it:
  building one would have meant inventing backend functionality, and routing it
  to the authenticated `/partner` workspace would have been worse, since a
  developer without an account cannot reach that.
- It defaults to `partnerships@aqary.example`. `.example` is IANA-reserved and
  permanently undeliverable — deliberately, so an unconfigured deployment cannot
  present itself as a live inbox. **Mail sent to the default address goes
  nowhere.** Setting `PARTNERSHIPS_EMAIL` to a real address is the whole of what
  it takes to make this action work.

### 2.9 Content that lives in the database in English only

- `Project.city` / `Project.area`, `Unit.view`, `MediaAsset.caption`,
  `Valuation.method` and its driver notes, and
  `DeveloperAssignmentPolicy.requiredDocuments` have no Arabic column.
- Where the value is a closed set the UI translates it at the presentation layer
  (`city`, `view`, `roomTag`, `deliveryStatus`, `installmentKind`, `exitReason`,
  `assignmentStatus` namespaces in `src/messages`), and the gallery renders a
  localised equivalent of the caption rather than the stored English.
- Where the value is free prose — the valuation method, the driver notes, and a
  developer's required-document list — it still renders in English on an Arabic
  page. Translating it would mean either a schema change or inventing Arabic
  wording for a developer's own legal requirements, which is not something the
  presentation layer should fabricate. Real Arabic content belongs in the data.

---

## 3. Domain judgement calls

1. **Asking cash is capped, not just validated.** The moment an analyst promotes
   `AMOUNT_PAID` to verified, `verifyField()` clamps the listing's asking cash to
   that figure and audits the change. A seller cannot end up asking above what
   they have provably paid even if they set a higher figure while unverified.

2. **Buyer fee basis.** The 2% is charged on **total contract value**, per
   §2.1 of the brief — not on the cash transferred. This is visible in every
   cost breakdown before an offer is made.

3. **Maintenance and club dues are shown but excluded from the transfer price.**
   They are real obligations but they are not part of what is being assigned, so
   the total-cost calculator itemises them with a toggle rather than burying them
   in the headline.

4. **`Listing` carries a read model.** The buyer-facing columns
   (`verifiedAmountPaid`, `outstandingBalance`, `installmentAmount`, …) are a
   projection written **only** by `projectVerifiedReadModel()` from promoted
   verified values, so the marketplace can filter and sort against real indexes.
   `ContractField` remains the source of truth; the projection can be rebuilt
   from it at any time.

5. **Receipts only count once verified.** Pending receipts are evidence, not
   proof. The receipt-derived amount paid sums `VERIFIED` receipts alone, which
   is why the reconciliation panel can show a genuine gap.

6. **Discrepancy tolerance** is 0.5% or EGP 5,000, whichever is larger, with
   severity at 1% / 3% / 8%. All in `config.ts`. These are my numbers and want a
   real operator's judgement.

7. **`RECEIPT_TOTAL_MISMATCH` only fires once every receipt has been reviewed.**
   Coverage is not judgeable mid-review, and firing early produced noise that
   would have trained analysts to ignore the signal.

8. **Signals close themselves when the evidence changes.** A fraud scan that no
   longer raises a signal auto-dismisses the stale one with a note on the record,
   rather than leaving a permanently open flag an analyst has to clear by hand.

9. **A third media category: `SHOW_UNIT`.** The brief asks for `Actual photos` vs
   `Developer renders`. Egypt's market has a real third case — the developer's
   show unit, which is a genuine photograph but not of *this* unit. Calling it a
   render would be wrong and calling it an actual photo would be worse, so it is
   its own `MediaKind`, labelled on every card and gallery. The seed contains no
   `RENDER` rows at all because no genuine computer-generated renders were
   available; the kind exists and the analyst review handles it.

10. **Buyer identity is masked until the reservation deposit clears.** Sellers see
    a first name, a tier, readiness and whether proof of funds is on file — never
    contact details — until money is committed.

11. **The valuation anchors on the developer's list price for the unit** when one
    exists, then discounts for the secondary market and the remaining time to
    handover. Re-applying floor/view/finishing premiums on top of a price that
    already embeds them produced valuations *above* what you could buy the same
    unit for today, which is nonsense. It is never a single-point number.

### 3.12 Routing and locale

Two decisions worth recording, both made after they caused real bugs:

- **`localePrefix: "always"`.** Every URL carries its locale — `/en/opportunities`,
  `/ar/opportunities`. Un-prefixed paths are redirected by the middleware into
  the visitor's remembered locale rather than 404ing. An Aqary URL is something
  people paste to each other; an un-prefixed path is one more way to land in the
  wrong language silently.
- **Every server-side `getTranslations` takes an explicit locale.** A layout and
  its page render concurrently in React Server Components, so a page could ask
  for translations before the layout had established the segment locale, and
  next-intl would fall back to English — producing an Arabic-direction page full
  of English copy. Passing `{ locale, namespace }` from the route's own params
  removes the ordering dependency entirely. The shared chrome (`SiteHeader`,
  `SiteFooter`, `WorkspaceShell`) takes `locale` as a prop for the same reason.

A related trap, fixed and worth knowing about: the middleware matcher is a
JavaScript **string**, so `\.` collapses to `.` and turns the negative lookahead
into `.*..*` — which matches nearly every path and silently disables the
middleware. It needs `\.`. The comment in `src/middleware.ts` says so.

---

### 3.13 Hosted deployment: a read-only filesystem

The product stores evidence on a local filesystem behind `StorageProvider`.
Serverless hosts mount the deployment read-only and give you only the OS temp
directory to write to, which splits storage in two:

- **Reads** come from the bundle. The seeded contracts, receipts and developer
  statements ship inside the deployment (`outputFileTracingIncludes` in
  `next.config.ts`, because the keys live in the database and no static
  analysis can find them). They are still never public: every read goes through
  the signed-URL route, which authorises it and writes a `DocumentAccessLog`.
- **Writes** go to a temp overlay that is searched ahead of the bundle.

Three consequences, and they are the host's, not the model's:

1. **A document uploaded on the hosted demo can disappear.** It survives only as
   long as that instance. Uploading is real — it hashes, rasterises, extracts
   and writes rows — but the bytes are not durable. Pointing `StorageProvider`
   at S3/R2 removes this without changing a single caller.
2. **The overlay shadows, it does not overwrite.** Writing a key that exists in
   the bundle leaves the bundled original byte-for-byte intact, and deleting the
   overlay copy brings it back. Evidence is never destroyed by a redeploy.
   `tests/unit/storage-readonly.test.ts` pins all of this.
3. **Storage keys embed row CUIDs, so the seed and the storage directory are one
   artifact.** Seeding a fresh database mints new CUIDs and orphans any
   previously generated `./storage`. `scripts/deploy.sh` therefore always
   reseeds and regenerates storage against the database it is about to deploy
   against. Doing those two steps out of order 404s every document in the
   analyst workspace.

There is also no long-running process to drain the job queue. Nothing on the
critical path needs one — extraction runs inline on submit and payment callbacks
resolve in the action that starts them — so the queue runner is exposed at
`/api/jobs/drain` (guarded by `CRON_SECRET`) and called on a schedule as a
retry safety net rather than as the mechanism.

## 4. Security and privacy: what is implemented, what is documented only

**Implemented**

- Server-side authorization on every page, action and route handler; the client
  never asserts a role. Denials write an `ACCESS_DENIED` audit event.
- Session tokens are hashed before storage; the raw token only ever exists in an
  httpOnly, sameSite cookie.
- Documents are never served from a static path. Every read goes through a
  signed, expiring URL or an authenticated authorization check, and every read
  writes a `DocumentAccessLog` row.
- Document pages shown to buyers are watermarked with the viewer's own identity.
- EXIF is stripped from every uploaded image on the way in.
- OTP rate limiting (3 per minute per number), attempt limiting (5), and
  10-minute expiry.
- Consents are individually timestamped rows with IP and user agent.
- `AuditEvent` is append-only: nothing in the codebase updates or deletes one.
- National IDs are masked by default in the analyst console; revealing one is a
  deliberate click.
- PII is never logged. The notification mock masks recipients before printing.

**Documented, not implemented** — these need real infrastructure decisions:

- **Field-level encryption at rest** for national IDs and document contents.
  Postgres TDE or application-level envelope encryption with a KMS.
- **Automated retention and erasure.** There is no retention clock and no
  right-to-erasure workflow. `deletedAt` exists on `User` and is respected on
  read, but nothing purges.
- **A lawful-basis register** and a DPIA for processing national IDs and
  financial records.
- **CSRF.** Next.js Server Actions carry origin checks, but there is no explicit
  token layer for the two route handlers.
- **Penetration testing, WAF, rate limiting at the edge.**
- **Virus scanning** on upload.

---

## 5. Explicitly out of scope

Per §15 of the brief: horizontal scale, multi-region, CI/CD, observability
stacks, live third-party accounts, penetration testing, formal compliance
certification. Also not built:

- Saved-search **alert delivery** on a schedule. Saved searches store real
  filters and real last-run counts, and re-run on demand; nothing sweeps them
  hourly.
- Offer expiry runs **on read** (every marketplace and offers query sweeps due
  offers) rather than from a cron.
- The **developer-partner portal is a preview**: it renders from real data, is
  labelled a Phase-2 preview, and has no NOC approve/reject write path, because
  no developer integration exists to write to.
- **Predictive default intelligence does not exist.** The partner page shows
  what the transaction record already contains — stated exit reasons and
  outstanding exposure — and says so in as many words.

---

## 6. What still needs real-world input

Nothing below can be resolved by writing more code.

1. **Legal review of the assignment flow.** Who signs what, in what order, and
   what Aqary's position is when a developer refuses an NOC after a deposit has
   been taken.
2. **PSP contract and client-money handling.** Paymob or Fawry, plus the
   regulatory position on holding a reservation deposit.
3. **Developer partnerships.** Every assignment policy in this build is
   synthetic. Real fee schedules, waiting periods, minimum-paid thresholds and
   NOC turnarounds must come from each developer.
4. **Actual assignment fee schedules.** Same, specifically: they drive the
   buyer's total cost, which is the number the whole product turns on.
5. **Brand identity.** The wordmark is a placeholder — see §7.
6. **Real property photography** from sellers. The seeded photography is real
   architecture, but not of the seeded units; see `ASSETS.md`.
7. **Valuation inputs.** Developer price benchmarks and comparable resales are
   synthetic. A real valuation needs a real price feed.
8. **Arabic legal copy.** The contract clause text in the generated documents is
   plausible Arabic contract language written for this build. Real terms and
   conditions, listing agreements and privacy notices need a lawyer.
9. **The verification SLA and analyst capacity model.** 48 hours and the 25-minute
   per-file target come from the brief; they want validating against a real
   operation.
10. **Cancellation penalty percentages.** 10–15% comes from the founder's own
    material. Real percentages vary by contract and must be read from each one.

---

## 7. The wordmark is a placeholder

Aqary has no visual identity. `src/components/chrome/wordmark.tsx` is a
considered typographic treatment — a contract's folded corner cut into the mark —
standing in for one. It is flagged here, in `ASSETS.md` and in the site footer.
**It must be replaced by real brand work before any public use.**

---

## 8. Known limitations

- **PDF pages are not rasterised** (see §2.1). A PDF uploads, stores and serves,
  but the extraction engine and the analyst viewer see no pages for it. Every
  seeded document is rendered as images, so this is invisible in the demo and
  would bite immediately in production.
- **Bedroom and bathroom photography repeats across listings.** The catalogue has
  66 verified photographs, and interiors of those rooms are the thinnest
  category. Galleries never repeat a shot *within* one listing, but two listings
  can share one.
- **The map is schematic.** Pins sit at real project coordinates under an
  equirectangular projection and clustering is computed for real, but no tile
  provider is used and the map draws no coastline. It is labelled schematic.
- **Floor plans are generated, not architectural.** They are drawn from each
  unit's own record — bedroom count, areas, orientation — so they match the
  listing, and every drawing says on its face that it is schematic.
- **The deal assistant's retrieval is lexical.** In mock mode it scores term
  overlap over the deal's verified documents and returns the best-matching
  passage with its page. It is honest about not knowing. `AI_MODE=live` routes the
  same corpus through the model with a hard "NOT_STATED" instruction.
- **Analyst media review cannot yet detect a mislabelled render.** It surfaces
  the seller's own declared kind and asks the analyst to check it. Automated
  render detection would need a model.
- **No pagination on the analyst queue or the policy library.** Both are fine at
  seed scale and would need it beyond a few hundred rows.
- **The analyst document tab strip does not collapse.** A file with twenty-odd
  receipts wraps to several rows above the viewer. It works, but it wants a
  grouped or scrollable treatment.
- **`daysListed` reads as 0 on seeded listings** because they all publish during
  the seed run. It is computed from `publishedAt`, so it is correct — just
  uninteresting until the data ages.
