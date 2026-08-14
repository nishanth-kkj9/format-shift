import { ConversionOptions } from '../types';

// Targets the browser can't genuinely produce client-side — route these to the local backend.
const SERVER_IMAGE_TARGETS = new Set(['avif', 'ico', 'bmp', 'gif']);
const SERVER_AUDIO_TARGETS = new Set(['mp3', 'aac', 'm4a', 'flac', 'ogg']);
const SERVER_VIDEO_TARGETS = new Set(['mp4', 'mov', 'mkv', 'avi', 'gif']);

export function needsServerConversion(category: string, targetFormat: string): boolean {
  const tgt = targetFormat.toLowerCase();
  if (category === 'image') return SERVER_IMAGE_TARGETS.has(tgt);
  if (category === 'audio') return SERVER_AUDIO_TARGETS.has(tgt);
  if (category === 'video') {
    // video -> audio extraction needs ffmpeg too
    if (SERVER_AUDIO_TARGETS.has(tgt)) return true;
    return SERVER_VIDEO_TARGETS.has(tgt);
  }
  return false;
}

export async function convertServerSide(
  file: File,
  category: string,
  sourceFormat: string,
  targetFormat: string,
  options: ConversionOptions,
  abortSignal?: AbortSignal
): Promise<Blob> {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  form.append('sourceFormat', sourceFormat);
  form.append('targetFormat', targetFormat);
  const categoryKey = category as keyof ConversionOptions;
  form.append('options', JSON.stringify(options[categoryKey] || {}));

  const res = await fetch('/api/convert', { method: 'POST', body: form, signal: abortSignal });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `Server conversion failed (${res.status})`);
  }
  return res.blob();
}