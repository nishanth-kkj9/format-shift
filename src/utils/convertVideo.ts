import { TargetFormat, VideoConversionOptions } from "../types";
import { planConversion } from "../core/conversionRegistry";

// Video conversion always runs on the FFmpeg server: every registered video
// target (mp4/webm/gif/mov/mkv/avi and the audio extractions) is a server-engine
// target, so no browser canvas/MediaRecorder path is ever valid. This guard is
// kept so a stray client-side call fails loudly instead of silently substituting
// a different container than the one requested.
export async function convertVideo(
  _file: File,
  targetFormat: TargetFormat,
  _options: VideoConversionOptions,
  _onProgress?: (pct: number) => void,
  _abortSignal?: AbortSignal
): Promise<{ blob: Blob; dimensions?: { width: number; height: number }; duration?: number }> {
  const plan = planConversion("video", targetFormat);
  if (plan.supported === false || plan.target.engine !== "browser") {
    throw new Error(`Video -> ${targetFormat} must run on the FFmpeg server`);
  }
  // Unreachable by construction: the registry has no browser-engine video
  // target. Kept only so TypeScript knows the guard cannot fall through.
  throw new Error(`Video -> ${targetFormat} is not supported in the browser`);
}
