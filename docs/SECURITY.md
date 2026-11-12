# PACT Security Model and Threat Model

## Security objective

Only an owner-signed mandate can authorize an agent purchase, and only within the mandate's live,
non-revoked scope. The model, the browser, and the agent are not trusted to grant authority.

## Assets

- Platform Ed25519 private key (server environment only).
- Per-agent private keys (encrypted at rest with AES-256-GCM derived from `AUTH_SECRET`).
- Session tokens, CSRF tokens, password hashes.
- Mandates, proposals, policy decisions, transactions and audit evidence.
- PayPal client secret and webhook id (server environment only).

## Trust boundaries

| Boundary | Trusted side | Untrusted side |
| --- | --- | --- |
| Browser → API | authenticated owner session + CSRF | request body, query params, UI state |
| AI → policy | nothing | model output is advisory text/data only |
| Agent → enclave | agent public key | agent private key never leaves the encrypted vault |
| PACT → PayPal | server-side OAuth response, verified capture | browser redirect parameters |
| PayPal → webhook | signature verified with webhook id | event payload before verification |

## Controls

**Identity and sessions.** scrypt (N=16384) password hashing; opaque 256-bit session tokens stored as
HMAC-SHA256 hashes; httpOnly, SameSite=Lax cookies; 12-hour expiry; logout-all revocation; CSRF token
bound to the session id; same-origin check on mutations; in-memory per-IP rate limits on sensitive
routes. Every query is scoped by the authenticated owner id.

**Mandate integrity.** Canonical JSON with sorted keys and normalized decimals is SHA-256 hashed and
signed with Ed25519. Verification rebuilds the payload from persisted columns, so mutating a signed
column invalidates the proof. Signing happens only after explicit owner confirmation.

**Policy enforcement.** The pure engine checks signature, hash, owner binding, mandate status,
expiry, revocation (including ancestors), agent identity/status/lineage, proposal signature, amount
precision, currency, merchant and category allowlists, per-transaction ceiling, remaining budget,
transaction count, execution/idempotency uniqueness, delegation containment and step-up approval.
The client cannot choose the outcome.

**Atomic budgets.** Evaluation and reservation run in a database transaction with a row lock on the
mandate; the engine is re-evaluated inside the lock. Parallel proposals cannot overspend. Execution
ids and idempotency keys are unique columns. A released/cancelled reservation restores capacity.

**Delegation attenuation.** Child budgets, transaction counts, expiry and scope must be contained by
the parent; the agent must descend from the delegating agent. Parent revocation cascades and is
re-checked at decision time.

**Payments.** Order creation and capture are server-side and revalidate the mandate and agent. Capture
records settlement only after PayPal returns `COMPLETED` with a matching amount, currency and capture
id. A mismatch quarantines the transaction and retains the reservation; release is refused once a
PayPal order exists, and reconciliation uses PayPal order evidence. Webhooks are verified with the
configured PayPal webhook id before mutation and deduplicated by event id. An unverified or duplicate
event cannot settle a payment.

**Audit.** Per-owner `pg_advisory_xact_lock` serializes appends; each record hashes its canonical body
with the previous hash and is signed with the platform key. The audit page recomputes the chain and
signatures. This is hash-chained, signed application behaviour; the project does not claim
tamper-proof storage at rest or third-party immutability.

## Threat model

| ID | Threat | Control | Executable evidence |
| --- | --- | --- | --- |
| T-01 | Concurrent proposals exceed budget | row lock + re-evaluation inside lock + unique execution ids | `concurrent_spending`: 2 authorized / 2 blocked under a $100 ceiling |
| T-02 | Replay a consumed execution | unique execution id, persisted decision, replay check | `token_replay`: second evaluation `BLOCKED` |
| T-03 | Use a mandate after expiry | server-time expiry at decision time | `expired_mandate`: `EXPIRED` |
| T-04 | Mutate a signed proposal amount | payload rebuilt and signature verified | `budget_manipulation`: tampered proposal `BLOCKED` |
| T-05 | Substitute an unauthorized merchant | normalized merchant allowlist | `merchant_substitution`: `BLOCKED` |
| T-06 | Forge a step-up approval | approval must be persisted, bound, unexpired | `forged_approval`: `REQUIRES_USER_APPROVAL` |
| T-07 | Prompt injection overrides policy | model text is data; only signed proposal + mandate decide | `prompt_injection`: `BLOCKED` |
| T-08 | Child mandate escapes revoked parent | ancestor chain checked at decision time + cascade revocation | `revoked_parent`: `REVOKED` |
| T-09 | Cross-owner data access | owner-scoped queries and ownership checks | API returns `401` unauthenticated; cross-account payment routes returned `404` in the local mock run |
| T-10 | CSRF / cross-origin mutation | CSRF token bound to session + origin check | mutating requests without token are rejected |
| T-11 | Forged PayPal webhook | verify-webhook-signature with webhook id before mutation | loopback mock: `400 WEBHOOK_REJECTED`; live PayPal not verified |
| T-12 | Duplicate PayPal event | unique event id + attempts increment | loopback mock: second event returned `duplicate`; live PayPal not verified |

All eight attack-lab scenarios are executed through `/api/attacks/run` against the real engine and
persist the actual outcome, checks and timing. Results are never hardcoded in the UI.

## Explicit non-claims

- AI is not an authorization authority; prompt injection is mitigated by design, not “eliminated”.
- The audit chain is not claimed immutable against a database administrator.
- PACT authorization is not PayPal buyer approval and not proof of settlement.
- No compliance certification (PCI, SOC 2, etc.) is claimed.
- PayPal order creation, capture and webhook verification are implemented. A loopback contract mock
  exercised the state machine, but **real PayPal Sandbox behavior is not verified live** because
  sandbox credentials and a public callback are absent. The UI reports this state and refuses to
  fabricate a payment.
- Gemini parsing was verified live; its latency was measured at ~20s, so calls are bounded at 30s and
  fall back to the deterministic parser.

## Reporting a vulnerability

Do not open a public issue containing secrets or live payment data. Reproduce against a local sandbox,
include the request id/decision id where applicable, and redact session cookies, API keys and PayPal
credentials.
