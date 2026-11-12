# PACT Product Readiness & Engineering Review

Reviewed 2026-11-12 against a production build on `http://localhost:3000`, PostgreSQL 16 and the
signed-in scenario account. This document maps the competition requirements to implemented surfaces,
states exactly where the data comes from, and lists the remaining weaknesses.

## Payment integration status

PACT is **not claimed to be production payment-ready**. The complete PayPal Sandbox lifecycle cannot
be verified in this environment because `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and
`PAYPAL_WEBHOOK_ID` are all absent. Order creation fails closed with `503 CONFIGURATION_REQUIRED`;
no real PayPal order, buyer approval, capture or webhook is claimed.

| Category | Evidence |
| --- | --- |
| Implemented | Server-side order creation, buyer redirect, server-side capture, capture status/amount/currency verification, provider timeouts, atomic reservation locking, duplicate-submission guards, mismatch quarantine, reconciliation, release protection after an order exists, webhook signature verification, event deduplication, audit finalization |
| Verified against real PayPal Sandbox | **None.** Credentials and a public webhook callback are missing |
| Verified only with the loopback mock | Successful order → capture → `SETTLED`; duplicate order/capture rejection; matching webhook processed then deduplicated; forged signature rejected; amount mismatch retained for reconciliation; capture transport failure retained and retried successfully; cross-account and unauthenticated denial |
| Implemented and verified locally without PayPal | Amount/currency/capture-status checks, reservation release rules, webhook payload validation, signature-before-mutation ordering, unique PayPal ID/event constraints, owner-scoped payment routes, payment rate limits |
| Missing external dependencies | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, a public HTTPS callback for PayPal webhooks, and a funded Sandbox buyer account |
| Remaining payment limitations | No live buyer approval or live signature verification was exercised; `APP_URL` matches the local recording origin `http://localhost:3000`, but no public HTTPS origin exists; the PayPal sandbox buyer journey has not been completed |

The loopback mock is a test harness (`scripts/mock-paypal.mjs`), not a simulated production fallback.
It requires both `PACT_ALLOW_PAYPAL_MOCK=1` and a loopback `PACT_PAYPAL_MOCK_URL`; it must never be
enabled in a deployed environment. Its results are labelled as local-mock evidence throughout.

## Product surfaces added

| Requirement | Surface | Data source |
| --- | --- | --- |
| Authorization visualization | `/transactions/[id]` — seven-stage trace: AI proposal → mandate → agent permission → budget → policy → PayPal approval → capture | `Transaction`, signed `Proposal`, `PolicyDecision.checks`, `Mandate`, persisted PayPal fields |
| Permission hierarchy | `/agents/graph` — selectable parent/child graph with signed ceilings, scopes and authority containment | `Agent` hierarchy, signed `Mandate` rows, `MandateScope`, active `Transaction` spend |
| Security intelligence | `/security/intelligence` — decision trend, failure categories, replay/budget/merchant/step-up counts, revocation events and explanations | `PolicyDecision`, `AuditEvent(MANDATE_REVOKED)`, `AttackRun` |
| Cryptographic evidence | Mandate detail proof panel | Rebuilt canonical mandate payload, stored signature/hash, platform **public** key, verification result, status, expiry and revocation |
| Transaction risk explanation | `/decisions/[id]` — passed and failed checks, outcome, approval requirement, provider reachability | Stored `PolicyDecision.checks`, failed check IDs, explanation and linked transaction |
| Reproducible security testing | Security Center inspector + audit deep link | `AttackRun.response` (actual manipulated parameters), run checks, `SECURITY_TEST_EXECUTED` audit event |
| Payment operations | Payment Center and transaction actions: create order, capture, reconcile, release before an order exists | Persisted transaction state + server-side PayPal responses |
| Product polish | Loading skeletons for new routes, responsive grids, accessible stage/graph buttons, selected-row inspectors | — |

## Verified this run

| Check | Result |
| --- | --- |
| Production build | `npm run build`, exit 0, 19/19 pages generated |
| TypeScript | `npx tsc --noEmit`, exit 0 |
| ESLint | `npx eslint .`, exit 0 |
| Vitest | 3 files, 35/35 tests passed |
| Playwright | 3/3 passed in 42.9s |
| Product-surface assertions | 6/6 passed |
| Security scenarios | 8/8 `BOUNDARY_HELD` |
| API smoke | exit 0, `AUTHORIZED`, 17 policy checks |
| Audit chain (smoke account) | 30/30 valid, zero signature failures |
| Prisma schema / migrations | schema valid; 1 migration found; database schema up to date |
| Loopback mock payment lifecycle | PASS — see the mock evidence below |
| API secret-leak check | PASS — no agent credential ciphertext in mandate/agent responses |
| Light status contrast | 4.74:1 |

