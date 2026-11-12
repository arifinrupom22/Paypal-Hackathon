# PayPal Sandbox Integration Runbook

This is the operator procedure for a real PayPal Sandbox test. It does not change PACT's payment
architecture. Never put client secrets, private keys, session cookies or webhook signatures in a
document, screenshot, terminal log, issue, or commit.

## Current preflight status

Checked 2026-11-12 from this workspace:

| Item | Current state |
| --- | --- |
| `APP_URL` | `http://localhost:3000` |
| Production process used for local verification | `http://localhost:3101` |
| Public deployment origin | Not configured or discoverable in this workspace |
| `PAYPAL_CLIENT_ID` | Missing |
| `PAYPAL_CLIENT_SECRET` | Missing |
| `PAYPAL_WEBHOOK_ID` | Missing |
| `PAYPAL_ENVIRONMENT` | `sandbox` |
| Loopback mock flags | Not part of the real-Sandbox configuration |

The existing `APP_URL` does **not** match the local verification origin, and no public origin has
been verified. Do not run a live buyer test until the public origin is set and checked. A loopback
mock result is not a substitute for this run.

## 1. Create the PayPal Developer Sandbox REST app

1. Sign in at <https://developer.paypal.com/dashboard/>.
2. Switch the dashboard to **Sandbox**. Do not use **Live** for this procedure.
3. Open **Apps & Credentials**, choose the **Sandbox** tab, and select **Create App**.
4. Enter an app name such as `PACT Sandbox`, select the merchant/business app type, and create it.
5. Open the app's **Credentials** and copy:
   - **Client ID** → `PAYPAL_CLIENT_ID`
   - **Secret** → `PAYPAL_CLIENT_SECRET`
6. The secret is normally shown only once. Store it directly in the approved secret store. If it is
   lost, rotate it; do not paste it into chat or a document.
7. Open **Sandbox → Accounts** and confirm there is a **Personal** buyer account. Use that account for
   the buyer approval step. Its sandbox email/password are test credentials; keep them out of source
   control and screenshots.
8. Confirm the app is a **Sandbox** app. A Live client id/secret will not authenticate against the
   Sandbox API and must not be used.

## 2. Establish the public origin and webhook URL

PACT builds the PayPal return/cancel URLs from `APP_URL`. The webhook route is fixed at
`/api/webhooks/paypal`.

```text
APP_URL = https://<public-pact-origin>
Webhook callback URL = https://<public-pact-origin>/api/webhooks/paypal
```

Requirements:

- Use `https://` for a public origin. `http://localhost:3000` is suitable only for local browser
  work, not for a PayPal webhook.
- Use an origin only: scheme plus host plus optional port. Do not add `/app` or a trailing path.
- The public host must route to this PACT deployment and preserve the `/api/webhooks/paypal` path.
- Use a stable URL for the whole test. A temporary tunnel that changes hostnames requires updating
  both `APP_URL` and the PayPal webhook URL before retrying.
- If exposing the local production server, forward the public HTTPS host to the exact local port
  (currently `3101` in this workspace). The public hostname, not the tunnel's local target, belongs
  in `APP_URL`.

Example tunnel command, only after the public hostname is known:

```bash
cloudflared tunnel --url http://localhost:3101
```

Set `APP_URL` to the **https tunnel hostname**, not `http://localhost:3000`, then restart PACT.

## 3. Configure environment variables

### Server runtime

Use `.env.local` for local runs. In deployment, use the platform's environment/secret store. The
application reads these values server-side only.

