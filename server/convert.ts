import { runFFmpeg, FFmpegResult, FFmpegRunOptions } from "./ffmpeg/runner";
import { imageArgs } from "./ffmpeg/filters";
import { audioArgs, AUDIO_CODECS } from "./ffmpeg/audio";
import { videoArgs, VIDEO_CODECS } from "./ffmpeg/video";
import { getMimeForTarget, planConversion, CONVERSION_REGISTRY } from "../src/core/conversionRegistry";
import type { FileCategory } from "../src/core/conversionRegistry";

export class NoAudioStreamError extends Error {
  constructor() {
    super("Source has no audio stream to extract");
    this.name = "NoAudioStreamError";
  }
}

export class UnsupportedFormatError extends Error {
  constructor(format: string) {
    super(`Unsupported target format: ${format}`);
    this.name = "UnsupportedFormatError";
  }
}

export class UnsupportedConversionError extends Error {
  constructor(category: string, target: string) {
    super(`Conversion not supported for ${category} -> ${target}`);
    this.name = "UnsupportedConversionError";
  }
}

export class InvalidOptionError extends Error {
  constructor(option: string, reason: string) {
    super(`Invalid option ${option}: ${reason}`);
    this.name = "InvalidOptionError";
  }
}

/** Validated, normalized conversion options passed to FFmpeg. */
export interface ValidatedOptions {
  targetFormat: string;
  category: string;
  quality?: number;
  grayscale?: boolean;
  rotation?: number;
  maxWidth?: number;
  maxHeight?: number;
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
  volume?: number;
  trimStart?: number;
  trimEnd?: number;
  resolution?: string;
  fps?: number;
  muteAudio?: boolean;
}

const VALID_RESOLUTIONS = new Set(['original', '1080p', '720p', '480p', '360p']);
const VALID_ROTATIONS = new Set([0, 90, 180, 270]);
const VALID_BITRATES = new Set(['128k', '192k', '256k', '320k']);
const VALID_SAMPLE_RATES = new Set([8000, 11025, 22050, 44100, 48000, 96000]);
const VALID_CHANNELS = new Set([1, 2]);

/** Validate and normalize conversion options before passing to FFmpeg. */
export function validateOptions(opts: ConvertOptions): ValidatedOptions {
  const validated: ValidatedOptions = {
    targetFormat: opts.targetFormat,
    category: opts.category,
  };

  if (opts.quality !== undefined) {
    const q = Number(opts.quality);
    if (!Number.isFinite(q) || q < 1 || q > 100) throw new InvalidOptionError('quality', 'must be 1-100');
    validated.quality = q;
  }
  if (opts.grayscale !== undefined) validated.grayscale = Boolean(opts.grayscale);
  if (opts.rotation !== undefined) {
    const r = Number(opts.rotation);
    if (!VALID_ROTATIONS.has(r)) throw new InvalidOptionError('rotation', 'must be 0, 90, 180, or 270');
    validated.rotation = r;
  }
  if (opts.maxWidth !== undefined) {
    const w = Number(opts.maxWidth);
    if (!Number.isFinite(w) || w < 1 || w > 10000) throw new InvalidOptionError('maxWidth', 'must be 1-10000');
    validated.maxWidth = w;
  }
  if (opts.maxHeight !== undefined) {
    const h = Number(opts.maxHeight);
    if (!Number.isFinite(h) || h < 1 || h > 10000) throw new InvalidOptionError('maxHeight', 'must be 1-10000');
    validated.maxHeight = h;
  }
  if (opts.bitrate !== undefined) {
    const b = String(opts.bitrate);
    if (!VALID_BITRATES.has(b)) throw new InvalidOptionError('bitrate', 'must be one of: 128k, 192k, 256k, 320k');
    validated.bitrate = b;
  }
  if (opts.sampleRate !== undefined) {
    const sr = Number(opts.sampleRate);
    if (!VALID_SAMPLE_RATES.has(sr)) throw new InvalidOptionError('sampleRate', 'must be one of: 8000, 11025, 22050, 44100, 48000, 96000');
    validated.sampleRate = sr;
  }
  if (opts.channels !== undefined) {
    const c = Number(opts.channels);
    if (!VALID_CHANNELS.has(c)) throw new InvalidOptionError('channels', 'must be 1 or 2');
    validated.channels = c;
  }
  if (opts.volume !== undefined) {
    const v = Number(opts.volume);
    if (!Number.isFinite(v) || v < 0 || v > 200) throw new InvalidOptionError('volume', 'must be 0-200');
    validated.volume = v;
  }
  if (opts.trimStart !== undefined) {
    const ts = Number(opts.trimStart);
    if (!Number.isFinite(ts) || ts < 0) throw new InvalidOptionError('trimStart', 'must be non-negative');
    validated.trimStart = ts;
  }
  if (opts.trimEnd !== undefined) {
    const te = Number(opts.trimEnd);
    if (!Number.isFinite(te) || te < 0) throw new InvalidOptionError('trimEnd', 'must be non-negative');
    validated.trimEnd = te;
  }
  if (opts.resolution !== undefined) {
    const r = String(opts.resolution);
    if (!VALID_RESOLUTIONS.has(r)) throw new InvalidOptionError('resolution', 'must be one of: original, 1080p, 720p, 480p, 360p');
    validated.resolution = r;
  }
  if (opts.fps !== undefined) {
    const f = Number(opts.fps);
    if (!Number.isFinite(f) || f < 1 || f > 120) throw new InvalidOptionError('fps', 'must be 1-120');
    validated.fps = f;
  }
  if (opts.muteAudio !== undefined) validated.muteAudio = Boolean(opts.muteAudio);

  return validated;
}

