# PACT Final Recording Steps

Live UI inspected: 12 November 2026  
Recording target: **2:50–3:00 total**  
Application: `http://localhost:3000`  
Prepared local account: signed-in owner **Kiran Patel**, agent **ProcureMaster-Root**

This document is based on the currently running pages. The prepared account can reach every required
page. Do not open credentials, `.env` files, private keys or the local account file on camera.

---

## 1. What is visible in the current UI

The prepared account currently provides:

- Mandate: **Northline equipment renewal mandate** (`mnd_heRudwb0pTcU`).
- Agent: **ProcureMaster-Root**.
- Authorized transaction: `tx_eU_48-6HcGSW`, **$38.00**, Northline Supply Co.
- Authorized proposal: `prop_0kEfNf-HkUGq`; decision `dec_YErNd84I0d-b`; all 17 policy checks passed.
- Security Center: **8 boundaries held**, **0 boundary failures**, **8 recorded executions**.
- Delegation graph: **Security Harness Child**; containment state **WITHDRAWN** because the parent and
  child mandates are `REVOKED`.
- Blocked decision: `dec_5cjwQm-QlUdq`, **$40.00 Lambda Labs, Inc.**, denied for **remaining budget**;
  the decision page says PayPal was **not reached**.
- Audit page: **CHAIN INTEGRITY 100%**, **0 signature failures**, all displayed records verified.
- Payment Center: **PayPal credentials required**; the page explicitly says PACT will not fabricate a
  payment.
- Transaction trace: **PayPal approval not started**, **no order created**, **capture not captured**,
  **settlement is not claimed**.

### Differences from the earlier recording guide

1. The Payment Center catalog label is **“Anodised Aluminium Laptop Stand — 38 USD”**, not
   “$38.00”. The transaction trace uses **$38.00**.
2. The Mandate Center contains several harness mandates. **Northline equipment renewal mandate** is
   lower in the list; scroll to it or use the direct detail URL as a fallback.
3. The Transaction Ledger is an AG Grid. Click a row first; only then does
   **Open full authorization trace →** appear.
4. The trace stage is visually labelled **Budget check** (`38 USD requested · Passed`). Its accessible
   label is “Inspect Budget check”. Click the **Budget check** stage, not a toolbar button.
5. The first **Explain decision →** link in Security Intelligence is a **$40.00 budget-exhaustion**
   decision, not Merchant Substitution. Show it as a rejected budget proposal. Do not call it a
   merchant-substitution decision.
6. A blocked proposal does not become a transaction row. PACT deliberately has no “rejected
   transaction”; the safe evidence is the **BLOCKED decision page** with **PAYPAL not reached**.
7. The current audit count changes as sessions are created. Read the displayed number; the stable
   claims are **100%**, **0 signature failures**, and **all displayed records verified**.

---

## 2. Pre-recording checklist

- [ ] `http://localhost:3000/login` returns normally.
- [ ] The prepared account signs in and the dashboard shows **“Welcome back, Kiran”**.
- [ ] The server is the production build, not a different local project.
- [ ] `APP_URL` is `http://localhost:3000`.
- [ ] Browser viewport is 1440 × 900 or 1440 × 1000, zoom 100%.
- [ ] Theme is dark unless the room projector needs light. If changing theme, do it before recording.
- [ ] Close bookmarks, extensions, terminal history, `.env` files and the local account file.
- [ ] Sign in before recording; do not capture the password field.
- [ ] Do not click **Delegate**, **Revoke**, **Suspend**, **Execute against live engine**,
  **PayPal checkout**, or **Create PayPal order** during the recording.
- [ ] Keep the prepared account open on the dashboard when recording starts.

---

## 3. Screen-by-screen sequence

### 0:00–0:10 — Opening

**Page:** Dashboard `/`

**Show:** The live dashboard. Keep the pointer still on the page header.

**Say:**

> An AI agent can choose what to buy, but it should never decide how much authority it has. PACT is
> the permission layer between AI intent and money movement.

### 0:10–0:22 — The problem

**Page:** Dashboard, same view.

**Show:** Point to the live counts and the **Blocked TX** area. Do not read every number.

**Say:**

> An unrestricted payment credential turns a model mistake or prompt injection into financial loss.
> A confirmation dialog is not a boundary; it is UI state. PACT decides whether a proposal is
> allowed.

### 0:22–0:32 — The solution

**Page:** Dashboard, still.

**Say:**

> PACT separates four decisions: AI proposes, PACT verifies against a signed mandate, the owner
> authorizes exceptions, and PayPal processes. The agent never gets a payment secret.

### 0:32–0:45 — Live operating picture

**Page:** Dashboard `/`