| Variable | Value / rule | Where it belongs |
| --- | --- | --- |
| `APP_URL` | Exact public HTTPS origin, no trailing path | `.env.local` locally; deployment variables in production |
| `PAYPAL_ENVIRONMENT` | `sandbox` | Same as above; never `live` for this test |
| `PAYPAL_CLIENT_ID` | Sandbox app client id | Server-side secret store only |
| `PAYPAL_CLIENT_SECRET` | Sandbox app secret | Server-side secret store only |
| `PAYPAL_WEBHOOK_ID` | Webhook id generated for the exact callback URL | Server-side secret store only |
| `DATABASE_URL` | Existing PACT PostgreSQL connection | Server-side only; also available to Prisma CLI |
| `AUTH_SECRET` | Existing strong session/encryption secret | Server-side only |
| `PACT_PRIVATE_KEY` | Existing Ed25519 private signing key | Server-side only |
| `PACT_PUBLIC_KEY` | Matching Ed25519 public key | Server-side value; public key may be shown as proof |
| `GEMINI_API_KEY` | Existing Gemini key | Server-side only |

Do not create a `NEXT_PUBLIC_PAYPAL_*` variable. No PayPal secret may be bundled into browser code.

For a real-Sandbox test, explicitly ensure these are **unset** in the server process:

- `PACT_ALLOW_PAYPAL_MOCK`
- `PACT_PAYPAL_MOCK_URL`

These are loopback test harness controls, not a PayPal fallback. If either is enabled, stop and
restart without them before interpreting any result as real.

Test-only process variables such as `BASE_URL`, `PLAYWRIGHT_BASE_URL`, `MOCK_URL`, `PROBE_EMAIL`, and
`PROBE_PASSWORD` must not be added to the production app environment. `DATABASE_URL` is also needed by
the Prisma CLI; keep it in the local untracked environment file used for database commands.

### Secret handling

- Keep `.env`, `.env.local`, and any deployment secret files untracked and outside public assets.
- Do not paste Client Secret, `PAYPAL_WEBHOOK_ID` values, `AUTH_SECRET`, `PACT_PRIVATE_KEY`, session
  cookies, or full webhook headers into chat, docs, screenshots, or Git.
- The Settings/Payment Center UI may show configuration presence and environment/base URL; it must
  never show the secret.
- If a secret was ever exposed, rotate it in the PayPal Developer dashboard and the deployment secret
  store before testing.

## 4. Configure the webhook in PayPal

1. Open the Sandbox REST app in **Apps & Credentials → Sandbox → Apps**.
2. Locate the app's **Webhooks** section and select **Add Webhook**.
3. Set the URL to exactly:

   ```text
   https://<public-pact-origin>/api/webhooks/paypal
   ```

4. Subscribe to exactly these three event types:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.REFUNDED`
5. Save the webhook and copy its **Webhook ID** into `PAYPAL_WEBHOOK_ID` in the server environment.
6. Do not reuse a webhook ID from another app or another callback URL.
7. If the public hostname changes, update the webhook URL and the `PAYPAL_WEBHOOK_ID` value together.

The handler verifies the PayPal transmission signature with the configured webhook id before mutating
business state. Missing signature headers, a failed PayPal verification response, malformed JSON, and
missing event ids/types fail closed. Event ids are unique in the database, so a retry of an already
processed event is recorded as a duplicate. A delivery previously recorded as `REJECTED` can be
reclaimed by a later correctly signed delivery of that same event; it is not blocked forever by the
earlier verification failure.

## 5. Verify the public origin before creating money

Run these checks after setting `APP_URL` and restarting the server:

```bash
# 1. The app answers at the public origin and the login page renders.
curl -sS -o /dev/null -w '%{http_code}\n' "$APP_URL/login"

# 2. Presence/format check. This prints only flags and public configuration, not secrets.
node scripts/verify-config.mjs
```

Expected configuration output:

```text
PAYPAL_CLIENT_ID       set
PAYPAL_CLIENT_SECRET   set
PAYPAL_WEBHOOK_ID      set
APP_URL                https://<public-pact-origin>
PAYPAL_ENVIRONMENT     sandbox
```

Then confirm in the browser:

- The browser address bar origin is exactly the value in `APP_URL`.
- Settings/Payment Center reports `sandbox · connected`, not `credentials required`.
- The provider base URL is `api-m.sandbox.paypal.com`, not a loopback mock host.
- `APP_URL` has no trailing slash or path.
- A request to `https://<public-pact-origin>/api/webhooks/paypal` reaches PACT (the route is POST-only;
  a GET is not a valid payment test).