export interface ConvertOptions {
  targetFormat: string;
  category: string;
  quality?: number;
  grayscale?: boolean;
  rotation?: number;
  maxWidth?: number;
  maxHeight?: number;
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
  volume?: number;
  trimStart?: number;
  trimEnd?: number;
  resolution?: string;
  fps?: number;
  muteAudio?: boolean;
}

/** All target extensions the server can produce, derived from the shared registry. */
export const ACCEPTED_EXTENSIONS = Object.values(CONVERSION_REGISTRY)
  .flatMap((spec) => Object.keys(spec.targets))
  .filter((ext) => ["svg"].includes(ext) === false);

const AUDIO_TARGETS = new Set(Object.keys(AUDIO_CODECS));
const VIDEO_TARGETS = new Set(Object.keys(VIDEO_CODECS));

/**
 * Convert a file already on disk. Always writes ffmpeg output to a temp file
 * (never buffers the whole result in RAM) and supports cancellation via signal.
 */
export async function convertFile(
  _input: Buffer,
  opts: ConvertOptions,
  inputPath?: string,
  runOptions: FFmpegRunOptions = {}
): Promise<{ data: Buffer; mime: string; result?: FFmpegResult }> {
  const validated = validateOptions(opts);
  const tgt = validated.targetFormat.toLowerCase();
  const cat = (validated.category || "").toLowerCase();

  // Any registered target is a legitimate server conversion (the registry's
  // engine flag only steers client-side routing). The one exception is SVG,
  // which ffmpeg cannot write — it is genuinely browser-only.
  const plan = planConversion(cat as FileCategory, tgt);
  if (plan.supported === false) throw new UnsupportedConversionError(cat, tgt);
  if (tgt === 'svg') throw new UnsupportedConversionError(cat, tgt);

  const mime = plan.target.mime;

  if (cat === "image") {
    const result = await runFFmpeg(imageArgs(validated), { inputPath, signal: runOptions.signal });
    return { data: Buffer.alloc(0), mime, result };
  }

  if (AUDIO_TARGETS.has(tgt)) {
    // Guard against a registry/codec-map drift: if the target is registered but
    // has no encoder, fail loudly instead of crashing on a non-null assertion.
    if (!AUDIO_CODECS[tgt]) throw new UnsupportedConversionError(cat, tgt);
    const result = await runFFmpeg(audioArgs(validated), { inputPath, signal: runOptions.signal }).catch((e: Error) => {
      if (/does not contain any stream/i.test(e.message)) {
        throw new NoAudioStreamError();
      }
      throw e;
    });
    return { data: Buffer.alloc(0), mime, result };
  }

  if (VIDEO_TARGETS.has(tgt)) {
    // Guard against a registry/codec-map drift: if the target is registered but
    // has no encoder, fail loudly instead of crashing on a non-null assertion.
    if (!VIDEO_CODECS[tgt]) throw new UnsupportedConversionError(cat, tgt);
    const result = await runFFmpeg(videoArgs(validated), { inputPath, signal: runOptions.signal });
    return { data: Buffer.alloc(0), mime, result };
  }

  throw new UnsupportedConversionError(cat, tgt);
}