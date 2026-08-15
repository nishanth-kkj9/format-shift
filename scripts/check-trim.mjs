// Dev-only driver: opens the trim check page, reads the result JSON.
// Usage: node scripts/check-trim.mjs [audio] [start] [end]
// Example: node scripts/check-trim.mjs long30 0 30
import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [audio, startSec, endSec] = process.argv.slice(2);
const projectRoot = resolve(import.meta.dirname, '..');
const fixture = join(projectRoot, 'test-2s.wav');

if (!existsSync(fixture)) {
  const alt = 'C:/Users/Nishanth/AppData/Local/Temp/opencode/visprobe/test-2s.wav';
  if (existsSync(alt)) copyFileSync(alt, fixture);
  else {
    console.error('NO test-2s.wav');
    process.exit(1);
  }
}
copyFileSync(fixture, join(projectRoot, 'probe/audio/test-2s.wav'));

const vite = await createViteServer({
  root: projectRoot,
  server: { port: 5201, strictPort: false },
  logLevel: 'silent',
  appType: 'mpa',
});
await vite.listen();

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE_ERROR:', e.message));
const url = `http://localhost:${vite.config.server.port || 5201}/probe/check-trim.html?audio=${audio || 'test-2s'}&start=${startSec || 0}&end=${endSec || 2}`;
await page.goto(url);
await page.waitForFunction(() => !document.getElementById('out').textContent.startsWith('running'), null, { timeout: 120000 });
const text = await page.evaluate(() => document.getElementById('out').textContent);
console.log('RESULT:', text);
await browser.close();
await vite.close();


