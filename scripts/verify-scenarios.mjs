// Executes every security scenario against a running PACT instance and
// captures populated screenshots in both themes.
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const SCENARIOS = [
  "budget_manipulation",
  "prompt_injection",
  "token_replay",
  "merchant_substitution",
  "forged_approval",
  "expired_mandate",
  "revoked_parent",
  "concurrent_spending",
];

await mkdir("screenshots", { recursive: true });
await mkdir("test-results", { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

await page.goto(`${BASE}/register`);
const email = `scenarios.${Date.now()}@apex.test`;
await page.getByLabel("Full name").fill("Scenario Review");
await page.getByLabel("Organization").fill("Apex Systems");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill("scenario-review-passphrase-2026");
await page.getByRole("button", { name: /create account/i }).click();
await page.waitForURL(`${BASE}/`, { timeout: 30_000 });

const csrf = (await context.cookies()).find((cookie) => cookie.name === "pact_csrf")?.value ?? "";
const results = [];

for (const scenario of SCENARIOS) {
  const response = await page.request.post(`${BASE}/api/attacks/run`, {
    headers: { "x-pact-csrf": csrf, Origin: BASE },
    data: { scenario },
    timeout: 120_000,
  });
  const body = await response.json().catch(() => null);
  const run = body?.data?.run;
  results.push({
    scenario,
    httpStatus: response.status(),
    boundary: run?.status ?? "ERROR",
    outcome: run?.outcome ?? body?.error?.message ?? "no response",
    checks: Array.isArray(run?.checks) ? run.checks.length : 0,
    durationMs: run?.durationMs ?? null,
  });
  console.log(`${scenario}: ${results.at(-1).boundary} | ${results.at(-1).outcome}`);
}

await writeFile("test-results/scenario-results.json", JSON.stringify(results, null, 2));

await page.goto(`${BASE}/security`);
await page.getByRole("button", { name: /switch to light mode/i }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: "screenshots/light-security-populated.png" });
await page.screenshot({ path: "screenshots/light-security-full.png", fullPage: true });

for (const [path, name] of [
  ["/", "light-dashboard-populated"],
  ["/audit", "light-audit-populated"],
  ["/transactions", "light-transactions-populated"],
  ["/mandates", "light-mandates-populated"],
  ["/agents", "light-agents-populated"],
  ["/security/intelligence", "light-security-intelligence"],
  ["/agents/graph", "light-delegation-graph"],
]) {
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `screenshots/${name}.png` });
}

await page.goto(`${BASE}/transactions`);
await page.locator(".ag-row").first().click();
await page.getByRole("link", { name: /open full authorization trace/i }).click();
await page.waitForURL(/\/transactions\//);
await page.getByRole("button", { name: /inspect budget check/i }).click();
await page.screenshot({ path: "screenshots/light-authorization-trace.png" });

await page.goto(`${BASE}/mandates`);
await page.locator('a[href^="/mandates/mnd_"]').first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshots/light-mandate-proof.png" });

await page.goto(`${BASE}/security`);
await page.getByRole("button", { name: /switch to dark mode/i }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: "screenshots/dark-security-populated.png" });

const failures = results.filter((entry) => entry.boundary !== "BOUNDARY_HELD");
await browser.close();
console.log(JSON.stringify({ total: results.length, failures, email }, null, 2));
if (failures.length > 0) process.exitCode = 1;
