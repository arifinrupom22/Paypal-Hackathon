# PACT

**The Permission Layer for AI Payments.**

PACT is an independent authorization and security layer for AI-driven commerce. Owners sign
cryptographically bounded mandates; autonomous agents can only propose purchases inside those
bounds; a deterministic backend policy engine decides whether money may move; PayPal settles the
approved order.

```
AI proposes → PACT verifies → User authorizes → PayPal processes
```

The model never grants itself payment authority.

---

## Stack

| Layer | Implementation |
| --- | --- |
| Frontend | Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn-style primitives, Lucide |
| Backend | Next.js Route Handlers (Node.js runtime), modular services |
| Database | PostgreSQL + Prisma ORM, `NUMERIC(18,2)` money columns, UUID/cuid identifiers |
| AI | Gemini 3.5 Flash through the Vercel AI SDK, Zod-validated structured output |
| Cryptography | Node.js `crypto` — Ed25519 (PKCS#8/SPKI), SHA-256 canonical hashing, AES-256-GCM agent key vault |
| Payments | PayPal REST Orders API v2 (Sandbox), server-side OAuth, capture verification, webhook signature verification |
| Tables | AG Grid Community (theme-aware quartz grid) |
| Charts | Recharts |
| Tests | Vitest (policy, crypto, decimal arithmetic), Playwright (owner journeys) |

---

## Getting started

### 1. PostgreSQL

Any PostgreSQL 14+ instance works. With Docker:

```bash
docker run -d --name pact-postgres \
  -e POSTGRES_PASSWORD=pact -e POSTGRES_USER=pact -e POSTGRES_DB=pact \
  -p 5432:5432 postgres:16-alpine
```

### 2. Install

```bash
npm install
```

### 3. Environment

```bash
cp .env.example .env.local
npm run keys:generate        # prints PACT_PRIVATE_KEY, PACT_PUBLIC_KEY, AUTH_SECRET
```

Fill `.env.local`:

```
DATABASE_URL=postgresql://pact:pact@localhost:5432/pact?schema=public
APP_URL=http://localhost:3000

# signing + session secrets (generated above)
PACT_PRIVATE_KEY=...
PACT_PUBLIC_KEY=...
AUTH_SECRET=...

# optional integrations
GEMINI_API_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_WEBHOOK_ID=
```

`DATABASE_URL` must also be visible to the Prisma CLI. Either export it or keep a `.env` file
containing `DATABASE_URL` (both `.env` and `.env.local` are git-ignored).

Never commit real credentials. `PACT_PRIVATE_KEY` stays server-side; no API response, client bundle
or log line exposes it.

### 4. Database

```bash
npm run db:migrate  # applies prisma/migrations (baseline included)
npm run db:seed     # seeds the purchasable catalog (reference data only)
```

For a disposable local database, `npm run db:push` remains available. The checked-in initial
migration is the production path; it was baselined against the existing schema in this workspace.

### 5. Run

```bash
npm run dev
```

Open <http://localhost:3000> and create an account. A fresh account has no mandates, agents,
transactions or analytics — the interface shows explicit empty states until real activity exists.

### Themes

Dark is the default. The header toggle (and the sign-in corner toggle) switches to a light palette,
persists the choice in `localStorage`, and applies it before first paint. Tokens, AG Grid and charts
follow the active theme; no data or authority changes with appearance.

---

## Architecture

```
src/
  app/
    (auth)/login, (auth)/register          session entry points
    (app)/                                 authenticated application shell
      page.tsx                             dashboard (real DB metrics)
      mandates/                            center, wizard, detail + proof
      agents/                              fleet, topology, inspector
      security/                            executable attack lab + intelligence analytics
      payments/                            proposal → policy → PayPal → capture
      transactions/                        AG Grid ledger + per-transaction authorization trace
      decisions/                           passed/failed check explainability
      agents/graph/                        interactive delegation graph
      audit/                               hash-chain ledger + signature inspector
      settings/                            identity, keys, integrations, sessions
    api/                                   route handlers (auth, mandates, agents,
                                           proposals, policy, approvals, payments,
                                           webhooks, attacks, audit, analytics)
  components/                              design system + feature components
  lib/
    auth/                                  scrypt passwords, sessions, CSRF, guards
    crypto/                                canonicalization, Ed25519, agent key vault
    policy/engine.ts                       deterministic authorization engine
    services/                              mandates, agents, proposals, policy,
                                           payments, webhooks, attacks, analytics
    paypal.ts                              PayPal REST client (server-only)
    ai/                                    Gemini intent parsing + purchase selection
    audit.ts                               hash-chained, signed audit log
    validation/                            Zod schemas
prisma/schema.prisma                       data model
tests/unit                                 policy + cryptography + decimal tests
tests/e2e                                  Playwright owner journeys
```

---

## Security model

**Mandates.** Each mandate is serialized into a canonical JSON payload (recursively sorted keys,
fixed decimal formatting, ISO-8601 UTC timestamps) and signed with the platform Ed25519 key. The
payload is rebuilt from persisted columns at every verification; mutating a signed column breaks the
signature. Signing only happens server-side after explicit owner confirmation.

**Policy engine.** `src/lib/policy/engine.ts` is a pure function over a database snapshot. It
verifies the mandate signature, hash, owner binding, status, expiry, revocation, agent identity,
proposal signature, amount precision, currency, merchant allowlist, category allowlist,
per-transaction ceiling, remaining budget, transaction count, execution/idempotency uniqueness,
delegation containment and step-up approvals. It returns `AUTHORIZED`, `BLOCKED`,
`REQUIRES_USER_APPROVAL`, `EXPIRED` or `REVOKED`, plus every check result and an explanation.

**Atomic budgets.** Authorization and reservation happen inside a PostgreSQL transaction with
`SELECT … FOR UPDATE` on the mandate row. The engine is re-evaluated inside the lock, so parallel
proposals cannot overspend. Execution IDs and idempotency keys are unique columns.

**Delegation.** Child mandates must fit inside the parent's remaining budget and expiry, use a
subset of the parent's merchant/category scope, and bind to an agent that descends from the
delegating agent. Revoking a parent cascades to every descendant, and the policy engine re-checks
the ancestor chain at decision time.

**Payments.** PACT authorization is not PayPal buyer approval. Order creation revalidates the
mandate and agent; capture only records `SETTLED` after PayPal reports `COMPLETED` with a matching
amount, currency and capture id. An amount/currency mismatch retains the reservation and requires
reconciliation; cancellation is refused once a PayPal order exists. Credentials never reach the
browser. Webhooks are verified with the PayPal webhook ID before mutation and deduplicated by event
ID.

**Sessions.** Opaque 256-bit session tokens are stored hashed (HMAC-SHA256); cookies are httpOnly and
SameSite=Lax. Passwords use scrypt (N=16384). Mutations require a CSRF token bound to the session
and same-origin requests. Sensitive endpoints are rate limited. Every query is scoped by the
authenticated owner.

**Audit.** Events are appended under a per-owner advisory lock, each record hashes its canonical body with
the previous hash, and the hash is signed with the platform key. The audit page recomputes the chain
and every signature. This is genuine hash-chained, signed application behaviour — the project does
not claim tamper-proof storage at rest.

**Agent identities.** Each agent receives its own Ed25519 key pair. The private key is encrypted with
AES-256-GCM using a key derived from `AUTH_SECRET` and is never returned by an API. Proposals are
signed by the agent and verified by the engine.

---

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/logout-all` | session lifecycle |
| GET/POST | `/api/mandates` | list with filters / create + sign |
| GET | `/api/mandates/export` | downloadable signed canonical payloads + proofs |
| POST | `/api/mandates/parse` | Gemini or deterministic intent extraction |
| GET | `/api/mandates/[id]` | detail, proof, spend, decisions |
| POST | `/api/mandates/[id]/revoke` | revoke (cascades to descendants) |
| POST | `/api/mandates/[id]/delegate` | create a contained child mandate |
| GET/POST | `/api/agents` | fleet / register identity |
| GET | `/api/agents/[id]` | detail + activity |
| POST | `/api/agents/[id]/suspend` | suspend or resume |
| GET/POST | `/api/proposals` | list / create signed proposal (agent or manual) |
| POST | `/api/policy/evaluate` | authoritative decision + atomic reservation |
| POST | `/api/approvals/[id]` | approve or reject a step-up request |
| POST | `/api/payments/create-order` | create PayPal order |
| POST | `/api/payments/[id]/capture` | capture + verify settlement |
| POST | `/api/payments/[id]/reconcile` | reconcile an existing PayPal order/capture without inventing a settlement |
| POST | `/api/payments/[id]/cancel` | release a reservation only before a PayPal order exists |
| POST | `/api/webhooks/paypal` | verified, deduplicated PayPal events |
| GET/POST | `/api/attacks`, `/api/attacks/run` | security scenarios |
| GET | `/api/audit` | event list + chain verification; `?eventId=` exports one record |
| GET | `/api/analytics` | metrics, stream, categories, daily series |

All responses use `{ ok: true, data }` or `{ ok: false, error: { code, message, details } }`.

---

## Security attack lab

The Security Center executes eight scenarios against the real engine and stores each run with its
actual decision, checks and timing:

1. **Budget manipulation** — signed amount mutated in the database.
2. **Prompt injection** — instruction text attempts to override policy.
3. **Execution replay** — consumed execution identifier resubmitted.
4. **Merchant substitution** — counterparty outside the allowlist.
5. **Forged approval** — fabricated step-up approval reference.
6. **Expired mandate** — proposal submitted after expiry.
7. **Revoked parent** — delegated mandate exercised after ancestor revocation.
8. **Concurrent spending** — parallel proposals under a serialized row lock.

Each scenario creates isolated harness agents and mandates owned by the signed-in account and
records a `SECURITY_TEST_EXECUTED` audit event. Nothing is simulated in the UI.

Prompt injection is mitigated by design (model text is never authority), not claimed to be
eliminated.

---

## Competition product surfaces

- **Authorization trace** — open any transaction from the ledger to inspect its seven real stages:
  proposal, mandate proof, agent permission, budget, policy, PayPal approval and capture. Selecting a
  stage reveals the persisted checks and provider state.
- **Delegation graph** — `/agents/graph` visualises parent and child agents, signed ceilings, scopes
  and revocation. Containment compares the child mandate with the parent mandate and marks revoked
  authority as withdrawn.
- **Security intelligence** — `/security/intelligence` aggregates real decisions into trends, failure
  categories, replay/budget/merchant counts, step-up holds and revocation events.
- **Decision explainability** — every blocked or step-up decision has a page listing passed and failed
  checks, the engine explanation and whether PayPal was ever reached.
- **Cryptographic evidence** — mandate detail shows algorithm, public-key fingerprint, mandate id,
  signature verification, status, expiry and revocation without exposing private keys.
- **Reproducible attacks** — each scenario shows its actual manipulated input and engine response and
  links directly to its hash-chained audit record.

---

## Tests

```bash
npm run typecheck
npm run lint
npm test          # Vitest: policy engine, Ed25519/canonicalization, decimal precision
npm run test:e2e  # Playwright: onboarding + signed mandate + export; theme; attack lab
node scripts/smoke.mjs  # live API smoke: mandate → AUTHORIZED → reservation → attacks
node scripts/verify-scenarios.mjs  # all eight scenarios + populated light/dark captures
PROBE_EMAIL=... PROBE_PASSWORD=... node scripts/verify-product-surfaces.mjs
node scripts/probe-parse.mjs  # live Gemini intent latency probe

# Loopback-only payment state-machine test. Start scripts/mock-paypal.mjs and a second app with
# PACT_ALLOW_PAYPAL_MOCK=1 and PACT_PAYPAL_MOCK_URL=http://127.0.0.1:4100; never use in deployment.
BASE_URL=http://localhost:3102 MOCK_URL=http://127.0.0.1:4100 node scripts/verify-payment-mock.mjs
```

Set `BASE_URL` for the scripts and `PLAYWRIGHT_BASE_URL` for Playwright (default
`http://localhost:3000`). Both need a running app and database; run
`npx playwright install chromium` once. Verified on a production build: 35 unit tests pass, 3/3 owner
journeys pass, all six product-surface assertions pass, the smoke run returns `AUTHORIZED` with 17
checks, all eight security scenarios report `BOUNDARY_HELD` (concurrent spending authorizes 2 of 4),
and the smoke account's 30-record audit chain verifies. Gemini intent extraction was verified live at
~20s latency. The loopback PayPal-contract mock passed the local order → capture → webhook lifecycle,
but **real PayPal Sandbox order/capture and webhook verification remain unverified** without sandbox
credentials. Full evidence is in `docs/TEST_REPORT.md` and `docs/PRODUCT_READINESS.md`.

---

## Configuration limits

- **Gemini** — without `GEMINI_API_KEY`, the mandate builder uses a deterministic keyword parser,
  labelled as such in the interface. All extracted fields remain editable and require confirmation.
- **PayPal** — without sandbox credentials, the UI reports that order creation is unavailable and no
  payment is claimed. With credentials and `PAYPAL_WEBHOOK_ID`, the implementation is configured for
  Sandbox orders, captures and verified webhooks; this environment has no credentials and no live
  payment is claimed. The [Sandbox runbook](docs/PAYPAL_SANDBOX_RUNBOOK.md) defines the evidence
  required before calling a run live-verified.
- **Signing keys** — without `PACT_PRIVATE_KEY`/`PACT_PUBLIC_KEY`, mandate signing and verification
  fail with an explicit configuration error rather than falling back to unsigned authorization.

### PayPal sandbox setup

See the [PayPal Sandbox integration runbook](docs/PAYPAL_SANDBOX_RUNBOOK.md) for the exact
preflight, public-origin validation, webhook, buyer-approval, capture and evidence checklist. The
short version follows.

1. Sign in at <https://developer.paypal.com/dashboard/> and switch to **Sandbox**.
2. **Apps & Credentials → Create App** (type *Merchant*, e.g. `PACT Sandbox`). Copy its **Client ID**
   and **Secret** into `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env.local`.
3. For settlement webhooks, expose the app publicly (`cloudflared tunnel --url http://localhost:3000`
   or `ngrok http 3000`), then in the app open **Webhooks → Add Webhook** with URL
   `https://<public-host>/api/webhooks/paypal` and subscribe to `PAYMENT.CAPTURE.COMPLETED`,
   `PAYMENT.CAPTURE.DENIED` and `PAYMENT.CAPTURE.REFUNDED`. Copy the generated **Webhook ID** into
   `PAYPAL_WEBHOOK_ID`. Order creation and capture work without it; webhook verification does not.
4. Under **Sandbox → Accounts**, use (or create) a *Personal* account as the buyer. PayPal shows its
   sandbox email/password on the approval screen.
5. Keep `APP_URL` equal to the origin you open in the browser (`http://localhost:3000`) so the PayPal
   return lands on `/payments/return`, where PACT captures server-side and verifies the amount.

Restart the app after changing `.env.local`; environment variables are read at boot. `APP_URL` must
be the exact origin/PayPal return origin, not merely the port used for a local test.

For local contract testing only, `PACT_ALLOW_PAYPAL_MOCK=1` plus a loopback
`PACT_PAYPAL_MOCK_URL` enables `scripts/mock-paypal.mjs`. Both are off by default. This harness is not
a PayPal fallback and must never be enabled in a deployed environment; its results are not live
Sandbox evidence.

### Gemini API key

Create a key at <https://aistudio.google.com/apikey> and set `GEMINI_API_KEY` in `.env.local`.
Without it the interface labels the parser and selector as deterministic fallbacks. Model calls are
bounded at 30 seconds and fall back to the deterministic parser/selector on failure.

---

## Submission Deliverables

### Demo Video & AI Production Credits

**Final demo video:** [`submission/PACT_Hackathon_Demo.mp4`](submission/PACT_Hackathon_Demo.mp4) — 3:04.5, 1920×1080, 30 fps, H.264 High, AAC stereo, with an embedded English subtitle track.

**Voiceover:** [`submission/PACT_Voiceover.mp3`](submission/PACT_Voiceover.mp3) — 180.1 s narration track.

**English subtitles:** [`submission/PACT_Hackathon_Demo.srt`](submission/PACT_Hackathon_Demo.srt) — 52 curated cues, 0:02.700–3:01.480; also embedded in the MP4 as a selectable `mov_text` track.

**Thumbnail:** [`submission/PACT_Demo_Thumbnail.png`](submission/PACT_Demo_Thumbnail.png) — 1920×1080, built from an actual Security Center frame.

**Production report:** [`submission/VIDEO_PRODUCTION_REPORT.md`](submission/VIDEO_PRODUCTION_REPORT.md) — capture, edit, verification and limitations.

| Task | Tool / model actually used | Version | Official site | What it did |
| --- | --- | --- | --- | --- |
| Screen recording | **Playwright / Chromium** | 1.64.1 | <https://playwright.dev/> | Scripted capture of the locally running PACT app at a 1440×810 viewport, with a custom teal cursor and deliberate navigation. |
| AI voiceover | **Microsoft Edge Neural TTS (`en-US-ChristopherNeural`) via `edge-tts`** | edge-tts 7.3.1 | <https://github.com/rany2/edge-tts> | Generated the 14 English narration segments at +18% rate; no voice cloning and no other voice model. |
| AI video generation | **None** | — | — | No AI video-generation model was used. All application footage is a real screen capture. |
| Video editing and encoding | **FFmpeg** | 9.0.2 | <https://ffmpeg.org/> | Trim, scale to 1920×1080, conform to 30 fps, composite lower thirds, mix audio, encode H.264/AAC. |
| English subtitles and remux | **FFmpeg + Python** | FFmpeg 9.0.2, Python 3.11.9 | <https://ffmpeg.org/> / <https://www.python.org/> | Curated a 52-cue English SRT from the recorded narration script and embedded it as `mov_text`; the H.264/AAC streams and lower thirds were copied bit-for-bit. |
| Title cards, lower thirds and thumbnail | **Pillow** | 12.3.0 | <https://python-pillow.org/> | Rendered the typography and graphics from an actual application frame and local system fonts; no AI image generation. |
| Automation and build orchestration | **Python / Node.js** | Python 3.11.9, Node 24.18.0 | <https://www.python.org/> / <https://nodejs.org/> | Ran the recording, asset generation and deterministic edit scripts. |
| Ambient bed | **FFmpeg signal synthesis** | 9.0.2 | <https://ffmpeg.org/> | Low-volume 55/82.41/110 Hz sine bed plus filtered pink noise. It is not a licensed track or an AI music model. |

The AI narration is the only AI-generated media asset. The screen recording, application data, title cards, lower thirds, thumbnail composition and edit are conventional deterministic production. The English subtitles were curated from the recorded narration script, not AI-transcribed. Adding the subtitle track did not re-encode the picture or audio; the current lower thirds and narration timing are unchanged. The source recording was 1440×810 at 25 fps and was upscaled/conformed to the required 1920×1080 at 30 fps.

**Honest PayPal boundary.** The recording was made against the prepared local account. No PayPal Sandbox credentials were configured, and no PayPal approval, order, capture, settlement, or live Sandbox verification was executed or claimed. The dashboard's legacy `$80.00 captured via PayPal` figure is local application data in the prepared account, not live Sandbox evidence. The video shows `PAYPAL APPROVAL: not started`, `VERIFIED CAPTURE: not captured`, the PayPal section's configuration notice, and a closing card stating that no approval, order, capture, or settlement was executed. Audit verification is hash-chained application evidence, not immutable storage.

No passwords, API keys, `.env` contents, session secrets, or prepared-account credential files are shown in the deliverables.

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model and threat model](docs/SECURITY.md)
- [API reference](docs/API.md)
- [Feature and control audit](docs/FEATURE_AUDIT.md)
- [Executed test report](docs/TEST_REPORT.md)
- [Product readiness and engineering review](docs/PRODUCT_READINESS.md)
- [PayPal Sandbox integration runbook](docs/PAYPAL_SANDBOX_RUNBOOK.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)
- [Final architecture](docs/FINAL_ARCHITECTURE.md)
- [Judge presentation](docs/JUDGE_PRESENTATION.md)
- [Video recording guide](docs/VIDEO_RECORDING_GUIDE.md)
