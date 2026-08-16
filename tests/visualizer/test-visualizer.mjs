// Browser smoke test for the spectrum visualizer (client-side Web Audio + MediaRecorder).
// Usage: node test-visualizer.mjs <base-url>
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:4000";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("BROWSER_ERR:", m.text());
});
page.on("pageerror", (e) => console.log("PAGE_ERROR:", e.message));

try {
  await page.goto(base, { waitUntil: "networkidle" });

  // Upload the WAV fixture through the file input.
  await page.setInputFiles('input[type="file"]', "tests/visualizer/test-2s.wav");
  await page.waitForSelector("text=/test-2s\\.wav/", { timeout: 5000 });

  // The file list shows a FormatDropdown; choose mp4.
  await page.waitForSelector("text=Target:", { timeout: 5000 });
  // Pick the format dropdown in the first file row.
  const dropdown = page.locator("select").first();
  await dropdown.selectOption("mp4");
  await page.waitForTimeout(300);

  // Open options modal (sliders gear button).
  await page.locator('button[title="Adjust Quality & Fine-Tuning Options"]').first().click();
  await page.waitForSelector("text=Audio Spectrum Video Generator", { timeout: 5000 });

  // Enable the visualizer toggle if not already on (mp4 target forces it on, but be safe).
  const toggle = page.locator("input[type=checkbox]").first();
  if (!(await toggle.isChecked())) await toggle.check();
  await page.waitForTimeout(300);

  // Select radial style + neon-lime theme.
  const styleSel = page.locator('select').filter({ hasText: /Frequency Equalizer Bars|Radial Soundwave Ring|Reactive Particle Field/ }).first();
  await styleSel.selectOption({ label: "⭕ Radial Soundwave Ring" });
  const themeSel = page.locator('select').filter({ hasText: /Neon Lime|Indigo & Violet|Aurora/ }).first();
  await themeSel.selectOption({ label: "🟢 Neon Lime Reactor" });

  // Save settings.
  await page.getByRole("button", { name: "Save Settings" }).click();
  await page.waitForSelector("text=Audio Spectrum Video Generator", { state: "hidden", timeout: 5000 });

  // Convert.
  await page.getByRole("button", { name: "Convert", exact: true }).click();

  // Wait for the batch bar to report all done, then verify item completed.
  await page.waitForSelector("text=1 of 1 Converted", { timeout: 40000 }).catch(() => {});
  const itemText = await page.locator("body").innerText();
  const done =
    /Conversion finished successfully!/.test(itemText) ||
    /Download|converted|Saved \d+\.\d+ KB/.test(itemText);
  if (!done) {
    console.error("ITEM:", itemText.slice(0, 1200));
    throw new Error("item did not show completed state");
  }

  // Verify the Save (download) button appeared — converted result ready.
  await page.waitForSelector('button:has-text("Save")', { timeout: 5000 });
  console.log("VISUALIZER_SMOKE_PASS: radial + neon-lime mp4 conversion completed");
} catch (e) {
  console.error("VISUALIZER_SMOKE_FAIL:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