**Action:** Point to the mandate, agent, authorized and blocked metrics, then the crypto strip showing
`Ed25519 Engine ACTIVE` and `PayPal Bridge SETUP`.

**Say:**

> This is a real PostgreSQL-backed account. Mandates, blocked evaluations and signed audit events are
> persisted records. PayPal is not configured, so no payment is claimed.

### 0:45–1:02 — Signed mandate

**Page:** **Mandate Center** (`/mandates`). Click it in the left navigation, then scroll to and click
**Northline equipment renewal mandate**.

**Show:**

- **Remaining balance** `$162.00 of $200.00 ceiling`.
- **Reserved spend** `$38.00`, one active transaction.
- **Per transaction** `$50.00`, four total authorizations.
- **Allowed merchants** `NORTHLINE SUPPLY CO.` and **Allowed categories** `OFFICE HARDWARE`.
- Right-hand **Cryptographic proof**: `SIGNATURE VALID`, `Ed25519 (RFC 8032)`,
  `Public key fingerprint`, `Canonical hash`, `Verification`, `Not revoked`.

**Do not click:** `Delegate` or `Revoke`.

**Say:**

> Authority is a signed instrument. This mandate fixes a two-hundred-dollar ceiling, fifty dollars per
> transaction, four authorizations, an expiry, one merchant and one category. PACT rebuilds the
> payload at decision time. Change a signed field and the proof breaks.

### 1:02–1:14 — Agent authority

**Page:** **Agent Control Center** (`/agents`). Click it in the left navigation, then click
**ProcureMaster-Root**.

**Show:** `ROOT`, `ACTIVE`, **Identity & cryptographic material**, the `ED25519 PUBLIC KEY`, the
fingerprint, the assigned **Northline equipment renewal mandate**, and the activity history containing
the authorized `$38.00` transaction.

**Do not click:** `Suspend`.

**Say:**

> The agent has its own Ed25519 identity, so every proposal is attributable. Only the public half is
> exposed. It can propose, but cannot approve itself or reach PayPal credentials.

### 1:14–1:38 — Authorized proposal

**Page:** **Payment Center** (`/payments`). Click it in the left navigation.

**Action sequence:**

1. In **MANDATE**, select **Northline equipment renewal mandate**. The current option ends with
   `162.00 USD left`; the exact remaining amount may update after a submission.
2. In **CATALOG ITEM (OPTIONAL)**, select **Anodised Aluminium Laptop Stand — 38 USD**.
3. In **SHOPPING INSTRUCTION**, type:
   `Buy the anodised aluminium laptop stand from Northline Supply Co.`
4. Click **Generate signed proposal**.
5. Wait for the proposal panel. Point to the proposal ID, **Northline Supply Co.**, **38.00 USD**, and
   **Proposal signed by the agent's Ed25519 identity**.
6. Click **Evaluate with PACT**.
7. When the green result appears, point to **AUTHORIZED** and **Budget reserved atomically**.
8. Point to the link **PayPal sandbox credentials are required before checkout →**. Do not click it.

**Do not click:** `PayPal checkout` or any PayPal action.

**Say:**

> The agent selects from the server-controlled catalog and creates a signed proposal. PACT re-checks
> signature, ownership, status, expiry, merchant, category, amount, budget, count, replay and
> delegation. The proposal is authorized and the budget is reserved atomically. This is still not a
> payment.

**Safe alternative:** If **Generate signed proposal** does not complete, do not narrate success.
Open **Transaction Ledger** and use the existing `$38.00` Northline transaction described below. If
that row is also unavailable, stop the take and show the mandate proof only.

### 1:38–1:54 — Authorization trace

**Page:** **Transaction Ledger** (`/transactions`). Click it in the left navigation. Select the row
containing **Northline Supply Co.** and **38 USD**. Click **Open full authorization trace →**.

**Show:**

- **PACT AUTHORIZATION: AUTHORIZED**.
- **RESERVED AMOUNT: $38.00**.
- **PAYPAL APPROVAL: not started**, **No provider order**.
- **VERIFIED CAPTURE: not captured**, **Settlement is not claimed**.
- The stages: AI proposal, Mandate verification, Agent permission, Budget check, Policy decision,
  PayPal approval, Payment capture.
- Click the **Budget check** stage; point to `PASSED`, amount validity, currency, per-transaction
  ceiling, remaining budget, transaction count and replay protection.

**Say:**

> Here is the boundary. PACT authorized thirty-eight dollars and reserved it locally. PayPal approval
> has not started, no order exists, and no capture exists.

### 1:54–2:10 — Security Center

**Page:** **Security Center** (`/security`). Click it in the left navigation.

