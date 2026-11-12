// Re-verifies the competition surfaces against an account that already contains
// policy decisions and transactions. Requires PROBE_EMAIL / PROBE_PASSWORD.
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const EMAIL = process.env.PROBE_EMAIL;
const PASSWORD = process.env.PROBE_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("PROBE_EMAIL and PROBE_PASSWORD are required.");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${BASE}/login`);
await page.getByLabel("Email").fill(EMAIL);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: /enter enclave/i }).click();
await page.waitForURL(`${BASE}/`, { timeout: 30_000 });
await page.getByRole("button", { name: /switch to light mode/i }).click();

function assertNoHorizontalOverflow(label) {
  return page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  })).then(({ viewport, content }) => {
    assert.ok(content <= viewport + 1, `${label} overflows horizontally: ${content} > ${viewport}`);
  });
}

// Delegation graph: select the child and expose the containment panel.
await page.goto(`${BASE}/agents/graph`);
await page.getByRole("heading", { name: "Delegation Graph", exact: true }).waitFor();
const childNode = page.getByRole("button", { name: /Harness Child/i }).first();
if (await childNode.isVisible()) {
  await childNode.click();
  await page.getByText("Delegated authority containment").waitFor();
  await page.getByText("Parent authority active").waitFor();
  await page.getByText("withdrawn", { exact: true }).waitFor();
}
await page.screenshot({ path: "screenshots/light-delegation-graph.png" });
await assertNoHorizontalOverflow("Delegation graph");
console.log("delegation-graph: rendered");

// Security intelligence and a real denied decision explanation.
await page.goto(`${BASE}/security/intelligence`);
await page.getByRole("heading", { name: "Security Intelligence", exact: true }).waitFor();
assert.ok((await page.getByText(/Failure categories/i).count()) > 0, "security intelligence did not render");
await page.screenshot({ path: "screenshots/light-security-intelligence.png" });
await assertNoHorizontalOverflow("Security intelligence");
console.log("security-intelligence: rendered");

const explain = page.getByRole("link", { name: /Explain decision/i }).first();
if (await explain.isVisible()) {
  await explain.click();
  await page.getByText("Conditions evaluated", { exact: true }).waitFor();
  await page.screenshot({ path: "screenshots/light-decision-explanation.png" });
  await assertNoHorizontalOverflow("Decision explanation");
  console.log("decision-explanation: rendered");
} else {
  throw new Error("No decision explanation link was recorded.");
}

// Transaction trace with a real budget-stage selection.
await page.goto(`${BASE}/transactions`);
await page.locator(".ag-row").first().click();
await page.getByRole("link", { name: /Open full authorization trace/i }).click();
await page.waitForURL(/\/transactions\//);
await page.getByRole("button", { name: /Inspect Budget check/i }).click();
await page.getByText("Amount validity").waitFor();
await page.screenshot({ path: "screenshots/light-authorization-trace.png" });
await assertNoHorizontalOverflow("Authorization trace");
console.log("authorization-trace: rendered");

// Audit deep link from a security run.
await page.goto(`${BASE}/security`);
const auditLink = page.getByRole("link", { name: /Open audit evidence/i }).first();
await auditLink.waitFor();
await auditLink.click();
await page.waitForURL(/\/audit\?eventId=/);
await page.getByText("Attestation inspector").waitFor();
const eventId = new URL(page.url()).searchParams.get("eventId");
assert.ok(eventId, "audit deep link did not carry an event id");
assert.ok((await page.getByText(eventId, { exact: true }).count()) > 0, "selected audit event is not visible");
console.log("audit-deep-link: rendered");

// Cryptographic proof, including the overflow regression check.
await page.goto(`${BASE}/mandates`);
await page.locator('a[href^="/mandates/mnd_"]').first().click();
await page.getByText("Public key fingerprint", { exact: true }).waitFor();
await page.getByText("Not revoked", { exact: true }).waitFor();
const fingerprintCopy = page
  .getByText("Public key fingerprint", { exact: true })
  .locator("..")
  .getByRole("button", { name: "Copy" });
const copyBox = await fingerprintCopy.boundingBox();
assert.ok(copyBox, "fingerprint copy control is not rendered");
assert.ok(copyBox.x + copyBox.width <= 1440, "fingerprint copy control is clipped");
await page.screenshot({ path: "screenshots/light-mandate-proof.png" });
await assertNoHorizontalOverflow("Mandate proof");
console.log("mandate-proof: rendered");

await browser.close();
console.log(JSON.stringify({ email: EMAIL, passed: true }));
