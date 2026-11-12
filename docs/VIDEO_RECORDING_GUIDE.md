# PACT Video Recording Guide

Target length: **2:50–3:00**. Format: one continuous screen recording, no claims that are not visible
on screen. This is a product walkthrough, not a slideshow.

The recording account contains real signed mandates, real policy decisions, real attack runs and a
verified audit chain. PayPal credentials are intentionally absent; the recording must show that the
payment boundary fails closed.

---

## 1. Before recording

### Start the existing application

From `F:\Paypal Hackathon`:

```bash
docker start pact-postgres
npx prisma migrate status
APP_URL=http://localhost:3000 npm run start -- -p 3000
```

The production build is already present. If it has been removed, run `npm run build` first. Do not
start a second server on the same port.

Open `http://localhost:3000/login`. `APP_URL` must match the origin you are recording.

### Prepare the recording account

With the app running:

```bash
cd "F:/Paypal Hackathon"
BASE_URL=http://localhost:3000 node scripts/prepare-recording.mjs
```

The script uses the real APIs to create:

- a signed `Northline equipment renewal mandate`;
- an authorized `$38.00` proposal with 17 passed checks;
- all eight security scenarios, each `BOUNDARY_HELD`;
- a valid hash-chained audit ledger.

It writes local test credentials and counts to `test-results/presentation-account.json`. That file is
for this workstation only and must not be committed or shown in the video.

If an account was already prepared, use that account instead of creating another one. The current
workspace already has a populated recording account.

### Screen setup

- Browser: Chrome or Edge, 100% zoom.
- Viewport: **1440 × 900** or **1440 × 1000**.
- Theme: **dark** (PACT default), unless the room projector is brighter than expected. If you switch
  to light, use the header contrast toggle before recording, not during.
- Hide bookmarks and browser extensions. Do not show `.env` files, terminal history, passwords or
  private keys.
- Sign in before recording starts, or record the login screen with the password field cropped. The
  local test email may be visible; the password must not be.
- Close other tabs that contain credentials or unrelated work.
- Move the pointer slowly. Pause for one beat after each major state change.

### Pre-flight checks