If `APP_URL` is still `http://localhost:3000`, or the app is served on a different port while
`APP_URL` names another origin, the callback will land on the wrong host. `3000`, the public-origin check fails. Fix the value before continuing.

## 6. Safe Sandbox buyer approval and capture procedure

Use a dedicated Sandbox buyer and a small amount. Do not use a real card, real buyer account, or Live
credentials.

1. Sign in to PACT at the exact `APP_URL` origin.
2. Confirm an active agent and an active signed mandate exist. The mandate must include the catalog
   merchant and category used by the purchase, have enough remaining budget, and not be expired.
3. Open **Payment Center**.
4. Choose the mandate and a catalog item whose amount is within the mandate's per-transaction and
   remaining limits. Use a small test amount.
5. Enter a shopping instruction, select **Generate signed proposal**, then select **Evaluate with
   PACT**.
6. Confirm the result is `AUTHORIZED` and the budget is reserved. Do not proceed from a blocked or
   step-up-required result.
7. Select **Create PayPal order**. PACT must return an approval URL.
8. Confirm the PayPal page is a **Sandbox** checkout, the merchant/brand is PACT, and the amount and
   currency exactly match the authorized proposal.
9. Sign in with the **Personal Sandbox buyer** account and explicitly approve the purchase. Do not use
   a Live PayPal login.
10. PayPal redirects to:

    ```text
    https://<public-pact-origin>/payments/return?transaction=<PACT transaction id>
    ```

11. The return page calls PACT's server-side capture endpoint. Wait for
    **Payment captured and verified**. If it reports an error, do not retry blindly; inspect the
    transaction and use **Reconcile** after checking the PayPal order.
12. Open **Transactions** and verify the transaction is `SETTLED`, the PayPal capture id is present,
    and the captured amount/currency match the authorization.
13. Open the transaction's authorization trace and verify the PayPal approval/capture stages show the
    persisted provider ids and the audit evidence links resolve.
14. Open **Audit** and verify the chain is valid and the payment/webhook events are present.
15. In the PACT database or Prisma Studio, inspect the `WebhookEvent` row for the real event:
    `signatureVerified = true`, expected `eventType`, a PayPal event id, and `status = PROCESSED`.
    A `FAILED` mismatch row is not a successful settlement.
16. In the PayPal Sandbox activity, confirm the capture amount and merchant match. This is the
    independent provider-side check.

### Buyer cancellation / abandoned order

If the buyer cancels before approving, there may be a PayPal order but no capture. PACT intentionally
blocks local release once an order exists, because the buyer could still complete it. Use
**Reconcile**; a `VOIDED` or `EXPIRED` PayPal order releases the reservation, while a pending order
retains it. Do not create a second order for the same transaction.

## 7. Final verification checklist

### Real PayPal evidence required

- [ ] `APP_URL` is the actual public HTTPS origin and the browser origin matches exactly.
- [ ] `PAYPAL_ENVIRONMENT=sandbox`.
- [ ] PACT reports `sandbox · connected`, with provider base URL `api-m.sandbox.paypal.com`.
- [ ] `PACT_ALLOW_PAYPAL_MOCK` and `PACT_PAYPAL_MOCK_URL` are unset.
- [ ] PayPal order id is issued by PayPal (not `MOCK-*`) and the approval URL host is a PayPal Sandbox
      host (not loopback).
