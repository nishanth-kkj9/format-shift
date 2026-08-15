import { AudioConversionOptions, TargetFormat } from '../types';
import { renderSpectrumVideo, SpectrumVideoResult } from './visualizer/engine';

// Thin facade over the visualizer engine — keeps the public contract used by
// convertAudio (blob + mimeType + dimensions + duration).
export async function convertAudioToSpectrumVideo(
  file: File,
  targetFormat: TargetFormat,
  options: AudioConversionOptions,
  onProgress?: (pct: number) => void,
  abortSignal?: AbortSignal
): Promise<SpectrumVideoResult> {
  return renderSpectrumVideo(file, targetFormat, options, onProgress, abortSignal);
}