Run these immediately before recording:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
BASE_URL=http://localhost:3000 node scripts/smoke.mjs
```

Expected: `200`, then `AUTHORIZED` with 17 checks and a valid audit chain. The smoke command creates
an additional isolated account; it does not change the recording account.

---

## 2. The opening (0:00–0:12)

**Screen:** signed-in dashboard, top of page, pointer resting away from charts.

**Say:**

> An AI agent can now choose a product and initiate a purchase. The dangerous part is not the model.
> It is the authority we hand it. PACT is the permission layer between AI intent and money movement.

Do not begin with a slide. Begin with the live product and the word **authority**.

---

## 3. The problem (0:12–0:28)

**Screen:** stay on the dashboard. Point to the stat strip: active mandates, registered agents,
authorized transactions, blocked transactions, authorized spend.

**Say:**

> Most agent payment designs give the model a credential and ask for a confirmation. A confirmation
> dialog is UI state; a prompt-injected or compromised agent can bypass it or misreport it. The model
> should propose a purchase. It should never decide its own authority.

Pause on **Blocked TX** and **PayPal credentials required**. Those are the two themes of the
walkthrough: deterministic refusal, and an honest payment boundary.

---

## 4. The solution (0:28–0:42)

**Screen:** dashboard, pointer near the mandate cards and the crypto strip
(`Ed25519 Engine`, `Policy engine deterministic`).

**Say:**

> PACT separates four decisions. AI proposes. PACT verifies against a signed mandate. The owner
> authorizes exceptions. PayPal processes the payment. The agent never receives a payment secret.

Keep this under 15 seconds. The product will prove the claim.

---

## 5. Mandate: bounded authority (0:42–1:05)

**Screen:** open **Mandate Center** → choose the mandate titled
**“Northline equipment renewal mandate”**. Do not open the harness mandates for this section.

**Actions, in order:**

1. Hover the ceiling cards: total ceiling, per-transaction ceiling, transaction count, expiry.
2. Point to **Allowed merchants** (`Northline Supply Co.`) and **Allowed categories**
   (`Office Hardware`).
3. Move to **Cryptographic proof** on the right.
4. Point to **SIGNATURE VALID**, **Ed25519 (RFC 8032)**, public-key fingerprint and canonical hash.
5. Pause at **Not revoked**.

**Say:**

> Authority is not a boolean. It is a signed instrument: a $200 ceiling, $50 per transaction, four
> authorizations, a seven-day expiry, one merchant and one category. PACT rebuilds this payload from
> stored columns at every decision. If a signed field changes, the proof breaks.

**Do not:** say “immutable” without the qualifier. The signed columns are immutable; this is not a
claim of tamper-proof storage.

---

## 6. Agent: identity without payment keys (1:05–1:20)

**Screen:** **Agent Control Center** → open **ProcureMaster-Root**.

**Actions:**

1. Point to the agent name, `ROOT` tier and `ACTIVE` state.
2. Point to the Ed25519 public identity and the linked mandate.
3. Hover the suspend control but **do not click it**. The recording account must remain usable.
4. Return to the agent list only if the detail page does not show the permission scope clearly.

**Say:**

> The agent has its own Ed25519 identity, so its proposals are attributable. But its private key is
> encrypted server-side and never returned to the browser. The agent can propose; it cannot approve
> itself, mint a mandate or reach a PayPal credential. Suspending this identity blocks its descendants
> at decision time.

If the page is too dense, cut step 4 and go directly to Payment Center.

---

## 7. Authorized proposal: the core authorization path (1:20–1:48)

**Screen:** **Payment Center**.

**Actions, in order:**

1. In **Mandate**, select **“Northline equipment renewal mandate”**. The option shows remaining
   capacity.
2. In **Catalog item**, select **“Anodised Aluminium Laptop Stand — 38.00 USD”**.
3. In **Shopping instruction**, type exactly:
   `Buy the anodised aluminium laptop stand from Northline Supply Co.`
4. Click **Generate signed proposal**.
5. When the signed proposal appears, point to:
   - proposal ID;
   - merchant;
   - `38.00 USD`;
   - the note that the amount comes from the catalog, not model text;
   - **Proposal signed by the agent's Ed25519 identity**.
6. Click **Evaluate with PACT**.
7. When the result appears, pause on **AUTHORIZED**, the green result panel, and
   **Budget reserved atomically**.
8. Click **Show all 17 checks** only if the panel is already visible; otherwise say “seventeen
   independent checks” and move on.
9. Point to the PayPal warning link: **“PayPal sandbox credentials are required before checkout”**.
   Do not click it.

**Say:**

> The agent produced a proposal, but the price and merchant came from the server-side catalog. PACT
> independently re-verified the mandate signature, owner binding, status, expiry, merchant, category,
> amount, remaining budget, transaction count, replay key and delegation state. Authorization and
> budget reservation happen in one PostgreSQL transaction under a row lock.

If the button is slow, keep the pointer still and let the state change be visible. Never narrate a
success that has not appeared.

---

## 8. Transaction trace: authorization is not payment (1:48–2:04)

**Screen:** **Transaction Ledger** → select the newest authorized transaction (the $38.00 Northline
purchase just created) → **Open full authorization trace**.

**Actions:**

1. Point to **PACT AUTHORIZATION: AUTHORIZED**.
2. Point to **PAYPAL APPROVAL: not started** and **VERIFIED CAPTURE: not captured**.
3. Click **Inspect Budget check**.
4. Point to the passed checks: amount validity, currency match, per-transaction ceiling, remaining
   budget, transaction count, replay protection, step-up approval.

**Say:**

> This is the distinction that matters. PACT authorization is not a payment. No PayPal order exists
> here, no capture exists, and no settlement is claimed. The budget is reserved locally, and the
> payment stage remains visibly not started.

---

## 9. Security Center: refusal under attack (2:04–2:22)

**Screen:** **Security Center**.

**Actions:**

1. Point to the top-right summary: **8 boundaries held**, **0 boundary failures**,
   **8 recorded executions**.
2. Point to the scenario cards and read the actual outcomes:
   - Budget Manipulation → `BLOCKED`
   - Prompt Injection → `BLOCKED`
   - Execution Replay → `BLOCKED`
   - Merchant Substitution → `BLOCKED`
   - Forged Approval → `REQUIRES_USER_APPROVAL`
   - Expired Mandate → `EXPIRED`
   - Revoked Parent Mandate → `REVOKED`
   - Concurrent Spending → `2 AUTHORIZED / 2 BLOCKED`
3. Click **Security intelligence →**.
4. Point to **Failure categories**, real counts and the decision explanation link.
5. Click **Explain decision** on a blocked case, ideally **Merchant Substitution**.
6. Point to the failed check and the engine explanation. Do not claim the page is a static result.

**Say:**

> These are not canned animations. Each run created a real harness agent and mandate, submitted a
> manipulated proposal to the live engine, and persisted the actual decision, checks, duration and
> audit event. Prompt injection is treated as text, never authority. The merchant allowlist blocks
> substitution. The row lock serializes concurrent spending.

If the screen is crowded, show the summary and one blocked explanation. Do not read all eight cards.

---

## 10. Delegation enforcement (2:22–2:31)

**Screen:** **Agent Control Center** → **Delegation Graph** (or direct `/agents/graph`).

**Actions:**

1. Select the child node if it is not already selected.
2. Point to **Delegated authority containment**.
3. Point to **withdrawn** on the revoked parent/child case.

**Say:**

> Delegation is attenuated. A child receives only a subset of the parent's merchant and category
> scope, ceiling, count and expiry. Active child ceilings are reserved against the parent, so two
> siblings cannot spend the same authority twice. Revocation propagates down the chain.

This section is short on purpose. The graph is evidence, not a second tutorial.

---

## 11. Audit: cryptographic evidence (2:31–2:44)

**Screen:** **Audit & Compliance**.

**Actions:**

1. Point to **Chain integrity 100%**, **0 signature failures** and the verified signature count.
2. Point to the latest event and click one event to open the **Attestation inspector** if the page
   supports it.
3. Show the event type, actor, timestamp, hash link and signature state.
4. Do not open raw payloads that contain local session data.

**Say:**

> Every sensitive action is appended to an owner-scoped audit ledger. Each record hashes its canonical
> body with the previous hash and is signed with the platform Ed25519 key. The page recomputes the
> chain and every signature. This is application-level evidence, not a claim of immutable storage
> against a database administrator.

---

## 12. PayPal boundary: honest limitation (2:44–2:55)

**Screen:** **Payment Center**. Point to the PayPal status card and the warning notice.

**Actions:**

1. Point to **PayPal REST Orders v2 — credentials required**.
2. Point to the warning: PACT will not fabricate a payment.
3. Return to the transaction trace if you need to show **PayPal approval: not started**.
4. Do not click **Create PayPal order**. It is intentionally unavailable.

**Say:**

> There are no PayPal Sandbox credentials in this environment, so the application fails closed with
> `503 CONFIGURATION_REQUIRED`. We did not fake a PayPal login or a settlement. The local loopback
> contract test exercised order creation, exact capture, duplicate rejection, webhook verification,
> amount mismatch, retry and ownership denial against a mock PayPal contract, with a 19/19 valid audit
> chain. That proves PACT's adapter and state machine, not PayPal's live service. A real Sandbox
> order, buyer approval, capture and webhook remain pending credentials and a public HTTPS callback.

This honesty is part of the product. Do not apologise for it or rush it.

---

## 13. Closing (2:55–3:00)

**Screen:** return to the dashboard, or hold the transaction trace. Pointer still.

**Say:**

> PACT gives an AI agent a bounded, attributable and auditable permission to buy, without giving it
> the keys. AI proposes. PACT verifies. The owner authorizes. PayPal processes. The boundary is
> deterministic, and every decision leaves evidence.

Stop recording. Do not add a spoken claim that the payment was live-verified.

---

## 14. Recording checklist

- [ ] App is the production build at `http://localhost:3000`.
- [ ] `APP_URL` matches the browser origin.
- [ ] PostgreSQL is running and `prisma migrate status` is up to date.
- [ ] `prepare-recording.mjs` completed; `BOUNDARY_HELD` appears for all eight scenarios.
- [ ] Authorized transaction is visible and the trace shows PayPal **not started**.
- [ ] The mandate proof shows **SIGNATURE VALID**, **Ed25519**, fingerprint and **Not revoked**.
- [ ] Audit shows **100%**, zero signature failures.
- [ ] No password, private key, `.env` file or terminal secret is visible.
- [ ] No unverified deployment URL is shown.
- [ ] No mock payment is presented as a real PayPal transaction.
- [ ] The prohibited project word does not appear on screen or in narration.
- [ ] Final recording is 2–3 minutes and has audible narration.

---

## 15. Exact launch and recovery commands

```bash
# 1. Database
docker start pact-postgres
npx prisma migrate status

# 2. Production server (already-built tree)
APP_URL=http://localhost:3000 npm run start -- -p 3000

# 3. Verify the app
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login

# 4. Prepare a fresh recording account through real APIs
BASE_URL=http://localhost:3000 node scripts/prepare-recording.mjs

# 5. Re-run the full visible evidence if needed
BASE_URL=http://localhost:3000 node scripts/smoke.mjs
BASE_URL=http://localhost:3000 node scripts/verify-scenarios.mjs
```

`verify-scenarios.mjs` creates its own isolated account and screenshots; it does not modify the
prepared recording account except by adding independent test rows. Use only the account returned by
`prepare-recording.mjs` for the final recording.
