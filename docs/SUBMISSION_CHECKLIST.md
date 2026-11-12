# PACT Submission Checklist

## Source and build

- [x] Application code present under `src/`; Prisma schema and baseline migration under `prisma/`.
- [x] No TODO/FIXME/HACK markers in application source.
- [x] No user-facing occurrence of the disallowed project word in `src`, `README.md`, `docs`, `tests` or
      `scripts`.
- [x] TypeScript strict check passes.
- [x] ESLint passes.
- [x] Production build passes; 19/19 routes generated.
- [x] Prisma schema validates.
- [x] Baseline migration applied; `prisma migrate status` reports up to date.
- [ ] Git commit/source archive — this workspace is not a Git repository.

## README and documentation

- [x] README explains the problem, product, architecture, stack, mandate model, cryptography,
      delegation, revocation, budget enforcement, policy engine, PayPal flow, setup and tests.
- [x] `docs/FINAL_ARCHITECTURE.md` describes the final runtime and invariants.
- [x] `docs/JUDGE_PRESENTATION.md` covers the judging narrative and honest limitations.
- [x] `docs/PAYPAL_SANDBOX_RUNBOOK.md` contains setup, environment, webhook, buyer, troubleshooting and
      evidence guidance.
- [x] `docs/SECURITY.md`, `docs/API.md`, `docs/TEST_REPORT.md`, `docs/PRODUCT_READINESS.md` are present.
- [x] Final check: README test counts and integration status match the last executed run.

## Environment and secrets

- [x] `.env` / `.env.local` are ignored.
- [x] `.env.example` contains placeholders only; sample private signing material was removed.
- [x] Server-only keys (`PACT_PRIVATE_KEY`, `PAYPAL_CLIENT_SECRET`, etc.) are never sent by API.
- [x] Agent credential ciphertext is excluded from mandate and agent detail API responses.
- [x] PayPal mock flags are disabled by default and loopback-only when enabled.
- [ ] Configure `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` and a public HTTPS
      `APP_URL` in the deployment secret store.
- [ ] Rotate any credentials that have ever appeared in chat, logs, screenshots or source control.

## Testing evidence

- [x] Unit tests — 35/35 in 3 files.
- [x] Playwright owner journeys — run against the current production build.
- [x] API smoke — run against the current production build.
- [x] Eight security scenarios — run against the current production build.
- [x] Product-surface checks — run against the populated scenario account.
- [x] Loopback PayPal contract lifecycle — run against the current production build with a second app
      configured for the loopback adapter.
- [x] Secret-leak scan over source, docs and example configuration.
- [ ] Real PayPal Sandbox order, buyer approval, capture and webhook — blocked by missing credentials
      and public callback.

## Security evidence

- [x] Ed25519 mandate, proposal and audit signatures.
- [x] Owner scoping, session protection, CSRF and same-origin mutations.
- [x] Atomic reservation and concurrent-spending scenario.
- [x] Signed-column tamper detection.
- [x] Revoked/expired mandate denial.
- [x] Merchant/category and per-transaction/budget denial.
- [x] Replay and forged-approval denial.
- [x] Delegation containment and ancestor revocation.
- [x] Agent-lineage suspension and sibling-budget reservation.
- [x] Capture amount/currency/status verification.
- [x] Webhook signature-before-mutation and event deduplication.
- [x] Rejected webhook retry can be reclaimed by a later valid delivery.
- [ ] Independent penetration test or compliance certification — not claimed.

## Deployment

- [x] Production build is deployable as a Node.js Next.js app.
- [x] PostgreSQL connection and Prisma migration path are documented.
- [ ] Choose a host and provision PostgreSQL.
- [ ] Configure all server-side environment variables.
- [ ] Set `APP_URL` to the deployed HTTPS origin.
- [ ] Register `https://<origin>/api/webhooks/paypal` for the three capture events.
- [ ] Complete a real Sandbox buyer approval/capture and verify the webhook.
- [ ] Confirm production HTTPS, secure cookies, callback URLs and log redaction.

## Presentation

- [x] Judge narrative drafted.
- [x] Architecture diagram and security narrative drafted.
- [x] Evidence distinction between local contract tests and live PayPal stated.
- [x] `docs/VIDEO_RECORDING_GUIDE.md` defines the exact screen sequence, actions and narration.
- [ ] Rehearse the live walkthrough and record a fallback recording.
- [ ] Prepare a short slide deck around the problem, boundary, walkthrough and evidence.

## Remaining manual actions

1. Create the PayPal Sandbox REST app and copy the Client ID and Secret into server-side secrets.
2. Expose the app on a stable public HTTPS origin and set `APP_URL` to that exact origin.
3. Register the webhook for the exact callback and copy its Webhook ID into `PAYPAL_WEBHOOK_ID`.
4. Restart the server with mock flags unset.
5. Run one small Sandbox buyer-approved payment and verify `SETTLED`, capture id, amount, webhook and
   audit evidence.
6. Choose and configure the production Next.js/PostgreSQL host.
7. Rehearse the walkthrough and archive the source (including a Git commit if this folder is placed
   in a repository).
