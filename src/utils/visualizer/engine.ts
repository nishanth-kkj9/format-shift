import { AudioConversionOptions, SpectrumStyle, TargetFormat } from '../../types';
import { AudioAnalyzer, DEFAULT_ANALYZER_CONFIG } from './audioAnalyzer';
import { getTheme } from './themes';
import { drawBackground, createHudGeometry, drawHud, RenderContext } from './renderers/shared';
import { createBarsGeometry, renderBars } from './renderers/bars';
import { renderWaveform } from './renderers/waveform';
import { createRadialGeometry, renderRadial } from './renderers/radial';
import { createParticlesGeometry, renderParticles } from './renderers/particles';

export const SPECTRUM_WIDTH = 1280;
export const SPECTRUM_HEIGHT = 720;
const FRAME_MS = 1000 / 30;
const MAX_FRAME_MS = FRAME_MS * 1.5; // clamp dt after stalls

export interface SpectrumVideoResult {
  blob: Blob;
  mimeType: string;
  dimensions: { width: number; height: number };
  duration: number;
}

export async function renderSpectrumVideo(
  file: File,
  targetFormat: TargetFormat,
  options: AudioConversionOptions,
  onProgress?: (pct: number) => void,
  abortSignal?: AbortSignal
): Promise<SpectrumVideoResult> {
  onProgress?.(10);

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(25);

  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtxClass();

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  if (abortSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  let decodedBuffer: AudioBuffer;
  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error('Failed to decode audio data for spectrum visualizer');
  }

  if (abortSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const duration = decodedBuffer.duration;
  onProgress?.(40);

  const canvas = document.createElement('canvas');
  canvas.width = SPECTRUM_WIDTH;
  canvas.height = SPECTRUM_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D canvas context');

  // Audio graph
  const source = audioCtx.createBufferSource();
  source.buffer = decodedBuffer;
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = DEFAULT_ANALYZER_CONFIG.fftSize;
  analyser.smoothingTimeConstant = 0;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = (options.volume || 100) / 100;
  const streamDest = audioCtx.createMediaStreamDestination();
  source.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(streamDest);

  // Recording
  const canvasStream = canvas.captureStream(30);
  const audioTrack = streamDest.stream.getAudioTracks()[0];
  if (audioTrack) canvasStream.addTrack(audioTrack);

  const isMp4Supported = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1');
  const mimeType = targetFormat === 'mp4' && isMp4Supported ? 'video/mp4' : 'video/webm';
  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 3000000 });
  } catch {
    mediaRecorder = new MediaRecorder(canvasStream);
  }
  const recordedChunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  // Analysis + render geometry (cached once per run)
  const analyzer = new AudioAnalyzer();
  const style: SpectrumStyle = options.spectrumStyle || 'bars';
  const theme = getTheme(options.spectrumTheme);
  const title = file.name.replace(/\.[^/.]+$/, '');
  const hud = createHudGeometry(SPECTRUM_WIDTH);
  const barsGeom = createBarsGeometry(SPECTRUM_WIDTH, SPECTRUM_HEIGHT, analyzer.bandCount);
  const radialGeom = createRadialGeometry(SPECTRUM_WIDTH, SPECTRUM_HEIGHT, analyzer.bandCount);
  const particlesGeom = createParticlesGeometry(SPECTRUM_WIDTH, SPECTRUM_HEIGHT);

  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    let renderTimer: ReturnType<typeof setInterval> | undefined;
    let safetyTimer: number | undefined;

    const cleanup = () => {
      if (renderTimer) clearInterval(renderTimer);
      clearTimeout(safetyTimer);
      audioCtx.close().catch(() => undefined);
    };

    mediaRecorder.onstop = () => {
      cleanup();
      const finalBlob = new Blob(recordedChunks, { type: mimeType });
      onProgress?.(100);
      resolve({
        blob: finalBlob,
        mimeType,
        dimensions: { width: SPECTRUM_WIDTH, height: SPECTRUM_HEIGHT },
        duration,
      });
    };

    mediaRecorder.onerror = (e) => {
      cleanup();
      reject(new Error(`Media recording failed: ${(e as ErrorEvent).message || 'Unknown error'}`));
    };

    let stopped = false;
    const stopRecording = () => {
      if (stopped) return;
      stopped = true;
      if (renderTimer) clearInterval(renderTimer);
      mediaRecorder.stop();
    };

    mediaRecorder.start();
    source.start(0);
    source.onended = stopRecording;

    // Safety net: force stop if onended never fires.
    safetyTimer = window.setTimeout(stopRecording, duration * 1000 + 2000);

    const startWall = performance.now();
    let lastFrame = startWall;

    const render = () => {
      if (abortSignal?.aborted) {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const now = performance.now();
      const elapsedSec = (now - startWall) / 1000;
      const deltaSec = Math.min(MAX_FRAME_MS, now - lastFrame) / 1000;
      lastFrame = now;

      onProgress?.(Math.max(45, Math.min(99, Math.round((elapsedSec / duration) * 100))));

      if (elapsedSec >= duration) {
        stopRecording();
        return;
      }

      const frame = analyzer.analyze(analyser, elapsedSec, deltaSec);

      const rc: RenderContext = {
        ctx,
        width: SPECTRUM_WIDTH,
        height: SPECTRUM_HEIGHT,
        frame,
        theme,
        time: elapsedSec,
        duration,
      };

      drawBackground(ctx, SPECTRUM_WIDTH, SPECTRUM_HEIGHT, rc);
      switch (style) {
        case 'bars':
          renderBars(ctx, barsGeom, rc);
          break;
        case 'wave':
          renderWaveform(ctx, rc);
          break;
        case 'radial':
          renderRadial(ctx, radialGeom, rc);
          break;
        case 'particles':
          renderParticles(ctx, particlesGeom, rc, deltaSec);
          break;
      }
      drawHud(ctx, hud, rc, title);
    };

    renderTimer = setInterval(render, FRAME_MS);
  });
}
