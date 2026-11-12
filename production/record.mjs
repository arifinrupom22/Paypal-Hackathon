import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const account = JSON.parse(await readFile("test-results/presentation-account.json", "utf8"));
const timeline = JSON.parse(await readFile("production/timeline.json", "utf8"));
const segment = (name) => timeline.segments.find((entry) => entry.name === name);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const browser = await chromium.launch();
const auth = await browser.newContext();
const authPage = await auth.newPage();
await authPage.goto(`${account.baseUrl}/login`);
await authPage.getByLabel("Email").fill(account.email);
await authPage.getByLabel("Password").fill(account.password);
await authPage.getByRole("button", { name: /enter enclave/i }).click();
await authPage.waitForURL(`${account.baseUrl}/`, { timeout: 30000 });
await auth.storageState({ path: "production/storage-state.json" });
await auth.close();

const contextStart = Date.now();
const context = await browser.newContext({
  storageState: "production/storage-state.json",
  viewport: { width: 1440, height: 810 },
  deviceScaleFactor: 1,
  recordVideo: { dir: "production/raw", size: { width: 1440, height: 810 } },
});
await context.addInitScript(() => {
  const boot = () => {
    if (document.getElementById("__pact_cursor")) return;
    const cursor = document.createElement("div");
    cursor.id = "__pact_cursor";
    cursor.style.cssText =
      "position:fixed;left:-50px;top:-50px;width:20px;height:20px;border-radius:50%;" +
      "background:rgba(20,184,166,.22);border:2px solid rgba(94,234,212,.98);" +
      "box-shadow:0 0 0 6px rgba(20,184,166,.10),0 3px 12px rgba(0,0,0,.35);" +
      "pointer-events:none;z-index:2147483647;transform:translate(-50%,-50%);" +
      "transition:width .09s,height .09s,background .09s;";
    document.documentElement.appendChild(cursor);
    window.addEventListener(
      "mousemove",
      (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      },
      { passive: true },
    );
    window.addEventListener(
      "mousedown",
      () => {
        cursor.style.width = "27px";
        cursor.style.height = "27px";
        cursor.style.background = "rgba(94,234,212,.42)";
      },
      { passive: true },
    );
    window.addEventListener(
      "mouseup",
      () => {
        cursor.style.width = "20px";
        cursor.style.height = "20px";
        cursor.style.background = "rgba(20,184,166,.22)";
      },
      { passive: true },
    );
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
});

const page = await context.newPage();
await page.goto(`${account.baseUrl}/`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: /welcome back/i }).waitFor({ timeout: 30000 });
const ready = Date.now();
const start = (seconds) => ready + seconds * 1000;

async function waitUntil(timestamp) {
  await sleep(timestamp - Date.now());
}

async function move(x, y, steps = 24) {
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(160);
}

async function hover(locator, steps = 20) {
  const target = locator.first();
  await target.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const box = await target.boundingBox({ timeout: 4000 }).catch(() => null);
  if (!box) return false;
  await move(box.x + box.width / 2, box.y + box.height / 2, steps);
  return true;
}

async function click(locator, steps = 20) {
  const ok = await hover(locator, steps);
  if (!ok) throw new Error("Element is not visible for click");
  await page.mouse.down();
  await page.waitForTimeout(85);
  await page.mouse.up();
}

