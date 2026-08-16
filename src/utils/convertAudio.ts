import { TargetFormat, AudioConversionOptions } from "../types";
import { convertAudioToSpectrumVideo } from "./audioVisualizer";
import { planConversion } from "../core/conversionRegistry";

// Browser can only produce WAV (or spectrum visualizer video). Any other audio
// target (mp3, ogg, aac, m4a, flac) requires the FFmpeg server — throw instead
// of silently mislabeling a WAV blob as the requested format.
function assertBrowserSupported(targetFormat: TargetFormat): void {
  const plan = planConversion("audio", targetFormat);
  if (plan.supported === false || plan.target.engine !== "browser") {
    throw new Error(`Audio -> ${targetFormat} must run on the FFmpeg server`);
  }
}

// Helper: Convert AudioBuffer to WAV Blob
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  let result: Float32Array;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    result = new Float32Array(left.length + right.length);
    for (let i = 0; i < left.length; i++) {
      result[i * 2] = left[i];
      result[i * 2 + 1] = right[i];
    }
  } else {
    result = buffer.getChannelData(0);
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteLength = result.length * bytesPerSample;
  const headerByteLength = 44;
  const totalLength = headerByteLength + dataByteLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  /* RIFF identifier */
  writeString(view, 0, "RIFF");
  /* RIFF chunk length */
  view.setUint32(4, 36 + dataByteLength, true);
  /* RIFF type */
  writeString(view, 8, "WAVE");
  /* format chunk identifier */
  writeString(view, 12, "fmt ");
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, "data");
  /* data chunk length */
  view.setUint32(40, dataByteLength, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < result.length; i++) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Validate the requested trim range against the source duration. A provided
// trimStart must be strictly before trimEnd (and within the audio); rejecting
// invalid ranges beats silently ignoring the user's requested trim.
export function resolveTrimRange(
  durationSec: number,
  trimStart?: number,
  trimEnd?: number
): { start: number; end: number } {
  const start = trimStart ?? 0;
  const end = trimEnd !== undefined && trimEnd < durationSec ? trimEnd : durationSec;
  if (start < 0 || start >= end || start >= durationSec) {
    throw new Error(
      "Invalid trim range: trimStart must be earlier than trimEnd and within the audio duration"
    );
  }
  return { start, end };
}

// OfflineAudioContext length is expressed in frames at the TARGET sample rate;
// using the source rate here would stretch a resampled clip (e.g. a 1s clip at
// 44100 -> 22050 would render 2s).
export function renderFrameLength(durationSec: number, targetSampleRate: number): number {
  return Math.max(1, Math.round(durationSec * targetSampleRate));
}

/**
 * Returns an idempotent closer for an AudioContext that swallows close()
 * rejection (close can reject once the context is already unusable). Wrapping
 * the conversion body in try/finally guarantees the context is released on
 * every path — decode failure, invalid trim, render failure, abort, or success.
 */
export function trackAudioContextClose(ctx: { close(): Promise<void> }): () => void {
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    ctx.close().catch(() => {
      // already closed / already in an unusable state
    });
  };
}

// Convert Audio / Extract Audio from Video using AudioContext & Web Audio API
export async function convertAudio(
  file: File,
  targetFormat: TargetFormat,
  options: AudioConversionOptions,
  onProgress?: (pct: number) => void,
  abortSignal?: AbortSignal
): Promise<{ blob: Blob; duration: number }> {
  assertBrowserSupported(targetFormat);

  // If target format is a video format (MP4, WEBM) or user explicitly enabled spectrum visualizer
  if (targetFormat === "mp4" || targetFormat === "webm" || options.spectrumVisualizer) {
    const result = await convertAudioToSpectrumVideo(file, targetFormat, options, onProgress, abortSignal);
    return { blob: result.blob, duration: result.duration };
  }

  // Check for abort before starting
  if (abortSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  onProgress?.(15);
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(40);

  // Check for abort after reading file
  if (abortSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtxClass();
  const closeCtx = trackAudioContextClose(audioCtx);

  try {
    let decodedBuffer: AudioBuffer;
    try {
      decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch {
      throw new Error("Could not decode audio data from file");
    }

    // Check for abort after decoding
    if (abortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    onProgress?.(60);
    const duration = decodedBuffer.duration;

    // Handle trim start / trim end (validated, never silently ignored)
    const { start: startSec, end: endSec } = resolveTrimRange(duration, options.trimStart, options.trimEnd);

    const targetSampleRate = options.sampleRate || decodedBuffer.sampleRate;
    const numChannels = options.channels || Math.min(decodedBuffer.numberOfChannels, 2);

    const frameLength = renderFrameLength(endSec - startSec, targetSampleRate);

    // Render to OfflineAudioContext
    const offlineCtx = new OfflineAudioContext(numChannels, frameLength, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decodedBuffer;

    // Apply Gain / Volume
    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = (options.volume || 100) / 100;

    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    source.start(0, startSec, endSec - startSec);

    onProgress?.(80);
    const renderedBuffer = await offlineCtx.startRendering();

    // Check for abort after rendering
    if (abortSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // Export to WAV PCM
    const wavBlob = audioBufferToWavBlob(renderedBuffer);
    onProgress?.(100);

    return { blob: wavBlob, duration: endSec - startSec };
  } finally {
    closeCtx();
  }
}