The product-surface script verified, with live rows:

1. delegation graph rendered and selected the child;
2. revoked parent and child both failed containment, with `withdrawn` shown;
3. security intelligence rendered real failure categories;
4. a denied decision explained 17 checks (16 passed, 1 failed);
5. a transaction trace rendered the budget-stage checks;
6. an attack’s audit deep link selected the corresponding `eventId`;
7. proof values and the fingerprint copy control stayed inside the viewport.

## Local mock payment evidence

`scripts/verify-payment-mock.mjs` ran against the production server on port 3102 with its only
provider dependency pointed at `scripts/mock-paypal.mjs` on loopback. It exercised PACT’s real API,
policy engine, PostgreSQL transactions, state machine and audit chain. The observed assertions were:

- order created with status `CREATED` and an approve URL;
- capture returned `SETTLED`, `40.00 USD`, with a capture id;
- a second capture returned `409 ALREADY_CAPTURED`;
- a second order for the same transaction returned `409 ORDER_EXISTS`;
- a verified webhook was processed, then the same event was `duplicate`;
- a forged signature returned `400 WEBHOOK_REJECTED` before mutation;
- a captured amount mismatch returned `409 CAPTURE_AMOUNT_MISMATCH`; retry required reconciliation,
  release was refused, and reconcile refused to settle;
- a failed provider capture was recorded as unconfirmed/reserved, then a retry settled successfully;
- another account received `404` for both order and capture access; an unauthenticated request
  received `401`;
- the mock account’s audit chain was valid (19/19 signatures, zero failures).

This does not establish that PayPal itself behaves the same way. It establishes PACT’s fail-closed
handling around a provider contract.

## Engineering review

**Fintech lens.** Money remains `NUMERIC(18,2)`/`Decimal`; authorization and reservation are one
PostgreSQL transaction under a mandate row lock. The trace reads the historical decision rather than
re-evaluating it, so it is an evidence view, not a second authority. PACT authorization, PayPal order
creation and settled capture are separate persisted states. A capture is accepted only after PayPal
reports `COMPLETED` with the expected amount, currency and capture id.

**Security lens.** Payment and trace routes are owner-scoped server reads/mutations. Public-key
material is passed to the browser; private signing material and PayPal credentials are not.
Delegation containment includes parent and child status/revocation. Webhooks verify the PayPal
transmission signature before business mutation, persist rejected events, and use a unique event id
to close duplicate races. A mismatch keeps the reservation and blocks ordinary release until
reconciliation.

**AI-agent lens.** The proposal stage displays the agent-signed intent, canonical hash and raw model
instruction as untrusted data. The sequence makes clear that text and model output never become
authority; only the deterministic engine can advance the flow.

**Competition-judge lens.** The main claims are reproducible: scenarios are executable, their input
and engine response are visible, each links to an audit event, and the eight adversarial outcomes are
captured. Screens use real decisions and payments rather than sample charts.

## Remaining weaknesses / limitations

- **PayPal Sandbox is not live-verified.** All three PayPal variables are missing. The local mock
  cannot prove real merchant setup, buyer approval, capture settlement or webhook certificate
  verification. No production payment claim is made.
- **Callback origin is local.** `APP_URL` now matches the local recording origin
  `http://localhost:3000`. A public HTTPS origin is still required before a real approval run.
- **No two-account browser isolation test.** Every query is owner-scoped; cross-account API access was
  exercised (`404`), and unauthenticated access returns `401`, but a second-account browser journey
  was not run.
- **Webhook coverage is bounded.** The local mock exercised matching, duplicate, forged and
  amount-mismatch events. Live certificate-chain verification and public callback delivery remain
  untested.
- **Abandoned orders need an operator action.** A buyer who abandons after order creation cannot
  release locally; the UI offers reconciliation against PayPal order evidence. A scheduled
  reconciliation worker is not included.
- **Security intelligence window is bounded.** It aggregates up to 2,000 decisions from the last 30
  days; older decisions are outside the displayed charts.
- **Containment display is explanatory.** It compares signed ceilings/status/scope; the authoritative
  remaining-budget and lineage checks remain in `src/lib/policy/engine.ts`.
- **No scheduled retention or external timestamping.** Audit integrity is application-level hash
  chaining and signatures in PostgreSQL, not immutable off-site storage.
- **Gemini latency/availability.** Live extraction was observed at ~20s and a 503 fallback occurred
  during one browser run; the deterministic fallback is labelled and remains usable.
- **No git repository** exists in this workspace, so no commit was produced.