**Show:** The top-right **BOUNDARY INTEGRITY** panel:

- `8 boundaries held`
- `0 boundary failures`
- `8 recorded executions`

Point to the scenario cards and the visible outcomes:

- Budget Manipulation — `BLOCKED`
- Prompt Injection — `BLOCKED`
- Execution Replay — `BLOCKED`
- Merchant Substitution — `BLOCKED`
- Forged Approval — `REQUIRES_USER_APPROVAL`
- Expired Mandate — `EXPIRED`
- Revoked Parent Mandate — `REVOKED`
- Concurrent Spending — `2 AUTHORIZED / 2 BLOCKED`

**Do not click:** `Execute against live engine`. The recorded results are already genuine.

**Say:**

> Each scenario ran against the real engine with a signed harness mandate and a manipulated proposal.
> Prompt injection is treated as text, merchant substitution is blocked, replay is rejected, and
> concurrent spending is serialized by a row lock.

### 2:10–2:22 — Rejected decision

**Page:** **Security Intelligence** (`/security/intelligence`). Click **Security intelligence →** from
the Security Center. In **Suspicious execution attempts**, click the first **Explain decision →**.

**Show:** The decision page for the `$40.00` Lambda Labs proposal:

- **BUDGET failed 40 USD**
- **POLICY blocked**
- **PAYPAL not reached**
- `Authorization denied: Remaining budget.`
- **17 checks**, **16 passed**, **1 failed**.

**Say:**

> This is a rejected proposal, not a settlement. Forty dollars exceeded the remaining budget. Sixteen
> checks passed, one failed, and PayPal was never reached. No transaction is created.

### 2:22–2:32 — Delegation enforcement

**Page:** **Delegation Graph** (`/agents/graph`). Click **Agent Control Center** in the left navigation,
then click **Delegation graph**.

**Action:** Click the **Security Harness Child** node.

**Show:** **DELEGATED AUTHORITY CONTAINMENT**, **WITHDRAWN**, and the lines:

- `Parent authority active: mnd_qrgyIa3fRopc is REVOKED`
- `Child authority active: mnd_mazfpqU4V92y is REVOKED`
- Budget containment and permission subset checks.

**Say:**

> Delegation is attenuated. The child receives only a subset of the parent's budget, scope and expiry.
> When the parent is revoked, the child is withdrawn even though its signature remains valid.

### 2:32–2:44 — Audit integrity

**Page:** **Audit & Compliance** (`/audit`). Click it in the left navigation.

**Show:**

- **CHAIN STATUS: Verified**
- **CHAIN INTEGRITY: 100%**
- **0 signature failures**
- **RECORD SIGNATURES: verified**
- The latest event and the current ledger count.

**Say:**

> Every sensitive action appends a hash-chained, signed record. The page recomputes the chain: one
> hundred percent integrity, zero signature failures. This is application evidence, not immutable
> storage.

### 2:44–2:52 — PayPal boundary

**Page:** **Payment Center** (`/payments`). Click it in the left navigation.

**Show:** The top-right status **PayPal REST Orders v2 — credentials required**, and the notice
**PayPal sandbox credentials are not configured**. Point back to the transaction trace if it is still
open in another tab, or simply state what was shown.

**Say:**

> No PayPal Sandbox credentials exist here. PACT fails closed and will not fabricate a payment. The
> loopback contract test proves the adapter, not a genuine Sandbox transaction. Live verification is
> still pending.

**Do not click:** `PayPal checkout`, `Create PayPal order`, or any external PayPal link.

### 2:52–3:00 — Close

**Page:** Return to the dashboard or hold the audit page.

**Say:**

> AI proposes. PACT verifies. The owner authorizes. PayPal processes. Bounded, auditable permission
> to buy, without giving the agent the keys.

Stop recording.

---

## 4. Continuous voiceover script

Read this as one continuous narration; the screen actions above are timed to it.

