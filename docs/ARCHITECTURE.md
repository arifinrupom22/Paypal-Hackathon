# PACT Architecture

PACT is an authorization boundary between autonomous purchasing agents and money movement. The
enclave owns verification and signing; the model only proposes.

```
 Agent / operator                PACT enclave                         PayPal
 ────────────────                ────────────                         ──────
 intent ──────────────▶  parse → owner review → sign mandate
 proposal (signed) ───▶  verify signature → policy engine → reserve budget
                                                              │
                                                              └──────▶ create order ──▶ buyer approval
                                                                        capture ◀──────────┘
                                                                           │
                                                              verify COMPLETED + amount
                                                              record settlement + audit
```

## Runtime

| Layer | Implementation |
| --- | --- |
| Web | Next.js 15 App Router, React 19 server components, client islands for mutations |
| API | Route handlers on the Node.js runtime; every response is `{ ok, data }` or `{ ok, error }` |
| Data | PostgreSQL 14+ through Prisma; `Decimal`/`NUMERIC(18,2)` for money, UTC timestamps |
| Crypto | Node `crypto`: Ed25519 (PKCS#8/SPKI), SHA-256 canonical JSON, AES-256-GCM agent key vault |
| AI | Gemini through the Vercel AI SDK with Zod structured output; deterministic fallback |
| Payments | PayPal Orders v2 REST (sandbox/production base URL from configuration), server-only OAuth |
| UI | Tailwind v4 token system, AG Grid Community, Recharts, Radix primitives |

## Authorization flow

1. **Mandate creation.** The wizard extracts a draft (`/api/mandates/parse`), the owner edits every
   field, confirms, and `POST /api/mandates` rebuilds the canonical payload server-side, signs it with
   the platform Ed25519 key, and persists the signature, hash and key id.
2. **Proposal.** An agent (or the payment console acting for it) creates a proposal. The amount,
   merchant, category and currency come from the database or the server-side proposal builder, never
   from model output.
3. **Evaluation.** `POST /api/policy/evaluate` loads mandate, ancestors, agent, proposal and approval
   snapshots inside a PostgreSQL transaction, takes `SELECT … FOR UPDATE` on the mandate, and runs the
   pure engine in `src/lib/policy/engine.ts`. The engine rebuilds the signed payload from persisted
   columns, verifies Ed25519, and returns structured checks.
4. **Reservation.** Only an `AUTHORIZED` decision creates a transaction row with unique execution and
   idempotency keys. Reserved amounts count against the mandate ceiling immediately.
5. **Payment.** `POST /api/payments/create-order` revalidates the transaction and mandate before asking
   PayPal for an order. The buyer approves in PayPal. Capture happens server-side and only records
   `SETTLED` after PayPal reports `COMPLETED` with the expected amount and currency.
6. **Audit.** Every sensitive mutation appends a hash-chained, Ed25519-signed audit event under a
   per-owner advisory lock.

PACT authorization and PayPal buyer approval are deliberately separate. A policy approval without a
verified capture is never displayed as a completed payment.

## Module map

```
src/app/api/*                 HTTP boundary: auth, validation, rate limits, response envelope
src/lib/auth/*                scrypt passwords, opaque sessions, CSRF, guards, ownership checks
src/lib/crypto/*              canonicalization, platform keys, agent key vault, payload builders
src/lib/policy/engine.ts      pure deterministic decision function (no I/O)
src/lib/services/*            transactional domain logic and persistence
src/lib/paypal.ts             server-only PayPal client and configuration
src/lib/ai/*                  model parsing/selection plus labelled deterministic fallbacks
src/lib/audit.ts              append + verify hash chain
src/components/*              server-rendered UI and focused client mutation islands
```

Business logic lives in services, not components. UI components call APIs and render returned data;
they do not compute authorization outcomes.

## Data model

| Entity | Purpose | Key constraints |
| --- | --- | --- |
| `User` | owner identity | unique email, scrypt hash |
| `Session` | opaque session | unique HMAC token hash, expiry, revocation |
| `Agent` | autonomous identity | owner FK, encrypted private key, parent agent, status |
| `Mandate` | signed spending authority | owner/agent FK, canonical hash, signature, expiry, status |
| `MandateScope` | merchant/category allowlist | normalized values, unique per mandate |
| `Proposal` | agent intent | signatures, mandate/agent FK, amount, currency |
| `PolicyDecision` | persisted decision | outcome, check list, failed ids, explanation |
| `Transaction` | reserved/settled execution | unique execution/idempotency keys, PayPal ids |
| `ApprovalRequest` | step-up hold | bound proposal, expiry, one decision |
| `AuditEvent` | evidence | previous hash, hash, signature, owner-scoped chain |
| `AttackRun` | security evidence | scenario, status, real outcome, checks, timing |

Money columns use fixed-point decimals; calculations use `decimal.js` through `src/lib/money.ts`.
Timestamps are stored and compared in UTC. Execution and idempotency identifiers are unique at the
database level, so retries cannot create a second charge.

## Delegation

A child mandate must be signed for an agent descending from the delegating agent, use a subset of the
parent's merchant/category scope, fit inside the parent's remaining budget and transaction count, and
expire no later than the parent. Revoking an ancestor marks descendants revoked; the engine also
re-checks the live ancestor chain at decision time. A child cannot escape its parent by presenting a
valid signature.

## Failure semantics

- Missing signing keys → explicit configuration failure, never unsigned authorization.
- Missing PayPal credentials → `503 CONFIGURATION_REQUIRED`; no simulated payment.
- Gemini failure/timeout (30s) → labelled deterministic parser/selector, with owner review required.
- Database unavailable → API `500` with a generic message; no fallback to in-memory authority.
- Duplicate execution/idempotency → blocked by persisted uniqueness and engine checks.