try {
  // Opening / problem / solution / live picture: dashboard holds.
  await waitUntil(start(0.35));
  await move(980, 420, 28);
  await waitUntil(start(10.0));
  const blocked = page.getByText(/blocked tx/i).first();
  await hover(blocked, 30);
  await waitUntil(start(22.2));
  const crypto = page.getByText(/ed25519 engine/i).first();
  await hover(crypto, 28);
  await waitUntil(start(33.6));
  const active = page.getByText(/active mandates/i).first();
  await hover(active, 28);

  // Mandate.
  await waitUntil(start(40.9));
  await click(page.getByRole("link", { name: "Mandate Center", exact: true }).first());
  await page.waitForURL(/\/mandates$/, { timeout: 10000 });
  const mandateLink = page.getByRole("link", { name: /Northline equipment renewal mandate/i }).first();
  await click(mandateLink);
  await page.getByRole("heading", { name: "Northline equipment renewal mandate" }).waitFor();
  await move(1040, 300, 24);
  const signature = page.getByText(/signature valid/i).first();
  await hover(signature, 26);

  // Agent identity.
  await waitUntil(start(57.8));
  await click(page.getByRole("link", { name: "Agent Control Center", exact: true }).first());
  await page.waitForURL(/\/agents$/, { timeout: 10000 });
  await click(page.getByRole("link", { name: /ProcureMaster-Root/i }).first());
  await page.getByRole("heading", { name: "ProcureMaster-Root" }).waitFor();
  await hover(page.getByText(/ed25519 public key/i).first(), 24);

  // Payment Center: live, genuine policy evaluation. No PayPal action.
  await waitUntil(start(70.7));
  await click(page.getByRole("link", { name: "Payment Center", exact: true }).first());
  await page.waitForURL(/\/payments$/, { timeout: 10000 });
  await page.locator("#pc-mandate").selectOption(account.mandateDbId);
  await page.locator("#pc-sku").selectOption("LG-STAND-ALUM");
  await page.locator("#pc-instruction").fill("Buy the anodised aluminium laptop stand from Northline Supply Co.");
  await page.waitForTimeout(400);
  await click(page.getByRole("button", { name: /generate signed proposal/i }));
  await page.getByRole("button", { name: /evaluate with pact/i }).waitFor({ timeout: 120000 });
  await hover(page.getByText(/Proposal signed by the agent/i).first(), 22);
  await click(page.getByRole("button", { name: /evaluate with pact/i }));
  await page.getByText("AUTHORIZED", { exact: true }).first().waitFor({ timeout: 120000 });
  await hover(page.getByText(/budget reserved atomically/i).first(), 22);

  // Transaction trace.
  await waitUntil(start(88.9));
  await click(page.getByRole("link", { name: "Transaction Ledger", exact: true }).first());
  await page.waitForURL(/\/transactions$/, { timeout: 10000 });
  const row = page.locator(".ag-row").filter({ hasText: "Northline Supply Co." }).filter({ hasText: "38 USD" }).last();
  await click(row);
  await page.waitForTimeout(300);
  await click(page.getByRole("link", { name: /open full authorization trace/i }).first());
  await page.waitForLoadState("networkidle");
  await page.getByText(/every stage, from proposal to capture/i).first().waitFor();
  await click(page.getByRole("button", { name: /inspect budget check/i }).first());
  await hover(page.getByText(/paypal approval/i).first(), 22);

  // Security Center.
  await waitUntil(start(99.2));
  await click(page.getByRole("link", { name: "Security Center", exact: true }).first());
  await page.waitForURL(/\/security$/, { timeout: 10000 });
  await hover(page.getByText(/8 boundaries held/i).first(), 22);
  await page.waitForTimeout(1000);
  await hover(page.getByText(/concurrent spending/i).first(), 24);

  // Blocked decision.
  await waitUntil(start(112.8));
  await click(page.getByRole("link", { name: /security intelligence/i }).first());
  await page.waitForURL(/\/security\/intelligence$/, { timeout: 10000 });
  await click(page.getByRole("link", { name: /explain decision/i }).first());
  await page.waitForLoadState("networkidle");
  await hover(page.getByText(/authorization denied:\s*remaining budget/i).first(), 22);

  // Delegation.
  await waitUntil(start(125.3));
  await click(page.getByRole("link", { name: "Agent Control Center", exact: true }).first());
  await page.waitForURL(/\/agents$/, { timeout: 10000 });
  await click(page.getByRole("link", { name: "Delegation graph", exact: true }).first());
  await page.waitForURL(/\/agents\/graph$/, { timeout: 10000 });
  await click(page.getByRole("button", { name: /Security Harness Child/i }).first());
  await hover(page.getByText(/delegated authority containment/i).first(), 22);

  // Audit.
  await waitUntil(start(137.0));
  await click(page.getByRole("link", { name: "Audit & Compliance", exact: true }).first());
  await page.waitForURL(/\/audit$/, { timeout: 10000 });
  await hover(page.getByText("100%", { exact: true }).first(), 22);
  await page.waitForTimeout(700);
  await hover(page.getByText("0 signature failures", { exact: true }).first(), 22);

  // PayPal boundary.
  await waitUntil(start(149.7));
  await click(page.getByRole("link", { name: "Payment Center", exact: true }).first());
  await page.waitForURL(/\/payments$/, { timeout: 10000 });
  await hover(page.getByText(/paypal sandbox credentials are not configured/i).first(), 22);
  await page.waitForTimeout(700);
  await hover(page.getByText(/credentials required/i).first(), 22);

  // Close on dashboard.
  await waitUntil(start(163.6));
  await click(page.getByRole("link", { name: "Overview", exact: true }).first());
  await page.waitForURL(`${account.baseUrl}/`, { timeout: 10000 });
  await move(720, 370, 26);

  await waitUntil(start(timeline.total + 0.45));
  console.log("READY_SECONDS", ((ready - contextStart) / 1000).toFixed(3));
  console.log("RECORDED_SECONDS", ((Date.now() - ready) / 1000).toFixed(3));
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) console.log("VIDEO_PATH", await video.path());
}
