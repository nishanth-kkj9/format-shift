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

  const filters: string[] = [];
  if (opts.resolution && opts.resolution !== "original" && RESOLUTIONS[opts.resolution]) {
    filters.push(
      `scale=${RESOLUTIONS[opts.resolution]}:force_original_aspect_ratio=decrease:force_divisible_by=2`
    );
  }
  if (tgt === "gif") {
    // Single-pass palette generation (see filters.ts imageFilters): derive a
    // palette from the stream itself, then map through it. stats_mode=diff
    // samples per-frame differences so fast motion keeps its colors.
    filters.push(
      "split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5"
    );
  }
  if (opts.muteAudio) args.push("-an");
  if (opts.fps) args.push("-r", String(opts.fps));
  if (filters.length) args.push("-vf", filters.join(","));
  args.push("-f", videoFormat(tgt));
  return args;
}
