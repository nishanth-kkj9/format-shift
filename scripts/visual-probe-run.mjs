// Probe driver: runs the Vite dev server, opens the probe page per
// style/theme/audio combo, and saves PNG snapshots to out/ for visual review.
// Usage: node scripts/visual-probe-run.mjs [style] [theme] [audio] [outdir] [mode]
// Example: node scripts/visual-probe-run.mjs radial neon-lime mixed (recording mode)
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [style, theme, audio, outdir, mode] = process.argv.slice(2);
const projectRoot = resolve(import.meta.dirname, '..');
const outDir = resolve(outdir || join(projectRoot, 'probe/out'));

// hard cap so a hung run never blocks CI
const hardStop = setTimeout(() => {
  console.error('HARD TIMEOUT');
  process.exit(2);
}, 120000);

async function main() {
  mkdirSync(outDir, { recursive: true });
  const vite = await createViteServer({
    root: projectRoot,
    server: { port: 5199, strictPort: false },
    logLevel: 'silent',
    appType: 'mpa',
  });
  await vite.listen();

  const port = vite.config.server.port || 5199;
  const url = `http://localhost:${port}/probe/index.html?style=${style}&theme=${theme}&audio=${audio}${mode ? `&mode=${mode}` : ''}`;
  console.log(`OPEN ${url}`);

  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => console.log(`[browser] ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) console.log(`[http ${r.status()}] ${r.url()}`);
  });
  await page.goto(url, { timeout: 30000 });

  // wait for the probe to declare itself ready
  await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });
  console.log('READY, capturing frames...');

  // capture frames at ~0.4s intervals for the first ~5s of audio
  const captures = 8;
  const results = [];
  for (let i = 0; i < captures; i++) {
    await page.waitForTimeout(400);
    const dataUrl = await page.evaluate(() => window.__snapshot());
    if (!dataUrl) break;
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    const name = `${style}_${theme}_${audio}_${String(i).padStart(2, '0')}.png`;
    writeFileSync(join(outDir, name), png);
    results.push(name);
  }

  await browser.close();
  await vite.close();
  clearTimeout(hardStop);
  console.log('WROTE ' + results.join(', '));
  console.log('OUTDIR ' + outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