> An AI agent can choose what to buy, but it should never decide how much authority it has. PACT is
> the permission layer between AI intent and money movement.
>
> An unrestricted payment credential turns a model mistake or prompt injection into financial loss.
> A confirmation dialog is not a boundary; it is UI state. PACT decides whether a proposal is
> allowed.
>
> PACT separates four decisions: AI proposes, PACT verifies against a signed mandate, the owner
> authorizes exceptions, and PayPal processes. The agent never gets a payment secret.
>
> This is a real PostgreSQL-backed account. Mandates, blocked evaluations and signed audit events are
> persisted records. PayPal is not configured, so no payment is claimed.
>
> Authority is a signed instrument. This mandate fixes a two-hundred-dollar ceiling, fifty dollars per
> transaction, four authorizations, an expiry, one merchant and one category. PACT rebuilds the
> payload at decision time. Change a signed field and the proof breaks.
>
> The agent has its own Ed25519 identity, so every proposal is attributable. Only the public half is
> exposed. It can propose, but cannot approve itself or reach PayPal credentials.
>
> The agent selects from the server-controlled catalog and creates a signed proposal. PACT re-checks
> signature, ownership, status, expiry, merchant, category, amount, budget, count, replay and
> delegation. The proposal is authorized and the budget is reserved atomically. This is still not a
> payment.
>
> Here is the boundary. PACT authorized thirty-eight dollars and reserved it locally. PayPal approval
> has not started, no order exists, and no capture exists.
>
> Each scenario ran against the real engine with a signed harness mandate and a manipulated proposal.
> Prompt injection is treated as text, merchant substitution is blocked, replay is rejected, and
> concurrent spending is serialized by a row lock.
>
> This is a rejected proposal, not a settlement. Forty dollars exceeded the remaining budget. Sixteen
> checks passed, one failed, and PayPal was never reached. No transaction is created.
>
> Delegation is attenuated. The child receives only a subset of the parent's budget, scope and expiry.
> When the parent is revoked, the child is withdrawn even though its signature remains valid.
>
> Every sensitive action appends a hash-chained, signed record. The page recomputes the chain: one
> hundred percent integrity, zero signature failures. This is application evidence, not immutable
> storage.
>
> No PayPal Sandbox credentials exist here. PACT fails closed and will not fabricate a payment. The
> loopback contract test proves the adapter, not a genuine Sandbox transaction. Live verification is
> still pending.
>
> AI proposes. PACT verifies. The owner authorizes. PayPal processes. Bounded, auditable permission
> to buy, without giving the agent the keys.

---

## 5. Safe fallbacks

### If the prepared account cannot access the app

1. Stay on `http://localhost:3000/login`.
2. Do not open or show credential files.
3. Sign in with the existing prepared local account.
4. If the dashboard is not available, stop. Do not record empty states as evidence and do not invent
   another account.

### If the mandate is not visible in the list

Scroll the Mandate Center to the bottom and click **Northline equipment renewal mandate**. If it is
still missing, open `/mandates/mnd_heRudwb0pTcU` directly after signing in. If that page is
unavailable, stop; do not show a different mandate as the signed mandate.

### If the Payment Center proposal does not complete

Do not narrate an authorization that did not appear. Open **Transaction Ledger**, select the row with
**Northline Supply Co.** and **38 USD**, and click **Open full authorization trace →**. If that row is
missing, open `/transactions/tx_eU_48-6HcGSW` directly. If the trace is missing, stop the take.

### If the approval result is not `AUTHORIZED`

Use the actual visible outcome and say what it is. Do not explain an error as a success. The existing
`$38.00` transaction is the safe fallback only if it is actually visible.

### If the delegation graph is unavailable

Use the mandate detail for the **Revoked Parent Mandate delegated mandate** and show its **REVOKED**
status. Do not claim the containment panel is visible if it is not.

### If the audit page is not at `100%` or shows a signature failure

Do not claim integrity. Show the actual status and stop the take; the security and mandate evidence can
still be shown, but the audit claim cannot.

### If PayPal controls appear enabled

Do not click them. Point to **PayPal credentials required** and the trace’s **PayPal approval not
started**. If the notice is not visible, show the trace. If neither is visible, stop; do not describe a
payment that the UI does not show.

---

## 6. Final pre-recording checklist

- [ ] Open the dashboard first.
- [ ] Confirm **Welcome back, Kiran** and the left navigation.
- [ ] Confirm the Northline mandate and its **SIGNATURE VALID** proof.
- [ ] Confirm ProcureMaster-Root and its public identity.
- [ ] Confirm Payment Center shows **PayPal credentials are not configured**.
- [ ] Confirm Security Center shows **8 boundaries held / 0 boundary failures**.
- [ ] Confirm Security Intelligence can open a blocked decision.
- [ ] Confirm Delegation Graph shows the **Security Harness Child** containment state.
- [ ] Confirm Audit & Compliance shows **100%** and **0 signature failures**.
- [ ] Confirm the transaction trace shows **not started** / **not captured**.
- [ ] Confirm no password, private key, `.env` file or credential document is visible.
- [ ] Confirm no prohibited project word is on screen or in the narration.
- [ ] Start recording only after the checklist passes.

**First page to open:** `http://localhost:3000/`  
**Next action:** sign in with the prepared local account, confirm the dashboard says
**“Welcome back, Kiran”**, leave the pointer still, start recording, and deliver the opening line:
“An AI agent can choose what to buy. It should never decide how much authority it has.”
