import type { ConvertOptions } from "../convert";

/** Video codec arg groups per target. */
export const VIDEO_CODECS: Record<string, string[]> = {
  mp4: ["-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"],
  mov: ["-c:v", "libx264", "-c:a", "aac"],
  mkv: ["-c:v", "libx264", "-c:a", "aac"],
  avi: ["-c:v", "mpeg4", "-c:a", "libmp3lame"],
  webm: ["-c:v", "libvpx-vp9", "-c:a", "libopus"],
  gif: [],
};

const RESOLUTIONS: Record<string, string> = {
  "1080p": "1920:1080",
  "720p": "1280:720",
  "480p": "854:480",
  "360p": "640:360",
};

/** Muxer/format name per target (ffmpeg `-f` value). */
export function videoFormat(tgt: string): string {
  return tgt === "mkv" ? "matroska" : tgt;
}

/**
 * Full ffmpeg args for a video container conversion. Uses
 * force_original_aspect_ratio=decrease so scaling never stretches the picture.
 */
export function videoArgs(opts: ConvertOptions): string[] {
  const tgt = opts.targetFormat.toLowerCase();
  const args: string[] = [...VIDEO_CODECS[tgt]!];

  const scaleFilter: string[] = [];
  if (opts.resolution && opts.resolution !== "original" && RESOLUTIONS[opts.resolution]) {
    scaleFilter.push(
      `scale=${RESOLUTIONS[opts.resolution]}:force_original_aspect_ratio=decrease:force_divisible_by=2`
    );
  }
  if (opts.muteAudio) args.push("-an");
  if (opts.fps) args.push("-r", String(opts.fps));
  if (scaleFilter.length) args.push("-vf", scaleFilter.join(","));
  if (tgt === "gif") args.push("-f", "gif");
  args.push("-f", videoFormat(tgt));
  return args;
}