- [ ] Buyer approval was completed in a logged-in PayPal Sandbox Personal account.
- [ ] PACT's return page reported **Payment captured and verified**.
- [ ] `Transaction.status = SETTLED`.
- [ ] `Transaction.paypalCaptureId` is the PayPal-issued capture id, not a mock value.
- [ ] `Transaction.capturedAmount` and currency exactly equal the PACT authorization.
- [ ] The PayPal Sandbox activity shows the corresponding completed capture.
- [ ] A real `WebhookEvent` exists with `signatureVerified = true` and the expected event type.
- [ ] A replay of the same webhook event is recorded as duplicate and does not create a second
      settlement.
- [ ] The audit chain validates and contains the order/capture/webhook records.

### Local mock evidence only

These can prove PACT's code path, but must never be recorded as live PayPal evidence:

- [ ] Order id has a mock prefix such as `MOCK-ORDER-*`.
- [ ] Approval URL points to `127.0.0.1` or `localhost`.
- [ ] Provider base URL points to a loopback mock, not `api-m.sandbox.paypal.com`.
- [ ] No PayPal Sandbox account approved the order.
- [ ] No real PayPal webhook was delivered; signature verification is the mock's response.
- [ ] No real buyer funding or capture appears in PayPal activity.

### Negative checks for the real run

- [ ] A missing or malformed webhook signature returns `WEBHOOK_REJECTED` and does not settle.
- [ ] A second identical webhook event returns `duplicate` and does not double-settle.
- [ ] A captured amount/currency mismatch retains the reservation and requires reconciliation.
- [ ] A second account cannot create or capture another owner's transaction (`404`).
- [ ] A revoked/expired mandate blocks order creation before any new PayPal order exists.
- [ ] A failed/ambiguous capture retains the reservation until capture retry or reconciliation.
- [ ] No secret appears in browser source, network response bodies, server logs, screenshots, or Git
      status/diffs.

Only after every item in **Real PayPal evidence required** passes may the project claim a successful
PayPal Sandbox lifecycle. Until then, the correct status is: **implemented; not live-verified**.

## 8. Troubleshooting

| Symptom | Likely cause | Check |
| --- | --- | --- |
| Order creation returns `503 CONFIGURATION_REQUIRED` | Client ID/secret missing or server was not restarted | `node scripts/verify-config.mjs`; confirm both values are in the running server environment |
| PayPal says the client is invalid | Live credentials used, or the app is a Sandbox app with a typo | Use the Sandbox app's Client ID/secret and `PAYPAL_ENVIRONMENT=sandbox` |
| Buyer approval redirects to the wrong host | `APP_URL` does not match the browser/public origin | Set the exact HTTPS origin, no trailing path, and restart |
| PayPal returns to a login or 404 | Reverse proxy did not preserve the callback path or host | Verify `https://<origin>/payments/return` and `/api/webhooks/paypal` reach PACT |
| Webhook endpoint returns `400 WEBHOOK_REJECTED` | Missing/wrong `PAYPAL_WEBHOOK_ID`, signature headers, or a delivery not from PayPal | Confirm the webhook id belongs to this exact callback URL; do not bypass verification |
| Webhook is `duplicate` | PayPal retried an event already recorded | Inspect the original `WebhookEvent`; one event may not settle twice |
| Capture returns `409 CAPTURE_RECONCILIATION_REQUIRED` | Amount/currency mismatch was quarantined | Check PayPal capture evidence and use Reconcile; do not release locally |
| Capture returns `409 CAPTURE_IN_PROGRESS` | A recent capture attempt is still marked in progress | Wait for the bounded retry window, then reconcile against PayPal |
| Transaction remains `AWAITING_BUYER_APPROVAL` after cancelling | A PayPal order exists; local release would race buyer approval | Use Reconcile after PayPal marks the order voided/expired |
| `PACT_ALLOW_PAYPAL_MOCK` appears active | Loopback test environment leaked into the real run | Unset both mock variables and restart; never use mock evidence as live evidence |
| Secrets appear in a response/log | Incorrect client-side exposure or verbose logging | Stop, rotate the secret, remove client exposure, and re-run the leak scan |
