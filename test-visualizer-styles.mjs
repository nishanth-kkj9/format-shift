// Browser smoke test: all 4 visualizer styles across 2 themes.
// Usage: node test-visualizer-styles.mjs <base-url>
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:4000";
const STYLES = [
  { label: "📊 Frequency Equalizer Bars", theme: "🟢 Neon Lime Reactor" },
  { label: "〰️ Oscilloscope Waveform", theme: "🔮 Indigo & Violet" },
  { label: "⭕ Radial Soundwave Ring", theme: "🌌 Aurora Borealis" },
  { label: "✨ Reactive Particle Field", theme: "💎 Cyan & Emerald" },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE_ERROR:", e.message));

let failures = 0;
try {
  for (const s of STYLES) {
    await page.goto(base, { waitUntil: "networkidle" });

    await page.setInputFiles('input[type="file"]', "test-2s.wav");
    await page.waitForSelector("text=/test-2s\\.wav/", { timeout: 5000 });

    const dropdown = page.locator("select").first();
    await dropdown.selectOption("mp4");
    await page.waitForTimeout(300);

    await page.locator('button[title="Adjust Quality & Fine-Tuning Options"]').first().click();
    await page.waitForSelector("text=Audio Spectrum Video Generator", { timeout: 5000 });

    const styleSel = page.locator("select").filter({ hasText: /Frequency Equalizer Bars|Oscilloscope Waveform|Radial Soundwave Ring|Reactive Particle Field/ }).first();
    await styleSel.selectOption({ label: s.label });
    const themeSel = page.locator("select").filter({ hasText: /Neon Lime|Indigo & Violet|Aurora|Cyan & Emerald/ }).first();
    await themeSel.selectOption({ label: s.theme });

    await page.getByRole("button", { name: "Save Settings" }).click();
    await page.getByRole("button", { name: "Convert", exact: true }).click();

    await page.waitForSelector("text=1 of 1 Converted", { timeout: 40000 }).catch(() => {});
    const body = await page.locator("body").innerText();
    const ok = /Conversion finished successfully!/.test(body) || /Saved \d+\.\d+ KB/.test(body);
    if (!ok) {
      failures++;
      console.log(`FAIL: style="${s.label}" theme="${s.theme}"`);
    } else {
      console.log(`PASS: style="${s.label}" theme="${s.theme}"`);
    }
  }
} catch (e) {
  failures++;
  console.error("FATAL:", e.message);
} finally {
  await browser.close();
}

if (failures) {
  console.error(`${failures} style/theme combination(s) failed`);
  process.exit(1);
}
console.log("ALL STYLE SMOKE TESTS PASSED");
