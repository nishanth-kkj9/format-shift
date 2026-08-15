// Numeric pixel analysis of captured probe frames (this model can't view
// images, so verify composition statistically). Loads PNGs into the browser,
// samples pixels, and reports metrics that map to the acceptance checklist:
//  - background darkness (should stay near-black)
//  - center glow extent (controlled, not full-canvas bloom)
//  - dotted ring presence + radius stability across frames
//  - bar arc placement (asymmetric, one side) + outward extent
//  - gradient color spread around the ring (all hues present)
//  - beat pulse magnitude on ring radius (subtle, 2-5%)
// Usage: node scripts/visual-probe-analyze.mjs <png...>
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/visual-probe-analyze.mjs <png1> <png2> ...');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');
await page.waitForFunction(() => {
  // ensure fonts not needed; just canvas ready
  return true;
});

const results = [];
for (const file of files) {
  const b64 = readFileSync(file).toString('base64');
  const m = await page.evaluate(async (dataUrl) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.getElementById('c');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;

    const px = (x, y) => {
      const i = (Math.round(y) * width + Math.round(x)) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = (r, g, b) => {
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      return mx === 0 ? 0 : (mx - mn) / mx;
    };

    // corners average (background)
    const corners = [px(10, 10), px(width - 10, 10), px(10, height - 10), px(width - 10, height - 10)];
    const bgLum = corners.reduce((s, [r, g, b]) => s + lum(r, g, b), 0) / 4;

    // scan whole frame: max luminance (bloom check), fraction of bright pixels
    let maxLum = 0;
    let brightCount = 0;
    let brightCenterCount = 0; // bright far from center
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const l = lum(...px(x, y));
        if (l > maxLum) maxLum = l;
        if (l > 60) {
          brightCount++;
          const dx = x - width / 2;
          const dy = y - height / 2;
          if (Math.hypot(dx, dy) > height * 0.42) brightCenterCount++;
        }
      }
    }
    const brightFrac = brightCount / ((width / 4) * (height / 4));
    const farBrightFrac = brightCenterCount / ((width / 4) * (height / 4));

    // ring detection: sample at radius r from center, find band with max
    // saturated pixel density (dots). cx,cy ~ center.
    const cx = width / 2;
    const cy = height / 2;
    let bestR = 0;
    let bestDensity = 0;
    const densities = [];
    for (let r = 60; r < Math.min(width, height) / 2; r += 6) {
      let satCount = 0;
      let samples = 0;
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const [pr, pg, pb] = px(x, y);
        samples++;
        if (lum(pr, pg, pb) > 40 && sat(pr, pg, pb) > 0.4) satCount++;
      }
      const density = samples === 0 ? 0 : satCount / samples;
      densities.push({ r, density });
      if (density > bestDensity) {
        bestDensity = density;
        bestR = r;
      }
    }

    // arc asymmetry: sample ring band; measure average luminance in 8 sectors
    const sectorLum = [];
    for (let s = 0; s < 8; s++) {
      let sum = 0;
      let n = 0;
      for (let r = bestR; r < bestR + 120; r += 4) {
        for (let a = s * (Math.PI / 4); a < (s + 1) * (Math.PI / 4); a += 0.03) {
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          sum += lum(...px(x, y));
          n++;
        }
      }
      sectorLum.push(n === 0 ? 0 : sum / n);
    }

    // gradient hue spread on the ring (sample dot angles)
    const hueCounts = { yellow: 0, lime: 0, green: 0, cyan: 0, blue: 0, total: 0 };
    for (let a = 0; a < Math.PI * 2; a += 0.08) {
      const x = cx + Math.cos(a) * bestR;
      const y = cy + Math.sin(a) * bestR;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const [r, g, b] = px(x, y);
      if (lum(r, g, b) < 40 || sat(r, g, b) < 0.3) continue;
      hueCounts.total++;
      if (r > 180 && g > 180 && b < 120) hueCounts.yellow++;
      else if (r > 150 && g > 200 && b < 140) hueCounts.lime++;
      else if (r < 140 && g > 160 && b < 150) hueCounts.green++;
      else if (r < 120 && g > 140 && b > 140) hueCounts.cyan++;
      else if (r < 120 && b > 160) hueCounts.blue++;
    }

    return {
      width,
      height,
      bgLum,
      maxLum,
      brightFrac,
      farBrightFrac,
      bestR,
      bestDensity,
      sectorLum,
      hueCounts,
    };
  }, 'data:image/png;base64,' + b64);
  results.push({ file, ...m });
}

for (const r of results) {
  const sector = r.sectorLum.map((v, i) => `${(i * 45).toString().padStart(3)}°:${v.toFixed(1)}`).join(' ');
  const hue = Object.entries(r.hueCounts)
    .filter(([k]) => k !== 'total')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  console.log(`\n== ${r.file}`);
  console.log(`  bgLum=${r.bgLum.toFixed(1)} maxLum=${r.maxLum.toFixed(0)} brightFrac=${(r.brightFrac * 100).toFixed(1)}% farBright=${(r.farBrightFrac * 100).toFixed(2)}%`);
  console.log(`  ring r=${r.bestR} density=${(r.bestDensity * 100).toFixed(0)}%`);
  console.log(`  sectors: ${sector}`);
  console.log(`  hues: ${hue}`);
}

// Aggregate: ring radius stability + frame-to-frame change (same combo batch).
// Ring radius variance is the key visualizer-regression signal — per-dot FFT
// jumps show up as high variance; a stable circle stays within a few px.
if (results.length > 1) {
  const radii = results.map((r) => r.bestR);
  const mean = radii.reduce((s, v) => s + v, 0) / radii.length;
  const variance = radii.reduce((s, v) => s + (v - mean) ** 2, 0) / radii.length;
  const drift = Math.max(...radii) - Math.min(...radii);
  console.log(`\n== BATCH AGGREGATE (${results.length} frames)`);
  console.log(`  ring r: mean=${mean.toFixed(1)} min=${Math.min(...radii)} max=${Math.max(...radii)} drift=${drift} var=${variance.toFixed(2)}`);
  const peaks = results.map((r) => r.maxLum);
  console.log(`  maxLum: min=${Math.min(...peaks)} max=${Math.max(...peaks)}`);
  const sectors = results.map((r) => r.sectorLum);
  const dominant = sectors.map((s) => {
    const mx = Math.max(...s);
    return s.indexOf(mx);
  });
  console.log(`  dominant arc sector per frame: ${dominant.map((d) => d * 45).join(', ')}°`);
}

await browser.close();
