# PACT API

All routes are Node.js route handlers under `/api`. JSON responses use one envelope:

```json
{ "ok": true, "data": { "...": "..." } }
```

```json
{ "ok": false, "error": { "code": "VALIDATION_FAILED", "message": "…", "details": {} } }
```

Errors: `400`, `401 UNAUTHENTICATED`, `403 CSRF_REJECTED / ORIGIN_REJECTED`, `404 NOT_FOUND`,
`409` for conflicting state, `422 VALIDATION_FAILED`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR`,
`503 CONFIGURATION_REQUIRED`.

## Authentication

- Session cookie `pact_session` is httpOnly; `pact_csrf` is readable by same-origin JS.
- Mutations require `x-pact-csrf` with the value of the CSRF cookie.
- Mutations also require an `Origin` header matching the request host when an origin is present.
- Every data route scopes reads/writes to the authenticated owner.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | create owner + session |
| POST | `/api/auth/login` | verify password + create session |
| POST | `/api/auth/logout` | revoke current session |
| POST | `/api/auth/logout-all` | revoke all owner sessions |
| GET | `/api/mandates` | list with `status`, `q`, `currency`, `agentId` |
| POST | `/api/mandates` | validate, canonicalize, sign and persist a mandate |
| POST | `/api/mandates/parse` | Gemini/deterministic intent draft (no signing) |
| GET | `/api/mandates/export` | attachment: signed canonical payloads + proofs |
| GET | `/api/mandates/[id]` | detail, proof, spend, decisions |
| POST | `/api/mandates/[id]/revoke` | revoke and cascade to descendants |
| POST | `/api/mandates/[id]/delegate` | create a contained child mandate |
| GET/POST | `/api/agents` | list / register an Ed25519 agent identity |
| GET | `/api/agents/[id]` | identity detail and activity |
| POST | `/api/agents/[id]/suspend` | suspend/resume (`action: SUSPEND\|RESUME`) |
| GET/POST | `/api/proposals` | list proposals / create signed proposal |
| POST | `/api/policy/evaluate` | authoritative decision + atomic reservation |
| POST | `/api/approvals/[id]` | owner approve/reject a step-up request |
| POST | `/api/payments/create-order` | create a PayPal order for an authorized transaction |
| POST | `/api/payments/[id]/capture` | capture and verify settlement server-side |
| POST | `/api/payments/[id]/reconcile` | reconcile an existing PayPal order/capture without inventing settlement |
| POST | `/api/payments/[id]/cancel` | release a reservation only before an order exists |
| POST | `/api/webhooks/paypal` | verified, deduplicated PayPal events |
| GET/POST | `/api/attacks`, `/api/attacks/run` | list / execute security scenarios |
| GET | `/api/audit` | paginated events, action counts, chain verification |
| GET | `/api/audit?eventId=…` | export one audit record with chain status |
| GET | `/api/analytics` | metrics, 24h stream, categories, daily series |

## Mandate export

`GET /api/mandates/export` returns a downloadable document (not the JSON envelope):

```json
{
  "format": "pact.mandates.v1",
  "exportedAt": "2026-11-07T07:40:00.000Z",
  "ownerId": "…",
  "count": 1,
  "mandates": [
    {
      "mandateId": "mnd_…",
      "status": "ACTIVE",
      "revokedAt": null,
      "payload": { "schema": "pact.mandate.v1", "...": "..." },
      "canonicalHash": "…64 hex…",
      "signature": "base64…",
      "signingKeyId": "ed25519:…"
    }
  ]
}
```

The payload is the canonical schema that was signed, so the Ed25519 proof can be re-verified with the
public key shown in Settings.

## Policy evaluation example

```http
POST /api/policy/evaluate
x-pact-csrf: <token>
Content-Type: application/json

{
  "proposalId": "prop_…",
  "executionId": "exec_…",
  "idempotencyKey": "idem_…",
  "approvalId": null
}
```

The response contains `outcome` (`AUTHORIZED`, `BLOCKED`, `REQUIRES_USER_APPROVAL`, `EXPIRED`,
`REVOKED`), every check, the failed check ids, an explanation, and any reserved `transactionId` or
step-up `approvalId`. Reusing an execution id or idempotency key is rejected.

## Security scenarios

`POST /api/attacks/run` with `{ "scenario": "budget_manipulation" }` creates isolated harness agents
and mandates owned by the caller, submits manipulated proposals, stores the real decision and returns
the run. Supported ids: `budget_manipulation`, `prompt_injection`, `token_replay`,
`merchant_substitution`, `forged_approval`, `expired_mandate`, `revoked_parent`,
`concurrent_spending`.

## PayPal webhook

`POST /api/webhooks/paypal` verifies the PayPal transmission signature using `PAYPAL_WEBHOOK_ID`,
deduplicates by event id, and only then reacts to capture completed/denied/refunded events. It does not
use a session or CSRF token; PayPal authentication is the signature. Without the webhook id,
verification fails closed and no settlement is recorded from webhooks.
