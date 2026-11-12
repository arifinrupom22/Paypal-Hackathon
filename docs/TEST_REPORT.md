# PACT Test Report

Execution date: 2026-11-12. Target: production build (`next build` + `next start -p 3000`) against
local PostgreSQL 16 (`pact-postgres`). Node 24, Next.js 15.5.28. The loopback PayPal-contract mock
was run separately on port 3104 during the security verification pass. Results below were rerun
against the current tree; earlier evidence is not reused as a claim.

## Commands and results

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | exit 0 |
| Lint | `npx eslint .` | exit 0 |
| Unit/integration | `npx vitest run` | 3 files, 35 tests passed |
| Production build | `npm run build` | compiled successfully, 19/19 pages generated |
| Browser journeys | `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test` | 3/3 passed (42.9s) |
| Product surfaces | `PROBE_EMAIL=… PROBE_PASSWORD=… BASE_URL=http://localhost:3000 node scripts/verify-product-surfaces.mjs` | 6/6 assertions passed |
| API smoke | `BASE_URL=http://localhost:3000 node scripts/smoke.mjs` | exit 0; 17 policy checks; audit chain 30/30 valid |
| Security scenarios | `BASE_URL=http://localhost:3000 node scripts/verify-scenarios.mjs` | 8/8 `BOUNDARY_HELD`; 0 failures |
| Prisma schema | `npx prisma validate` | valid |
| Migrations | `npx prisma migrate status` | 1 migration found; database schema up to date |
| Local payment mock | `BASE_URL=http://localhost:3104 node scripts/verify-payment-mock.mjs` | PASS; all script assertions; audit chain 19/19 |
| Gemini parse probe | `BASE_URL=http://localhost:3101 node scripts/probe-parse.mjs` | HTTP 200, engine `gemini`, model `gemini-3.5-flash`, ~20s |
| Light status contrast | `node scripts/verify-light-contrast.mjs` | 4.74:1 for the 10px HELD badge (passes 4.5:1) |

## Playwright journeys

1. **Owner onboarding and mandate signing.** Register → dashboard → register agent → extract intent
   with Gemini → review/edit → confirm → Ed25519-signed mandate → mandates list → signed export with
   matching mandate id, hash and signature. Also verifies public-key proof fields, the delegation
   graph route and the empty security-intelligence state.
2. **Theme persistence.** Dark default → toggle light → survives reload → toggle back to dark.
3. **Security lab.** Execute a scenario against the live engine → `BOUNDARY_HELD` → 0 failures →
   audit-evidence link is present.

## Final presentation verification

- The production app was served at `http://localhost:3000` with `APP_URL=http://localhost:3000`, so
  the local browser origin and the configured origin match.
- Authentication, dashboard rendering, mandate detail proof, agent detail, payment proposal
  generation, policy authorization, transaction trace, security intelligence, decision explanation,
  delegation graph, audit deep link and settings all returned HTTP 200 with no page errors.
- `scripts/prepare-recording.mjs` created a fresh account through the real APIs, signed a mandate,
  authorized a `$38.00` proposal with 17 checks, and ran all eight scenarios with zero failures.
- A live Payment Center submission for the Northline renewal mandate returned `AUTHORIZED` with the
  PayPal checkout link disabled behind the missing-credentials notice.
- The recording account’s audit chain verified at 61/61 records with zero signature failures.

## Product-surface assertions

`verify-product-surfaces.mjs` ran against the populated scenario account and asserted:

1. the delegation graph renders and the child node shows **withdrawn** authority when its parent and
   itself are revoked, with parent/child authority checks failing;
2. security intelligence renders real failure categories and counts;
3. a denied decision page lists passed and failed checks (16 passed / 1 failed in the verified case);
4. a transaction trace renders the budget stage from the stored decision;
5. an attack's audit deep link selects the exact `eventId` in the attestation inspector;
6. the fingerprint copy control stays inside the 1,440px viewport on the mandate proof panel; no
   horizontal page overflow on graph, intelligence, decision, trace or proof pages.

## Security scenario results

All runs persisted to `AttackRun` with the real decision, checks and duration.

| Scenario | Outcome | Boundary |
| --- | --- | --- |
| Budget manipulation | `BLOCKED` | held |
| Prompt injection | `BLOCKED` | held |
| Execution replay | `BLOCKED` | held |
| Merchant substitution | `BLOCKED` | held |
| Forged approval | `REQUIRES_USER_APPROVAL` | held |
| Expired mandate | `EXPIRED` | held |
| Revoked parent | `REVOKED` | held |
| Concurrent spending | 2 authorized / 2 blocked, $80 of $100 ceiling | held |

## API smoke

