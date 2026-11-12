# PACT Final Architecture

## One-line model

**AI proposes. PACT verifies. User authorizes. PayPal processes.**

PACT is not a payment processor and does not give an agent a card or a PayPal credential. It is an
authorization boundary that converts owner intent into a signed, bounded mandate and evaluates every
agent proposal against that mandate before a PayPal order can exist.

## Why the boundary exists

An autonomous purchasing agent can be prompt-injected, compromised, or simply wrong. A normal API key
would let it spend without a second authority. PACT instead gives the agent an identity that can
propose, and gives the owner a cryptographic instrument that can only be exercised within explicit
merchant, category, amount, count, time and delegation limits.

## Runtime topology

```text
Next.js 15 App Router
  ├── Server Components       authenticated owner views, read-only evidence
  ├── Client islands          proposal, approval and payment actions
  └── Route Handlers          auth, mandates, agents, policy, payments, webhooks, audit
            │
            ├── PostgreSQL / Prisma
            │     owner-scoped data, NUMERIC(18,2) money, row locks, unique execution keys
            ├── Node crypto
            │     Ed25519 mandate/proposal/audit signatures, AES-256-GCM agent key vault
            ├── Gemini (optional)
            │     intent extraction and catalog selection; never price or policy authority
            └── PayPal REST Orders v2
                  server-side OAuth, order creation, buyer redirect, server-side capture
```

## Authorization lifecycle

1. **Owner creates an agent identity.** The server generates an Ed25519 key pair. The private key is
   encrypted with AES-256-GCM under a key derived from `AUTH_SECRET`; only the public key and
   fingerprint are returned.
2. **Owner signs a mandate.** The server canonicalizes the complete mandate payload, hashes it with
   SHA-256, signs it with the platform Ed25519 key and stores the signature, hash and key id.
3. **Agent proposes.** A proposal contains a merchant, category, amount, currency and line items. The
   server builds the canonical proposal payload and signs it with the agent's own key. Model text is
   stored as untrusted rationale, never as authority.
4. **Policy engine decides.** The engine rebuilds signed payloads from persisted columns and checks
   signature integrity, owner binding, status, expiry, revocation, agent identity and lineage,
   merchant/category scope, amount precision, currency, per-transaction ceiling, remaining budget,
   transaction count, replay uniqueness, delegation containment and step-up approval.
5. **Atomic reservation.** Only `AUTHORIZED` produces a transaction. The mandate row is locked with
   `SELECT … FOR UPDATE`, the engine is re-evaluated inside the lock, and unique execution and
   idempotency keys close retry races.
6. **PayPal buyer approval.** PACT creates a PayPal Orders v2 order server-side. The browser receives
   only the approval URL. PACT authorization and PayPal buyer approval are separate stages.
7. **Server-side capture.** The return page calls the capture endpoint. PACT records `SETTLED` only
   when PayPal reports `COMPLETED` with the expected amount, currency and a capture id.
8. **Evidence.** Each sensitive action appends an owner-scoped, hash-chained and Ed25519-signed audit
   event. The audit page recomputes the chain and every signature.

## Mandate invariants

- Signed columns are immutable. Changing any signed value invalidates the proof.
- Expiry is evaluated against server time at decision time.
- Revocation is checked at decision time and cascades to descendants.
- Child mandates must be within the parent's scope, expiry, currency, per-transaction ceiling,
  approval threshold, remaining budget and transaction capacity.
- Active child ceilings are reserved against the parent, so two siblings cannot independently consume
  the same parent authority.
- Every ancestor in the chain must be active and unexpired; a suspended ancestor agent blocks the
  descendant.
- The parent row is locked while a child is created to prevent concurrent overcommit.

## Budget semantics

`spentTotal` is the sum of transactions still holding a reservation (`POLICY_APPROVED`,
`AWAITING_BUYER_APPROVAL`, `CAPTURING`, `SETTLED`). Failed, cancelled and refunded transactions release
the local reservation. The policy engine uses a committed value that also reserves active child
ceilings, so a parent cannot spend capacity already promised to a child. Authorization and reservation
are one PostgreSQL transaction.

## Payment failure semantics

- Missing PayPal credentials: `503 CONFIGURATION_REQUIRED`; no order and no fake settlement.
- PayPal timeout/unreachable: reservation retained, transaction marked unconfirmed.
- Provider reports non-completed capture: transaction `FAILED` and reservation released.
- Capture amount/currency mismatch: reservation retained and reconciliation required.
- PayPal order voided/expired: reconciliation releases the reservation.
- Duplicate order/capture: rejected by persisted state and idempotency identifiers.
- Webhook signature failure: rejected before business mutation.
- Duplicate webhook event: recorded as duplicate; no second settlement.
- Webhook retry after a temporary signature-verification failure: the rejected event row is reclaimed
  by a later valid delivery instead of being permanently blocked.

## Security boundaries

| Boundary | Trusted | Untrusted |
| --- | --- | --- |
| Browser → API | authenticated session, CSRF | body, query and UI state |
| AI → policy | nothing | model output is text/data only |
| Agent → vault | public key | agent private key never leaves server |
| PACT → PayPal | server OAuth and verified capture | redirect parameters |
| PayPal → webhook | verified transmission signature | payload before verification |

## Known deployment shape

The repository contains a Next.js application and PostgreSQL schema, but no deployment provider
configuration. A compatible host must run the Node.js server, provide PostgreSQL, set server-side
environment variables and expose a stable public HTTPS origin for `APP_URL` and the PayPal webhook.
