// Probe harness (dev-only, not shipped): drives the REAL visualizer modules
// (analyzer + renderers) with real decoded audio and exposes frame snapshots.
// Served over Vite so TS transforms natively. Query:
//   ?style=&theme=&audio=&mode=recording|preview&volume=100
// mode=recording (default) uses the exact fixed FRAME_MS tick of production;
// mode=preview uses requestAnimationFrame for smooth live preview.
import { AudioAnalyzer, DEFAULT_ANALYZER_CONFIG } from '../src/utils/visualizer/audioAnalyzer';
import { getTheme } from '../src/utils/visualizer/themes';
import {
  SPECTRUM_WIDTH,
  SPECTRUM_HEIGHT,
  SPECTRUM_FPS,
  FRAME_MS,
  MAX_FRAME_MS,
} from '../src/utils/visualizer/engine';
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
const mode = params.get('mode') || 'recording';
const volume = Number(params.get('volume') || '100');
const showHud = params.get('hud') === '1';

const W = SPECTRUM_WIDTH;
const H = SPECTRUM_HEIGHT;

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
  log(`style=${style} theme=${themeName} audio=${audioName} mode=${mode} volume=${volume}`);
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtx();
  await audioCtx.resume();

  const resp = await fetch(`/probe/audio/${audioName}.wav`);
  if (!resp.ok) throw new Error(`wav fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const decoded = await audioCtx.decodeAudioData(buf);
  log(`decoded ${decoded.duration.toFixed(2)}s`);

  // Mirrors production signal path: source --gain--> analyser.
  // (probe taps the analyser instead of a MediaStreamDestination.)
  const source = audioCtx.createBufferSource();
  source.buffer = decoded;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume / 100;
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = DEFAULT_ANALYZER_CONFIG.fftSize;
  analyser.smoothingTimeConstant = 0;
  source.connect(gainNode);
  gainNode.connect(analyser);
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

  const finish = () => {
    log(`DONE elapsed=${((performance.now() - startWall) / 1000).toFixed(2)}`);
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    audioCtx.close().catch(() => undefined);
    (window as any).__done = true;
  };

  const renderFrame = (now: number) => {
    const elapsedSec = (now - startWall) / 1000;
    const deltaSec = Math.min(MAX_FRAME_MS, now - lastFrame) / 1000;
    lastFrame = now;

    if (elapsedSec >= decoded.duration) {
      finish();
      return false;
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
    if (showHud) drawHud(ctx, hud, rc, `probe ${style} · ${themeName}`);
    return true;
  };

  if (mode === 'recording') {
    // Production-equivalent fixed tick (setInterval like engine.render loop).
    log(`recording mode: ${SPECTRUM_FPS}fps (FRAME_MS=${FRAME_MS})`);
    const timer = window.setInterval(() => {
      const cont = renderFrame(performance.now());
      if (!cont) window.clearInterval(timer);
    }, FRAME_MS);
  } else {
    const loop = (now: number) => {
      if (renderFrame(now)) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // Snapshot hook for the Playwright driver.
  (window as any).__snapshot = () => canvas.toDataURL('image/png');
  (window as any).__ready = true;
  log('READY');
}

init().catch((e) => log('ERROR ' + e.message));
