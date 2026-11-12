# PACT Feature Audit

Audit date: 2026-11-07. Scope: every page, navigation entry, form, dialog, table, chart, API route and
security control in the existing application. Method: source inspection, live production build,
authenticated browser journeys, direct API probes and database-backed scenario runs.

## Page and control inventory

| Area | Controls audited | State |
| --- | --- | --- |
| Auth | register/login validation, duplicate email, wrong password, field errors, session cookie | functional |
| Shell | all nine nav links, mobile drawer, ⌘K/Ctrl-K search focus, mandate search submit, theme toggle, notifications, sign out | functional |
| Overview | quick actions, mandate cards, activity links, empty-state CTAs, charts from live DB | functional |
| Mandate Center | search, currency/agent filters, status tabs (filters preserved), reset, signed-JSON export, pagination by list | functional |
| Mandate wizard | extract, edit every field, validation, security review, explicit confirmation, sign, issued proof | functional |
| Mandate detail | proof inspection, copy, download signed JSON, revoke with confirmation, delegate bounded child, ancestry links | functional |
| Agents | register root/child, suspend/resume, detail links, topology, fleet table, per-agent suspend | functional |
| Payments | proposal generation, policy evaluation, step-up approve/reject, PayPal order, capture, release, recent payment actions | functional (PayPal blocked without credentials) |
| Security | eight scenario buttons, run history, decision inspector, check detail, hold/failure summary | functional |
| Transactions | search, policy/status/date filters, sorting, pagination, row inspector, CSV and JSON export | functional |
| Audit | search, action filter, pagination, row inspector, chain verification, single-record export, copy JSON | functional |
| Settings | identity, signing key copy, integration readiness, active sessions, revoke all sessions | functional |

## Defects corrected in this pass

| Defect | Correction |
| --- | --- |
| Header notification bell was decorative with a fake unread dot | Replaced with a real audit-event panel backed by `/api/audit`; loading, empty and error states, outside-click/Escape close |
| Header search placeholder claimed agents and transactions but only mandates are searched | Relabelled honestly; implemented the advertised ⌘K/Ctrl-K focus shortcut |
| Mandates “Export signed JSON” linked to the audit page | Added `/api/mandates/export`, a downloadable document containing the signed canonical payload, hash, signature and key id |
| Audit “Export record API” exported the whole list | `/api/audit?eventId=…` now exports the selected record plus chain status |
| Status tabs on Mandate Center discarded active search/agent/currency filters | Tab links preserve the current filters |
| “Expired” mandate tab was labelled “Expiring” and could not match time-expired mandates | Relabelled and implemented a time-based `EXPIRED` filter |
| Settings displayed a fabricated “now + 12h” session expiry | Auth context now exposes the real persisted session expiry |
| Dashboard displayed a hardcoded “23 checks armed” | Replaced with an honest engine label; no invented count |
| Wizard and sign-in panel displayed “23 checks / 23 rules” | Replaced with deterministic-engine labels |
| Wizard and README named the retired Gemini 2.5 Flash | Updated UI labels and README to the configured Gemini 3.5 Flash |
| Payment governance stages were permanently marked incomplete | Stages 3/4 now reflect actual PayPal buyer-order and settled-capture records |
| Dashboard contained a disabled button used as a metric | Replaced with plain text |
| Transaction/audit grid overlay color was a fixed slate hex | Uses the theme token so the empty state is legible in light mode |
| Signed mandates had no explanation for the missing edit action | Detail page states that signed parameters are immutable and must be replaced by revoke + reissue |
| Gemini could hold the UI for ~20s with no bound | 30s abort signal + one retry, then the labelled deterministic fallback |

## Intentional limitations

- Mandates are immutable once signed; there is no edit action because editing would invalidate the
  proof. Revoke and reissue is the supported path.
- The audit ledger is hash-chained and application-append-only; it does not claim tamper-proof storage
  against a database administrator.
- The notification panel lists recent audit events. There is no separate unread/push notification
  service, and no fake unread count is shown.
- PayPal order creation, capture and webhook verification are implemented but cannot be exercised
  without sandbox credentials. The UI reports the exact missing configuration.
- No compliance certification is claimed.
- The header search intentionally searches mandates only; relabelled accordingly.

## Evidence

- `docs/TEST_REPORT.md` — executed commands, unit/E2E/scenario results.
- `screenshots/light-*-populated.png`, `screenshots/dark-*-populated.png` — live light/dark captures.
- `test-results/scenario-results.json` — eight scenario outcomes from the live engine.
- `smoke-final.log` — API pipeline, audit-chain and unauthenticated-access checks.
