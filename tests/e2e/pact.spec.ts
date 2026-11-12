import { expect, test } from "@playwright/test";

const email = `operator.${Date.now()}@apex.test`;
const password = "enclave-test-passphrase-2026";

test.describe.configure({ mode: "serial" });

test("owner can provision an enclave, register an agent and issue a signed mandate", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Kiran Patel");
  await page.getByLabel("Organization").fill("Apex Systems");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();

  await page.waitForURL("/", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();

  await page.goto("/agents");
  await page.getByRole("button", { name: /register agent/i }).first().click();
  await page.getByLabel("Agent name").fill("ProcureMaster-Root");
  await page.getByRole("button", { name: /issue identity/i }).click();
  await expect(page.getByText("ProcureMaster-Root").first()).toBeVisible({ timeout: 20_000 });

  await page.goto("/mandates/new");
  await page
    .getByLabel("Instruction")
    .fill("Find a laptop stand under $50. Only purchase from approved merchants. Allow one transaction within 24 hours.");
  await page.getByRole("button", { name: /extract permissions/i }).click();
  await expect(page.getByText(/review every extracted field/i)).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: /continue to security review/i }).click();
  await expect(page.getByText(/confirm the signed policy/i)).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /sign & issue mandate/i }).click();

  await expect(page.getByText(/mandate signed and armed/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/mnd_/)).toBeVisible();

  await page.goto("/mandates");
  await expect(page.getByRole("link", { name: /ProcureMaster-Root/ }).first()).toBeVisible();

  await page.getByRole("link", { name: /ProcureMaster-Root/ }).first().click();
  await expect(page.getByText("Ed25519 (RFC 8032)").first()).toBeVisible();
  await expect(page.getByText("Public key fingerprint")).toBeVisible();
  await expect(page.getByText("Not revoked")).toBeVisible();

  await page.goto("/agents/graph");
  await expect(page.getByRole("heading", { name: "Delegation Graph", exact: true })).toBeVisible();
  await expect(page.getByText("Delegation graph", { exact: true })).toBeVisible();

  await page.goto("/security/intelligence");
  await expect(page.getByRole("heading", { name: "Security Intelligence" })).toBeVisible();
  await expect(page.getByText("No suspicious attempts recorded")).toBeVisible();

  const exported = await page.request.get("/api/mandates/export");
  expect(exported.status()).toBe(200);
  const body = await exported.json();
  expect(body.format).toBe("pact.mandates.v1");
  expect(body.mandates[0].signature).toBeTruthy();
  expect(body.mandates[0].mandateId).toMatch(/^mnd_/);
  expect(body.mandates[0].payload).toBeTruthy();
  expect(body.mandates[0].canonicalHash).toMatch(/^[a-f0-9]{64}$/);
});

test("theme toggle switches to light, persists across reload and restores dark", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: /switch to light mode/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: /switch to dark mode/i }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("security lab executes a real attack scenario and holds the boundary", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /enter enclave/i }).click();
  await page.waitForURL("/", { timeout: 30_000 });

  await page.goto("/security");
  await page.getByRole("button", { name: /execute against live engine/i }).first().click();
  await expect(page.getByText(/BOUNDARY_HELD/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/0 boundary failures/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /open audit evidence/i })).toBeVisible();
});
