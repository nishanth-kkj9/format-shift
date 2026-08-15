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
  const tgt = opts.targetFormat.toLowerCase();
  const cat = (opts.category || "").toLowerCase();

  // Any registered target is a legitimate server conversion (the registry's
  // engine flag only steers client-side routing). The one exception is SVG,
  // which ffmpeg cannot write — it is genuinely browser-only.
  const plan = planConversion(cat as FileCategory, tgt);
  if (plan.supported === false) throw new UnsupportedConversionError(cat, tgt);
  if (tgt === 'svg') throw new UnsupportedConversionError(cat, tgt);

  const mime = plan.target.mime;

  if (cat === "image") {
    const result = await runFFmpeg(imageArgs(opts), { inputPath, signal: runOptions.signal });
    return { data: Buffer.alloc(0), mime, result };
  }

  if (AUDIO_TARGETS.has(tgt)) {
    const result = await runFFmpeg(audioArgs(opts), { inputPath, signal: runOptions.signal }).catch((e: Error) => {
      if (/does not contain any stream/i.test(e.message)) {
        throw new NoAudioStreamError();
      }
      throw e;
    });
    return { data: Buffer.alloc(0), mime, result };
  }

  if (VIDEO_TARGETS.has(tgt)) {
    const result = await runFFmpeg(videoArgs(opts), { inputPath, signal: runOptions.signal });
    return { data: Buffer.alloc(0), mime, result };
  }

  throw new UnsupportedConversionError(cat, tgt);
}
