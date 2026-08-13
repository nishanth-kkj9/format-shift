import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

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
}

const AUDIO_CODECS: Record<string, string> = {
  mp3: "libmp3lame",
  aac: "aac",
  m4a: "aac",
  flac: "flac",
  ogg: "libvorbis",
  wav: "pcm_s16le",
};

const VIDEO_CODECS: Record<string, string[]> = {
  mp4: ["-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"],
  mov: ["-c:v", "libx264", "-c:a", "aac"],
  mkv: ["-c:v", "libx264", "-c:a", "aac"],
  avi: ["-c:v", "mpeg4", "-c:a", "libmp3lame"],
  webm: ["-c:v", "libvpx-vp9", "-c:a", "libopus"],
  gif: [],
};

const MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  aac: "audio/aac",
  m4a: "audio/mp4",
  flac: "audio/flac",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  webm: "video/webm",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export const ACCEPTED_EXTENSIONS = Object.keys(MIME);

// pan:tail: avif/ico muxers need seekable output (header written after frames), so write those to a
// temp file instead of streaming to stdout. Upgrade path: memory-cost-free, files are small.
function runFFmpeg(args: string[], input: Buffer, seekableSuffix = ""): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg binary not available"));
    const outArgs = [...args, "pipe:1"];
    const tmpFile = seekableSuffix ? join(mkdtempSync(join(tmpdir(), "fs-")), `out.${seekableSuffix}`) : null;
    const finalArgs = tmpFile ? [...args, tmpFile] : outArgs;

    const proc = spawn(ffmpegPath, ["-hide_banner", "-i", "pipe:0", ...finalArgs]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("error", (e) => reject(new Error(e.message)));
    proc.on("close", (code) => {
      if (code === 0) {
        try {
          if (tmpFile) {
            const b = readFileSync(tmpFile);
            rmSync(join(tmpFile, ".."), { recursive: true, force: true });
            resolve(b);
          } else {
            resolve(Buffer.concat(out));
          }
        } catch (e) {
          reject(new Error(e instanceof Error ? e.message : "output read failed"));
        }
      } else {
        const stderr = Buffer.concat(err).toString("utf8");
        const lastErr = stderr.split("\n").filter(Boolean).slice(-3).join("\n");
        reject(new Error(`ffmpeg failed (${code}): ${lastErr}`));
      }
    });
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

function imageFilters(opts: ConvertOptions): string[] {
  const filters: string[] = [];
  const q = opts.quality ?? 90;

  if (opts.grayscale) filters.push("format=gray");
  if (opts.rotation) {
    // transpose filters: 0=90cw, 1=90ccw, 2=180
    const t = opts.rotation === 90 ? "0" : opts.rotation === 270 ? "1" : "2";
    filters.push(`transpose=${t}`);
  }
  if (opts.maxWidth || opts.maxHeight) {
    const w = opts.maxWidth ? String(opts.maxWidth) : "-2";
    const h = opts.maxHeight ? String(opts.maxHeight) : "-2";
    filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
  }
  if (opts.targetFormat === "ico") filters.push("scale=32:32:force_original_aspect_ratio=decrease");

  const args: string[] = [];
  if (filters.length) args.push("-vf", filters.join(","));

  // mjpeg quality: qscale 2-31 (lower=better). convert 0-100 -> 31..2
  if (["jpg", "jpeg"].includes(opts.targetFormat)) {
    const qscale = Math.round(31 - (q / 100) * 29);
    args.push("-q:v", String(qscale));
  } else if (opts.targetFormat === "webp") {
    args.push("-quality", String(q));
  } else if (opts.targetFormat === "avif") {
    args.push("-crf", String(Math.round(32 - (q / 100) * 24)));
  }

  return args;
}

// pan:tail: images pass through ffmpeg too (avif/bmp/ico have encoders lacking in browsers)
export async function convertFile(
  input: Buffer,
  opts: ConvertOptions
): Promise<{ data: Buffer; mime: string }> {
  const tgt = opts.targetFormat.toLowerCase();
  const cat = opts.category?.toLowerCase();
  const mime = MIME[tgt];
  if (!mime) throw new Error(`Unsupported target format: ${tgt}`);

  const isVideoTarget = ["mp4", "mov", "mkv", "avi", "webm", "gif"].includes(tgt);
  const isAudioTarget = AUDIO_CODECS[tgt] && !isVideoTarget;

  if (cat === "image") {
    // pan:tail: bmp has no standalone muxer (use -c:v + image2pipe); avif/ico need seekable output for late header
    const outFmt = tgt === "jpg" ? ["-f", "mjpeg"] : tgt === "bmp" ? ["-c:v", "bmp", "-f", "image2pipe"] : ["-f", tgt];
    const seekable = ["avif", "ico"].includes(tgt) ? tgt : "";
    const data = await runFFmpeg([...imageFilters(opts), ...outFmt], input, seekable);
    return { data, mime };
  }

  if (isAudioTarget || (cat === "video" && AUDIO_CODECS[tgt])) {
    const args = ["-vn", "-c:a", AUDIO_CODECS[tgt]!];
    if (opts.bitrate) args.push("-b:a", opts.bitrate);
    if (opts.sampleRate) args.push("-ar", String(opts.sampleRate));
    if (opts.channels) args.push("-ac", String(opts.channels));
    if (opts.volume && opts.volume !== 100) args.push("-filter:a", `volume=${opts.volume / 100}`);
    if (opts.trimStart) args.push("-ss", String(opts.trimStart));
    if (opts.trimEnd) args.push("-to", String(opts.trimEnd));
    const fmt = tgt === "m4a" ? "ipod" : tgt === "aac" ? "adts" : tgt;
    args.push("-f", fmt);
    const data = await runFFmpeg(args, input, tgt === "m4a" ? "m4a" : "").catch((e: Error) => {
      if (/does not contain any stream/i.test(e.message)) {
        throw new Error("Source has no audio stream to extract");
      }
      throw e;
    });
    return { data, mime };
  }

  if (isVideoTarget) {
    const args: string[] = [...VIDEO_CODECS[tgt]!];
    if (opts.resolution && opts.resolution !== "original") {
      const dims: Record<string, string> = {
        "1080p": "1920:1080",
        "720p": "1280:720",
        "480p": "854:480",
        "360p": "640:360",
      };
      args.push("-vf", `scale=${dims[opts.resolution]}:force_original_aspect_ratio=decrease`);
    }
    if (opts.fps) args.push("-r", String(opts.fps));
    const fmt = tgt === "mkv" ? "matroska" : tgt;
    args.push("-f", fmt);
    // pan:tail: mov/mkv/mp4(+faststart) write index after frames — need seekable output (temp file)
    const data = await runFFmpeg(args, input, ["mov", "mkv", "mp4"].includes(tgt) ? "mp4" : "");
    return { data, mime };
  }

  throw new Error(`Conversion not supported for ${cat} -> ${tgt}`);
}