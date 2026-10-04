import { CONVERSION_REGISTRY } from "../core/conversionRegistry";
import type { FileCategory } from "../core/conversionRegistry";

/**
 * Which fine-tuning controls actually change the output for a given target.
 *
 * The registry's `capabilities` flags are the single source of truth; the
 * option modal used to gate purely by category, so it offered knobs that do
 * nothing for the selected target (a quality slider for `svg`/`gif`/`bmp`/`ico`
 * where the encoder ignores it, a bitrate box for in-browser `wav`, and
 * resolution/fps/mute for video -> audio extraction where the video stream is
 * discarded). Kept in its own module so it stays pure and testable — the drift
 * test over every registry pair lives in `src/core/consistency.test.ts`.
 */
export interface OptionVisibility {
  /** Target honors a quality/bitrate knob (image quality, audio/video bitrate). */
  quality: boolean;
  /** Target honors video geometry knobs (resolution, fps, mute). */
  videoShape: boolean;
}

export function optionVisibility(category: FileCategory, targetFormat: string): OptionVisibility {
  const capabilities = CONVERSION_REGISTRY[category]?.targets[targetFormat?.toLowerCase()]?.capabilities;
  return {
    quality: capabilities?.quality === true,
    // Audio-extraction targets strip the video stream entirely, so resolution,
    // fps and mute cannot affect the result.
    videoShape: category === "video" && capabilities?.audioExtract !== true,
  };
}
