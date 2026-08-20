import type { ConvertOptions } from "../convert";

/** Audio codec for each supported target (ffmpeg encoder name). */
export const AUDIO_CODECS: Record<string, string> = {
  mp3: "libmp3lame",
  aac: "aac",
  m4a: "aac",
  flac: "flac",
  ogg: "libvorbis",
  wav: "pcm_s16le",
};

/** Muxer/format name per target (ffmpeg `-f` value). */
export function audioFormat(tgt: string): string {
  if (tgt === "m4a") return "ipod";
  if (tgt === "aac") return "adts";
  return tgt;
}

/** Full ffmpeg args for audio encode / video->audio extraction. */
export function audioArgs(opts: ConvertOptions): string[] {
  const tgt = opts.targetFormat.toLowerCase();
  const args = ["-vn", "-c:a", AUDIO_CODECS[tgt]!];
  if (opts.bitrate) args.push("-b:a", opts.bitrate);
  if (opts.sampleRate) args.push("-ar", String(opts.sampleRate));
  if (opts.channels) args.push("-ac", String(opts.channels));
  if (opts.volume !== undefined && opts.volume !== 100) args.push("-filter:a", `volume=${opts.volume / 100}`);
  if (opts.trimStart) args.push("-ss", String(opts.trimStart));
  if (opts.trimEnd) args.push("-to", String(opts.trimEnd));
  args.push("-f", audioFormat(tgt));
  return args;
}
