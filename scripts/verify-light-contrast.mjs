// Logs in to a scenario account, measures status-badge contrast in light mode,
// and captures the settled dashboard after chart animation completes.
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

await page.goto(`${BASE}/security`);
await page.getByRole("button", { name: /switch to light mode/i }).click();
await page.waitForTimeout(500);

const measurement = await page
  .getByText("HELD", { exact: true })
  .first()
  .evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    function raster(color) {
      context.globalCompositeOperation = "source-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
    }
    function luminance([r, g, b]) {
      const channel = (value) => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }

    const text = raster(style.color);
    const background = raster(style.backgroundColor);
    const l1 = luminance(text);
    const l2 = luminance(background);
    return {
      color: style.color,
      background: style.backgroundColor,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      textRgb: text,
      backgroundRgb: background,
      contrastRatio: Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)),
    };
  });

console.log(JSON.stringify(measurement, null, 2));
if (measurement.contrastRatio < 4.5) process.exitCode = 1;

await page.goto(`${BASE}/`);
await page.waitForTimeout(2600);
await page.screenshot({ path: "screenshots/light-dashboard-final.png" });
await browser.close();
