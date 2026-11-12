// Captures both themes for visual review. Requires a running app.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3101";
const browser = await chromium.launch();
const results = [];

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

await page.goto(`${BASE}/register`);
const email = `theme.${Date.now()}@apex.test`;
await page.getByLabel("Full name").fill("Theme Review");
await page.getByLabel("Organization").fill("Apex Systems");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill("theme-review-passphrase-2026");
await page.getByRole("button", { name: /create account/i }).click();
await page.waitForURL(`${BASE}/`, { timeout: 30_000 });
await page.getByRole("heading", { name: /welcome back/i }).waitFor({ timeout: 20_000 });

const shot = async (name) => {
  await page.waitForTimeout(600);
  const path = `screenshots/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  results.push(path);
};

await shot("dark-dashboard");

await page.getByRole("button", { name: /switch to light mode/i }).click();
await page.waitForTimeout(400);
await shot("light-dashboard");

for (const [path, name] of [
  ["/mandates", "light-mandates"],
  ["/payments", "light-payments"],
  ["/transactions", "light-transactions"],
  ["/security", "light-security"],
  ["/settings", "light-settings"],
  ["/mandates/new", "light-wizard"],
]) {
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: false });
  results.push(`screenshots/${name}.png`);
}

await page.goto(`${BASE}/`);
await page.waitForTimeout(500);
await page.screenshot({ path: "screenshots/light-dashboard-top.png", fullPage: false });
results.push("screenshots/light-dashboard-top.png");

const loginContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await loginContext.addInitScript(() => {
  try {
    localStorage.setItem("pact-theme", "light");
  } catch {
    // Ignore: runs on about:blank before an origin exists.
  }
});
const loginPage = await loginContext.newPage();
await loginPage.goto(`${BASE}/login`);
await loginPage.waitForTimeout(700);
await loginPage.screenshot({ path: "screenshots/light-login.png" });
results.push("screenshots/light-login.png");

await browser.close();
console.log(results.join("\n"));
