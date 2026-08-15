// Probe harness (dev-only, not shipped): drives the REAL visualizer modules
// (analyzer + renderers) with real decoded audio and exposes frame snapshots.
// Served over Vite so TS transforms natively. Query: ?style=&theme=&audio=
import { AudioAnalyzer, DEFAULT_ANALYZER_CONFIG } from '../src/utils/visualizer/audioAnalyzer';
import { getTheme } from '../src/utils/visualizer/themes';
import {
  drawBackground,
  createHudGeometry,
  drawHud,
  RenderContext,
} from '../src/utils/visualizer/renderers/shared';
import { createBarsGeometry, renderBars } from '../src/utils/visualizer/renderers/bars';
import { renderWaveform } from '../src/utils/visualizer/renderers/waveform';
import { createRadialGeometry, renderRadial } from '../src/utils/visualizer/renderers/radial';
import { createParticlesGeometry, renderParticles } from '../src/utils/visualizer/renderers/particles';

const log = (m: string) => {
  const el = document.getElementById('log');
  if (el) el.textContent += m + '\n';
};

const params = new URLSearchParams(location.search);
const style = params.get('style') || 'radial';
const themeName = params.get('theme') || 'neon-lime';
const audioName = params.get('audio') || 'mixed';

const W = 1280;
const H = 720;

const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
canvas.id = 'probe-canvas';
canvas.style.display = 'block';
canvas.style.width = '960px';
canvas.style.aspectRatio = '16/9';
canvas.style.border = '1px solid #444';
document.body.prepend(canvas);

const ctx = canvas.getContext('2d')!;

async function init(): Promise<void> {
  log(`style=${style} theme=${themeName} audio=${audioName}`);
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  await audioCtx.resume();

  const resp = await fetch(`/probe/audio/${audioName}.wav`);
  if (!resp.ok) throw new Error(`wav fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(buf);
  log(`decoded ${decoded.duration.toFixed(2)}s`);

  const source = audioCtx.createBufferSource();
  source.buffer = decoded;
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = DEFAULT_ANALYZER_CONFIG.fftSize;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  const analyzer = new AudioAnalyzer();
  const theme = getTheme(themeName as any);
  const hud = createHudGeometry(W);
  const barsGeom = createBarsGeometry(W, H, analyzer.bandCount);
  const radialGeom = createRadialGeometry(W, H, analyzer.bandCount);
  const particlesGeom = createParticlesGeometry(W, H);

  source.start(0);
  const startWall = performance.now();
  let lastFrame = startWall;

  const render = () => {
    const now = performance.now();
    const elapsedSec = (now - startWall) / 1000;
    const deltaSec = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (elapsedSec >= decoded.duration) {
      log(`DONE elapsed=${elapsedSec.toFixed(2)}`);
      return;
    }

    const frame = analyzer.analyze(analyser, elapsedSec, deltaSec);

    const rc: RenderContext = {
      ctx,
      width: W,
      height: H,
      frame,
      theme,
      time: elapsedSec,
      duration: decoded.duration,
    };

    drawBackground(ctx, W, H, rc);
    switch (style) {
      case 'bars':
        renderBars(ctx, barsGeom, rc);
        break;
      case 'wave':
        renderWaveform(ctx, rc);
        break;
      case 'particles':
        renderParticles(ctx, particlesGeom, rc, deltaSec);
        break;
      default:
        renderRadial(ctx, radialGeom, rc);
        break;
    }
    drawHud(ctx, hud, rc, `probe ${style} · ${themeName}`);

    requestAnimationFrame(render);
  };

  requestAnimationFrame(render);

  // Snapshot hook for the Playwright driver.
  (window as any).__snapshot = () => canvas.toDataURL('image/png');
  (window as any).__ready = true;
  log('READY');
}

init().catch((e) => log('ERROR ' + e.message));
