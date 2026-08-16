// Browser regression: plain audio path (wav->wav, no visualizer) + cancel visualizer conversion.
// Usage: node test-visualizer-regress.mjs <base-url>
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:4000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE_ERROR:", e.message));

let failures = 0;
try {
  // --- 1. wav -> wav (browser engine, NO spectrum visualizer) ---
  await page.goto(base, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', "tests/visualizer/test-2s.wav");
  await page.waitForSelector("text=/test-2s\\.wav/", { timeout: 5000 });

  // Open options modal and explicitly keep spectrum visualizer OFF (default is off).
  await page.locator('button[title="Adjust Quality & Fine-Tuning Options"]').first().click();
  await page.waitForSelector("text=Audio Spectrum Video Generator", { timeout: 5000 });
  const toggle = page.locator("input[type=checkbox]").first();
  if (await toggle.isChecked()) await toggle.uncheck();
  await page.getByRole("button", { name: "Save Settings" }).click();

  // Set target wav (default for audio may already be wav, but be explicit).
  const dropdown = page.locator("select").first();
  await dropdown.selectOption("wav");
  await page.waitForTimeout(200);

  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await page.waitForTimeout(3000);
  const body1 = await page.locator("body").innerText();
  // Completed item shows "1 of 1 Converted" in the batch bar plus a converted size on the card.
  const ok1 = /1 of 1 Converted/.test(body1) && /\d+\.\d+ KB/.test(body1);
  if (ok1) console.log("PASS: wav->wav plain audio (no visualizer)");
  else {
    failures++;
    console.log("FAIL: wav->wav plain audio");
    const card = await page.locator("body").innerText();
    const idx = card.indexOf("Conversion Queue");
    console.log("ITEM_CONTEXT:", card.slice(idx, idx + 400));
  }

  // --- 2. cancel a visualizer conversion ---
  await page.goto(base, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', "tests/visualizer/test-2s.wav");
  await page.waitForSelector("text=/test-2s\\.wav/", { timeout: 5000 });
  await page.locator("select").first().selectOption("mp4");
  await page.waitForTimeout(200);

  // Cancel quickly after clicking Convert.
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  const cancelBtn = page.locator('button[title="Cancel Conversion"]');
  await cancelBtn.waitFor({ state: "visible", timeout: 8000 });
  await cancelBtn.click();
  await page.waitForTimeout(1000);

  const body2 = await page.locator("body").innerText();
  const notConverting = !/converting/i.test(body2);
  if (notConverting) console.log("PASS: visualizer conversion canceled cleanly");
  else { failures++; console.log("FAIL: cancel did not stop conversion"); console.log(body2.slice(0, 800)); }
} catch (e) {
  failures++;
  console.error("FATAL:", e.message);
} finally {
  await browser.close();
}

if (failures) {
  console.error(`${failures} regression check(s) failed`);
  process.exit(1);
}
console.log("ALL REGRESSION CHECKS PASSED");
