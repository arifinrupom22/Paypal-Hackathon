# PACT — Judge Presentation

## 1. The problem

AI agents can now browse, select products and initiate purchases. Giving such an agent an unrestricted
payment credential turns a prompt-injection bug, a compromised tool, or a model mistake into
unbounded financial loss. A confirmation dialog is not a security boundary: it is UI state that an
automated agent can bypass or misreport.

## 2. Why existing AI commerce needs stronger authorization

Most agent payment flows collapse three different decisions into one:

1. the model decides what to buy;
2. the agent decides whether it is allowed;
3. the payment provider moves money.

PACT separates them. The model proposes. A deterministic policy engine evaluates. The owner grants
bounded authority in advance and explicitly approves exceptions. PayPal handles buyer approval and
settlement.

## 3. The solution

PACT is a permission layer for AI payments:

**AI proposes → PACT verifies → User authorizes → PayPal processes.**

The agent never receives a payment secret. It receives a signed identity that can submit proposals.
The owner receives a signed mandate that defines exactly what those proposals may do.

## 4. Architecture

```text
Agent / operator              PACT enclave                         PayPal
────────────────              ────────────                         ──────
intent ─────────────▶  parse → review → Ed25519-signed mandate
signed proposal ─────▶  deterministic policy engine → atomic reservation
                                                    │
                                                    └────▶ Orders v2 → buyer approval
                                                           capture ◀──────────┘
                                                              │
                                                    verify COMPLETED + amount
                                                    record SETTLED + signed audit
```

Key components:

- Next.js 15 / React 19 owner console.
- PostgreSQL + Prisma for owner-scoped state and fixed-point money.
- Node `crypto` for Ed25519 signatures, SHA-256 canonical hashing and AES-256-GCM agent key storage.
- A pure policy engine with structured pass/fail checks.
- PayPal Orders v2 with server-only OAuth and capture verification.
- A signed, hash-chained audit ledger.

## 5. User journey

1. Register an owner account.
2. Register an agent identity.
3. Describe a purchasing intent.
4. Review and edit the extracted mandate fields.
5. Explicitly confirm and sign the mandate.
6. Open the Payment Center.
7. The agent selects a catalog item and produces a signed proposal.
8. PACT evaluates the proposal and reserves budget atomically.
9. The owner completes PayPal buyer approval.
10. PACT captures server-side and records settlement only after exact verification.
11. The owner inspects the authorization trace, decision explanation and audit chain.

## 6. Mandate creation and approval

The mandate is the core instrument. It fixes:

- owner, agent and optional parent mandate;
- currency, total ceiling and per-transaction ceiling;
- transaction count and expiry;
- merchant and category allowlists;
- optional step-up threshold;
- whether delegation is allowed;
- a unique nonce and issue time.

The canonical payload is rebuilt from stored columns at verification. Mutating a signed field breaks
the hash/signature. A child mandate is clamped to the parent's approval threshold and must fit inside
the parent's remaining budget, transaction capacity, per-transaction ceiling, scope and expiry.

## 7. AI proposal evaluation

The model may parse an instruction or choose a catalog SKU. It cannot set the price, merchant record,
category or policy outcome used for authorization; those come from the database or server-side
proposal builder. The proposal is signed by the agent, and the deterministic engine decides.

## 8. Security enforcement

The engine returns structured checks covering:

- mandate presence, ownership and Ed25519 signature;
- revocation, status and expiry;
- agent identity, suspension and ancestor lineage;
- proposal signature and canonical hash;
- positive two-decimal amount and exact currency;
- merchant and category allowlists;
- per-transaction and remaining budget;
- transaction count and replay uniqueness;
- delegation parent/ancestor chain, scope, expiry, per-transaction ceiling, approval threshold,
  transaction capacity and agent lineage;
- step-up approval bound to the exact proposal.

A blocked proposal never becomes a transaction and never reaches PayPal.

## 9. PayPal payment lifecycle

`POLICY_APPROVED` is not a payment. PACT creates a PayPal order with a deterministic
`PayPal-Request-Id`. The browser receives an approval URL. After buyer approval, the return page calls
the server-side capture endpoint. PACT records `SETTLED` only when PayPal reports:

- order `COMPLETED`;
- capture `COMPLETED`;
- a capture id;
- the exact authorized amount;
- the exact authorized currency.

Webhooks are verified with the configured PayPal webhook id before mutation and deduplicated by event
id. A rejected verification can be reclaimed by a later valid delivery of the same event.

## 10. Attack scenarios and evidence

The Security Center executes eight scenarios against the real engine and stores the actual result:

1. budget tampering after signing → blocked signature;
2. prompt injection → text cannot grant authority;
3. execution replay → consumed identifier rejected;
4. merchant substitution → allowlist blocks;
5. forged approval → persisted approval required;
6. expired mandate → server-time expiry;
7. revoked parent → descendant invalidated;
8. concurrent spending → row lock serializes reservations.

Each run records its checks, duration and audit reference. The local loopback PayPal contract test
also covers duplicate order/capture, forged webhook, duplicate event, amount mismatch, retry and
cross-account denial. It is not a substitute for a real Sandbox transaction.

## 11. Technical innovation

- Cryptographic authority is separate from model output.
- Delegation is attenuated: child budgets, counts, scope, expiry, threshold and lineage are bounded.
- Active child ceilings are reserved against the parent, preventing sibling overcommit.
- Authorization and reservation use a PostgreSQL row lock, so concurrency cannot overspend.
- Payment state distinguishes policy authorization, buyer approval, capture and settlement.
- The audit ledger is both hash-chained and signed, and verification is executable from the UI.
- Security scenarios are reproducible against the real engine rather than static claims.

## 12. Limitations and next steps

- Real PayPal Sandbox order, buyer approval, capture and webhook delivery are not verified because
  credentials and a public HTTPS callback are absent.
- The loopback PayPal adapter test proves PACT's state machine and contract handling, not PayPal's
  live behavior.
- Audit evidence is application-level; it is not immutable against a database administrator.
- Security intelligence is bounded to recent decisions.
- A scheduled reconciliation worker is not included; ambiguous orders require an operator action.
- Deployment and secrets must be configured on a Next.js-compatible Node host with PostgreSQL.
- No compliance certification (PCI, SOC 2, etc.) is claimed.
