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
export const SPECTRUM_FPS = 30;
export const FRAME_MS = 1000 / SPECTRUM_FPS;
export const MAX_FRAME_MS = FRAME_MS * 1.5; // clamp dt after stalls

export interface SpectrumVideoResult {
  blob: Blob;
  mimeType: string; // ACTUAL recorded mime (may differ from requested when falling back)
  dimensions: { width: number; height: number };
  duration: number; // trimmed duration (endSec - startSec)
}

// Safe trim range from user options. Clamps to valid duration and falls back to
// the full file when the range is empty/inverted (start >= end).
export function computeTrimRange(
  durationSec: number,
  trimStart?: number,
  trimEnd?: number
): { start: number; end: number } {
  const dur = Math.max(0, durationSec);
  let start = Math.max(0, Math.min(trimStart ?? 0, dur));
  let end = trimEnd === undefined || trimEnd > dur ? dur : Math.max(0, trimEnd);
  if (end <= start) {
    start = 0;
    end = dur; // invalid/empty range → whole file
  }
  return { start, end };
}

// Pick the recorder container MIME: prefer MP4 when the browser supports it and
// the user asked for it, otherwise fall back to WebM. The recorder's ACTUAL
// mime is reported back (Phase: truthful output MIME).
export function pickRecorderMime(targetFormat: TargetFormat): string {
  const mp4Ok =
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1');
  return targetFormat === 'mp4' && mp4Ok ? 'video/mp4' : 'video/webm';
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
    await audioCtx.close().catch(() => undefined);
    throw new DOMException('Aborted', 'AbortError');
  }

  let decodedBuffer: AudioBuffer;
  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    await audioCtx.close().catch(() => undefined);
    throw new Error('Failed to decode audio data for spectrum visualizer');
  }

  if (abortSignal?.aborted) {
    await audioCtx.close().catch(() => undefined);
    throw new DOMException('Aborted', 'AbortError');
  }

  // Trim range: the visualizer plays only the selected section.
  const { start: startSec, end: endSec } = computeTrimRange(
    decodedBuffer.duration,
    options.trimStart,
    options.trimEnd
  );
  const duration = endSec - startSec; // trimmed duration for progress/HUD/safety/result
  onProgress?.(40);

  const canvas = document.createElement('canvas');
  canvas.width = SPECTRUM_WIDTH;
  canvas.height = SPECTRUM_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D canvas context');

  // Audio graph — one signal path:
  //   source --gain--> analyser --streamDest--> recorded audio track
  // `gain` applies options.volume; the analyser taps the SAME post-gain signal
  // that is recorded, so the visuals and the embedded audio stay coherent
  // (volume is applied exactly once, never double).
  const source = audioCtx.createBufferSource();
  source.buffer = decodedBuffer;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = (options.volume ?? 100) / 100;
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = DEFAULT_ANALYZER_CONFIG.fftSize;
  analyser.smoothingTimeConstant = 0;
  const streamDest = audioCtx.createMediaStreamDestination();
  source.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(streamDest);

  // Recording. Note: MediaRecorder encodes the embedded audio at the browser's
  // native context rate/channels — sampleRate/channels options are NOT
  // resampled here and are not claimed to be applied.
  const canvasStream = canvas.captureStream(SPECTRUM_FPS);
  const audioTrack = streamDest.stream.getAudioTracks()[0];
  if (!audioTrack) {
    await audioCtx.close().catch(() => undefined);
    throw new Error('Could not create an audio track for the visualizer recording');
  }
  canvasStream.addTrack(audioTrack);

  const requestedMime = pickRecorderMime(targetFormat);
  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(canvasStream, {
      mimeType: requestedMime,
      videoBitsPerSecond: 3000000,
    });
  } catch {
    mediaRecorder = new MediaRecorder(canvasStream); // fallback: browser default
  }
  // Truthful output type: base mime from the recorder (no codec params).
  const actualMime = (mediaRecorder.mimeType || requestedMime).split(';')[0].trim();
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
    let settled = false;
    let renderTimer: ReturnType<typeof setInterval> | undefined;
    let safetyTimer: number | undefined;

    // Idempotent: safe to call multiple times; first caller wins.
    const cleanup = () => {
      if (renderTimer) clearInterval(renderTimer);
      clearTimeout(safetyTimer);
      try {
        source.stop();
      } catch {
        /* already stopped / never started */
      }
      if (mediaRecorder.state === 'recording') {
        try {
          mediaRecorder.stop();
        } catch {
          /* ignore */
        }
      }
      audioCtx.close().catch(() => undefined);
      abortSignal?.removeEventListener('abort', onAbort);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const blob = new Blob(recordedChunks, { type: actualMime });
      if (recordedChunks.length === 0 || blob.size === 0) {
        reject(new Error('No media data was recorded'));
        return;
      }
      onProgress?.(100);
      resolve({
        blob,
        mimeType: actualMime,
        dimensions: { width: SPECTRUM_WIDTH, height: SPECTRUM_HEIGHT },
        duration,
      });
    };

    const onAbort = () => fail(new DOMException('Aborted', 'AbortError'));
    if (abortSignal?.aborted) {
      fail(new DOMException('Aborted', 'AbortError'));
      return;
    }
    abortSignal?.addEventListener('abort', onAbort);

    mediaRecorder.onstop = () => {
      if (settled) return; // abort/error already settled — never resolve late
      finish();
    };
    mediaRecorder.onerror = (e) => {
      fail(new Error(`Media recording failed: ${(e as ErrorEvent).message || 'Unknown error'}`));
    };

    try {
      mediaRecorder.start(1000); // timeslice keeps data flowing for long audio
    } catch (e) {
      fail(new Error(`MediaRecorder failed to start: ${(e as Error)?.message || 'unknown'}`));
      return;
    }

    source.onended = () => {
      if (settled) return;
      if (renderTimer) clearInterval(renderTimer);
      if (mediaRecorder.state === 'recording') mediaRecorder.stop();
    };
    source.start(0, startSec, duration);

    // Safety net: force stop if onended never fires (trimmed duration).
    safetyTimer = window.setTimeout(() => {
      if (settled) return;
      if (renderTimer) clearInterval(renderTimer);
      if (mediaRecorder.state === 'recording') mediaRecorder.stop();
    }, duration * 1000 + 2000);

    const startWall = performance.now();
    let lastFrame = startWall;

    const render = () => {
      if (settled) return; // finished / aborted / errored

      const now = performance.now();
      const elapsedSec = (now - startWall) / 1000;
      const deltaSec = Math.min(MAX_FRAME_MS, now - lastFrame) / 1000;
      lastFrame = now;

      onProgress?.(
        Math.max(45, Math.min(99, Math.round((elapsedSec / Math.max(0.001, duration)) * 100)))
      );

      if (elapsedSec >= duration) {
        if (renderTimer) clearInterval(renderTimer);
        if (mediaRecorder.state === 'recording') mediaRecorder.stop();
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
