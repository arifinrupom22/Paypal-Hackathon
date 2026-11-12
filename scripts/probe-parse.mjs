// Measures the real mandate-parse endpoint against a running app.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const email = `probe.${Date.now()}@apex.test`;
await page.goto(`${BASE}/register`);
await page.getByLabel("Full name").fill("Parse Probe");
await page.getByLabel("Organization").fill("Apex Systems");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill("parse-probe-passphrase-2026");
await page.getByRole("button", { name: /create account/i }).click();
await page.waitForURL(`${BASE}/`, { timeout: 30_000 });

const cookies = await context.cookies();
const csrf = cookies.find((cookie) => cookie.name === "pact_csrf")?.value ?? "";
const started = Date.now();
const response = await page.request.post(`${BASE}/api/mandates/parse`, {
  headers: { "x-pact-csrf": csrf, Origin: BASE },
  data: {
    instruction:
      "Find a laptop stand under $50. Only purchase from approved merchants. Allow one transaction within 24 hours.",
  },
  timeout: 120_000,
});
const elapsed = Date.now() - started;
const body = await response.json().catch(() => null);
console.log(
  JSON.stringify(
    {
      status: response.status(),
      elapsedMs: elapsed,
      parser: body?.data?.parser ?? null,
      error: body?.error ?? null,
      draft: body?.data?.draft
        ? {
            maxTotal: body.data.draft.maxTotal,
            maxPerTransaction: body.data.draft.maxPerTransaction,
            maxTransactions: body.data.draft.maxTransactions,
            expiresAt: body.data.draft.expiresAt,
          }
        : null,
    },
    null,
    2,
  ),
);

await browser.close();