- Registration, agent registration, mandate creation and proposal creation: 201.
- Policy evaluation: `AUTHORIZED`, 17 checks.
- PayPal order without credentials: `503 CONFIGURATION_REQUIRED` (expected and not treated as a pass
  for payment).
- Release reservation before an order exists: 200.
- Capture after release: `409 TRANSACTION_NOT_CAPTURABLE`.
- Unverified webhook: `400 WEBHOOK_REJECTED`.
- Unauthenticated payment request: `401 UNAUTHENTICATED`.
- Analytics, audit and transaction reads: 200.
- Audit chain: 30/30 records checked, valid, zero signature failures.
- Prisma migration state: one initial migration, database schema up to date.

## Payment lifecycle: local mock only

The application itself was not modified to use a mock by default. `scripts/verify-payment-mock.mjs`
ran against a production server started with `PACT_ALLOW_PAYPAL_MOCK=1` and a loopback
`PACT_PAYPAL_MOCK_URL`; all other dependencies were real. The mock serves the PayPal REST contract
only. This is **not** evidence of a successful PayPal Sandbox lifecycle.

| Exercise | Observed result |
| --- | --- |
| Order creation | `CREATED`, approve URL, sandbox environment |
| Capture with exact amount/currency | `SETTLED`, `40.00 USD`, captured id persisted |
| Replay capture | `409 ALREADY_CAPTURED` |
| Duplicate order | `409 ORDER_EXISTS` |
| Valid webhook, then same event | `processed`, then `duplicate` |
| Forged webhook signature | `400 WEBHOOK_REJECTED` before mutation |
| Captured amount mismatch | `409 CAPTURE_AMOUNT_MISMATCH`; retry requires reconciliation; release refused; reconcile refused to settle |
| Provider capture failure | transaction retained as unconfirmed; retry returned `SETTLED` |
| Cross-account payment access | `404` for order and capture |
| Unauthenticated payment access | `401` |
| Mock-account audit chain | 19/19 valid, zero signature failures |

The mock account’s audit chain and database rows were checked after the run. The mock is a loopback
test harness; enabling it in a deployed environment is unsupported.

## Security hardening verified in this pass

- Mandate and agent detail APIs are sanitized; a live API response check confirmed that agent
  `credentialCiphertext` is absent from both responses.
- Delegated mandates now reserve sibling ceilings against the parent, clamp child step-up thresholds
  to the parent threshold, enforce the parent per-transaction ceiling and transaction capacity, and
  re-lock the parent during creation.
- The policy engine checks every ancestor for revocation/expiry and blocks descendants when an
  ancestor agent is suspended.
- A webhook that was previously recorded as `REJECTED` can be reclaimed by a later correctly signed
  delivery of the same event, instead of being permanently blocked as a duplicate.
- The loopback PayPal mock uses unique order ids to exercise the database uniqueness guard correctly.

## Visual verification

Live captures were taken of dashboard, mandates, payments, security, settings, wizard, transactions
and audit in light mode, plus dark dashboard and dark security. Competition surfaces were also
captured: `light-authorization-trace.png`, `light-delegation-graph.png`,
`light-security-intelligence.png`, `light-decision-explanation.png` and
`light-mandate-proof.png`. AG Grid, Recharts, badges, focus states, empty states and populated states
were inspected. The dark theme tokens were not changed by the theme work. A proof-panel overflow
found in the first capture was fixed and re-verified.

## Verified integrations

- **Gemini:** live request returned structured intent. Because observed latency is ~20s, calls are
  bounded at 30s before the labelled deterministic fallback.
- **PostgreSQL/Prisma:** all journeys persisted and read real rows; atomic reservation and concurrent
  scenario exercised real row locking. The initial migration was baselined against the existing
  schema.
- **PayPal contract (loopback mock):** order, capture, mismatch, failure/retry, webhook success,
  duplicate, forged signature and ownership paths passed. This validates PACT’s adapter and state
  machine, not PayPal’s live service.

## Not verified in this environment

- **Real PayPal Sandbox order creation, buyer approval and capture.** `PAYPAL_CLIENT_ID`,
  `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID` are absent. PACT fails closed rather than fabricating
  a payment.
- **Real PayPal webhook delivery and certificate verification.** A public HTTPS callback and a real
  webhook id are required.
- **Live merchant/buyer configuration.** No Sandbox buyer journey or funding source was exercised.
- **Cross-account isolation in a browser.** API owner scoping and cross-account denial were tested;
  a two-account UI journey was not part of this run.
- **Security intelligence completeness.** The interface aggregates at most 2,000 decisions from the
  last 30 days; older rows are outside the displayed charts.

These are the only integration gaps. They are also listed in `docs/SECURITY.md` and the README.
