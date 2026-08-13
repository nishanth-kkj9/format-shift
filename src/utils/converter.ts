import {
  FileCategory,
  ImageFormat,
  AudioFormat,
  VideoFormat,
  DocumentFormat,
  DataFormat,
  TargetFormat,
  ConversionOptions,
  ImageConversionOptions,
  AudioConversionOptions,
  VideoConversionOptions,
  DataConversionOptions,
  SocialMediaPreset,
} from '../types';
import { convertAudioToSpectrumVideo } from './audioVisualizer';

// Detect Category and Available Formats from File
export function detectCategoryAndFormats(file: File): {
  category: FileCategory;
  sourceFormat: string;
  defaultTargetFormat: TargetFormat;
  availableTargets: TargetFormat[];
} {
  const name = file.name.toLowerCase();
  const ext = name.split('.').pop() || '';
  const type = file.type.toLowerCase();

  // 1. Image Formats
  const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'svg', 'avif'];
  if (type.startsWith('image/') || imageExts.includes(ext)) {
    const sourceFormat = ext || 'png';
    const availableTargets: ImageFormat[] = ['jpg', 'png', 'webp', 'gif', 'bmp', 'ico', 'svg', 'avif'];
    const defaultTargetFormat: ImageFormat = sourceFormat === 'png' ? 'jpg' : sourceFormat === 'jpg' || sourceFormat === 'jpeg' ? 'webp' : 'png';
    return {
      category: 'image',
      sourceFormat,
      defaultTargetFormat,
      availableTargets,
    };
  }

  // 2. Audio Formats
  const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'weba'];
  if (type.startsWith('audio/') || audioExts.includes(ext)) {
    const sourceFormat = ext || 'mp3';
    // Audio can convert to audio formats OR Audio Spectrum Visualizer Video (MP4 / WEBM / GIF)
    const availableTargets: (AudioFormat | VideoFormat)[] = ['wav', 'mp3', 'ogg', 'aac', 'flac', 'mp4', 'webm', 'gif'];
    const defaultTargetFormat: TargetFormat = sourceFormat === 'wav' ? 'mp3' : 'wav';
    return {
      category: 'audio',
      sourceFormat,
      defaultTargetFormat,
      availableTargets: availableTargets as TargetFormat[],
    };
  }

  // 3. Video Formats
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'];
  if (type.startsWith('video/') || videoExts.includes(ext)) {
    const sourceFormat = ext || 'mp4';
    // Videos can also be converted to GIF or audio formats!
    const availableTargets: (VideoFormat | AudioFormat)[] = ['webm', 'mp4', 'gif', 'mov', 'wav', 'mp3'];
    const defaultTargetFormat: TargetFormat = sourceFormat === 'mp4' ? 'webm' : 'mp4';
    return {
      category: 'video',
      sourceFormat,
      defaultTargetFormat,
      availableTargets: availableTargets as TargetFormat[],
    };
  }

  // 4. Data Formats
  const dataExts = ['json', 'csv', 'tsv', 'xml', 'yaml', 'yml'];
  if (dataExts.includes(ext) || type.includes('json') || type.includes('csv') || type.includes('xml')) {
    const sourceFormat = ext || 'json';
    const availableTargets: DataFormat[] = ['csv', 'json', 'xml', 'yaml', 'tsv'];
    const defaultTargetFormat: DataFormat = sourceFormat === 'json' ? 'csv' : 'json';
    return {
      category: 'data',
      sourceFormat,
      defaultTargetFormat,
      availableTargets,
    };
  }

  // 5. Document Formats
  const docExts = ['pdf', 'txt', 'md', 'html', 'htm'];
  const sourceFormat = ext || 'txt';
  const availableTargets: TargetFormat[] = ['pdf', 'txt', 'md', 'html', 'png', 'jpg'];
  const defaultTargetFormat: DocumentFormat = sourceFormat === 'md' ? 'html' : sourceFormat === 'html' ? 'pdf' : 'txt';
  return {
    category: 'document',
    sourceFormat,
    defaultTargetFormat,
    availableTargets,
  };
}

// Social Media Preset Dimensions Map
export const SOCIAL_PRESETS: Record<Exclude<SocialMediaPreset, 'custom'>, { w: number; h: number; label: string }> = {
  'instagram-square': { w: 1080, h: 1080, label: 'Instagram Square (1080×1080)' },
  'instagram-story': { w: 1080, h: 1920, label: 'Instagram Story / Reel (1080×1920)' },
  'youtube-thumb': { w: 1280, h: 720, label: 'YouTube Thumbnail (1280×720)' },
  'twitter-header': { w: 1500, h: 500, label: 'Twitter / X Header (1500×500)' },
  'linkedin-banner': { w: 1584, h: 396, label: 'LinkedIn Banner (1584×396)' },
  'facebook-cover': { w: 820, h: 312, label: 'Facebook Cover (820×312)' },
  favicon: { w: 32, h: 32, label: 'Favicon Icon (32×32)' },
};

// Convert Image using HTML5 Canvas
export async function convertImage(
  file: File,
  targetFormat: TargetFormat,
  options: ImageConversionOptions,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; dimensions: { width: number; height: number } }> {
  onProgress?.(10);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      onProgress?.(30);
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image data'));
      img.onload = () => {
        onProgress?.(50);
        let width = img.width;
        let height = img.height;

        // Apply Social Media Preset dimensions if selected
        let presetDim: { w: number; h: number } | null = null;
        if (options.socialPreset && options.socialPreset !== 'custom' && SOCIAL_PRESETS[options.socialPreset]) {
          presetDim = SOCIAL_PRESETS[options.socialPreset];
        }

        if (presetDim) {
          // Preset target canvas dimensions
          const canvas = document.createElement('canvas');
          canvas.width = presetDim.w;
          canvas.height = presetDim.h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas 2d context'));
            return;
          }

          // Fill background
          ctx.fillStyle = options.bgColor || '#0f172a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Calculate aspect fit scale to center image on canvas
          const scale = Math.min(canvas.width / width, canvas.height / height);
          const drawW = width * scale;
          const drawH = height * scale;
          const drawX = (canvas.width - drawW) / 2;
          const drawY = (canvas.height - drawH) / 2;

          ctx.drawImage(img, drawX, drawY, drawW, drawH);

          // Grayscale filter
          if (options.grayscale) {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
              data[i] = avg;
              data[i + 1] = avg;
              data[i + 2] = avg;
            }
            ctx.putImageData(imgData, 0, 0);
          }

          const qualityVal = (options.quality || 85) / 100;
          let mimeType = 'image/jpeg';
          const tgt = targetFormat.toLowerCase();
          if (tgt === 'png') mimeType = 'image/png';
          else if (tgt === 'webp') mimeType = 'image/webp';

          canvas.toBlob(
            (blob) => {
              onProgress?.(100);
              if (blob) {
                resolve({ blob, dimensions: { width: canvas.width, height: canvas.height } });
              } else {
                const dataUrl = canvas.toDataURL('image/png');
                const fallbackBlob = dataUrlToBlob(dataUrl);
                resolve({ blob: fallbackBlob, dimensions: { width: canvas.width, height: canvas.height } });
              }
            },
            mimeType,
            qualityVal
          );
          return;
        }

        // Scale max width/height for custom preset
        if (options.maxWidth && width > options.maxWidth) {
          if (options.maintainAspectRatio) {
            height = Math.round((height * options.maxWidth) / width);
          }
          width = options.maxWidth;
        }
        if (options.maxHeight && height > options.maxHeight) {
          if (options.maintainAspectRatio) {
            width = Math.round((width * options.maxHeight) / height);
          }
          height = options.maxHeight;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas 2d context'));
          return;
        }

        // Handle rotation & flip canvas dimensions
        const rad = (options.rotation * Math.PI) / 180;
        const isSwapped = options.rotation === 90 || options.rotation === 270;
        canvas.width = isSwapped ? height : width;
        canvas.height = isSwapped ? width : height;

        ctx.save();
        // Background fill
        if (options.bgColor) {
          ctx.fillStyle = options.bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Transform canvas
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.scale(options.flipHorizontal ? -1 : 1, options.flipVertical ? -1 : 1);

        // Draw image
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
        ctx.restore();

        // Apply Grayscale if requested
        if (options.grayscale) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg; // R
            data[i + 1] = avg; // G
            data[i + 2] = avg; // B
          }
          ctx.putImageData(imgData, 0, 0);
        }

        onProgress?.(80);

        // Determine target MIME type
        let mimeType = 'image/jpeg';
        const tgt = targetFormat.toLowerCase();
        if (tgt === 'png') mimeType = 'image/png';
        else if (tgt === 'webp') mimeType = 'image/webp';
        else if (tgt === 'bmp') mimeType = 'image/bmp';
        else if (tgt === 'gif') mimeType = 'image/gif';
        else if (tgt === 'ico') mimeType = 'image/x-icon';
        else if (tgt === 'svg') mimeType = 'image/svg+xml';
        else if (tgt === 'avif') mimeType = 'image/avif';

        // Special handling for SVG wrapper format
        if (tgt === 'svg') {
          const dataUrl = canvas.toDataURL('image/png');
          const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
            <image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}" />
          </svg>`;
          const blob = new Blob([svgString], { type: 'image/svg+xml' });
          onProgress?.(100);
          resolve({ blob, dimensions: { width: canvas.width, height: canvas.height } });
          return;
        }

        // ICO format output
        if (tgt === 'ico') {
          // Resize canvas to 32x32 for standard favicon icon
          const icoCanvas = document.createElement('canvas');
          icoCanvas.width = 32;
          icoCanvas.height = 32;
          const icoCtx = icoCanvas.getContext('2d');
          icoCtx?.drawImage(canvas, 0, 0, 32, 32);
          icoCanvas.toBlob(
            (icoBlob) => {
              if (icoBlob) {
                onProgress?.(100);
                resolve({ blob: icoBlob, dimensions: { width: 32, height: 32 } });
              } else {
                reject(new Error('Failed to export ICO file'));
              }
            },
            'image/x-icon'
          );
          return;
        }

        const qualityVal = (options.quality || 85) / 100;
        canvas.toBlob(
          (blob) => {
            onProgress?.(100);
            if (blob) {
              resolve({ blob, dimensions: { width: canvas.width, height: canvas.height } });
            } else {
              // Fallback for browsers that don't support certain MIME types like BMP/AVIF directly
              const dataUrl = canvas.toDataURL('image/png');
              const fallbackBlob = dataUrlToBlob(dataUrl);
              resolve({ blob: fallbackBlob, dimensions: { width: canvas.width, height: canvas.height } });
            }
          },
          mimeType,
          qualityVal
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Convert Audio / Extract Audio from Video using AudioContext & Web Audio API
export async function convertAudio(
  file: File,
  targetFormat: TargetFormat,
  options: AudioConversionOptions,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; duration: number }> {
  // If target format is a video format (MP4, WEBM, GIF) or user explicitly enabled spectrum visualizer
  if (
    targetFormat === 'mp4' ||
    targetFormat === 'webm' ||
    targetFormat === 'gif' ||
    options.spectrumVisualizer
  ) {
    const result = await convertAudioToSpectrumVideo(file, targetFormat, options, onProgress);
    return { blob: result.blob, duration: result.duration };
  }

  onProgress?.(15);
  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(40);

  const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtxClass();

  let decodedBuffer: AudioBuffer;
  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error('Could not decode audio data from file');
  }

  onProgress?.(60);
  const duration = decodedBuffer.duration;

  // Handle trim start / trim end
  let startSec = options.trimStart || 0;
  let endSec = options.trimEnd && options.trimEnd < duration ? options.trimEnd : duration;
  if (startSec >= endSec) startSec = 0;

  const targetSampleRate = options.sampleRate || decodedBuffer.sampleRate;
  const numChannels = options.channels || Math.min(decodedBuffer.numberOfChannels, 2);

  const startFrame = Math.floor(startSec * decodedBuffer.sampleRate);
  const endFrame = Math.floor(endSec * decodedBuffer.sampleRate);
  const frameLength = Math.max(1, endFrame - startFrame);

  // Render to OfflineAudioContext
  const offlineCtx = new OfflineAudioContext(numChannels, frameLength, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = decodedBuffer;

  // Apply Gain / Volume
  const gainNode = offlineCtx.createGain();
  gainNode.gain.value = (options.volume || 100) / 100;

  source.connect(gainNode);
  gainNode.connect(offlineCtx.destination);

  source.start(0, startSec, endSec - startSec);

  onProgress?.(80);
  const renderedBuffer = await offlineCtx.startRendering();

  // Export to WAV PCM
  const wavBlob = audioBufferToWavBlob(renderedBuffer);
  onProgress?.(100);

  audioCtx.close();
  return { blob: wavBlob, duration: endSec - startSec };
}

// Helper: Convert AudioBuffer to WAV Blob
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  let result: Float32Array;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    result = new Float32Array(left.length + right.length);
    for (let i = 0; i < left.length; i++) {
      result[i * 2] = left[i];
      result[i * 2 + 1] = right[i];
    }
  } else {
    result = buffer.getChannelData(0);
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteLength = result.length * bytesPerSample;
  const headerByteLength = 44;
  const totalLength = headerByteLength + dataByteLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + dataByteLength, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, dataByteLength, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < result.length; i++) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Convert Video format / Video to WEBM/MP4/GIF
export async function convertVideo(
  file: File,
  targetFormat: TargetFormat,
  options: VideoConversionOptions,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; dimensions?: { width: number; height: number }; duration?: number }> {
  onProgress?.(10);

  // If user selected audio format target from video (e.g. video -> WAV/MP3), route to audio converter!
  if (targetFormat === 'wav' || targetFormat === 'mp3' || targetFormat === 'ogg' || targetFormat === 'aac') {
    const audioOpts: AudioConversionOptions = { bitrate: '192k', sampleRate: 44100, channels: 2, volume: 100 };
    return convertAudio(file, targetFormat, audioOpts, onProgress);
  }

  return new Promise((resolve, reject) => {
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = options.muteAudio;
    video.src = videoUrl;

    video.onerror = () => reject(new Error('Unable to load video file'));

    video.onloadedmetadata = () => {
      onProgress?.(30);
      let targetWidth = video.videoWidth;
      let targetHeight = video.videoHeight;

      if (options.resolution === '1080p') {
        targetWidth = 1920;
        targetHeight = 1080;
      } else if (options.resolution === '720p') {
        targetWidth = 1280;
        targetHeight = 720;
      } else if (options.resolution === '480p') {
        targetWidth = 854;
        targetHeight = 480;
      } else if (options.resolution === '360p') {
        targetWidth = 640;
        targetHeight = 360;
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const fps = options.fps || 30;
      const canvasStream = canvas.captureStream(fps);

      let mediaRecorder: MediaRecorder;
      const mimeType = targetFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : 'video/webm';

      try {
        mediaRecorder = new MediaRecorder(canvasStream, { mimeType });
      } catch {
        mediaRecorder = new MediaRecorder(canvasStream);
      }

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        onProgress?.(100);
        URL.revokeObjectURL(videoUrl);
        const finalBlob = new Blob(chunks, { type: mimeType });
        resolve({
          blob: finalBlob,
          dimensions: { width: targetWidth, height: targetHeight },
          duration: video.duration,
        });
      };

      mediaRecorder.start();
      video.play();

      const drawFrame = () => {
        if (video.ended || video.paused) {
          mediaRecorder.stop();
          return;
        }
        if (ctx) {
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        }
        const pct = Math.min(95, Math.round((video.currentTime / video.duration) * 100));
        onProgress?.(pct);
        requestAnimationFrame(drawFrame);
      };

      requestAnimationFrame(drawFrame);
    };
  });
}

// Convert Data / Document formats (JSON, CSV, XML, YAML, MD, HTML, TXT)
export async function convertDataDocument(
  file: File,
  targetFormat: TargetFormat,
  options?: DataConversionOptions,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; convertedText?: string }> {
  onProgress?.(20);
  const text = await file.text();
  onProgress?.(50);

  const tgt = targetFormat.toLowerCase();
  let resultText = '';

  try {
    // 1. Convert JSON
    if (file.name.endsWith('.json') || isJson(text)) {
      const parsed = JSON.parse(text);
      if (tgt === 'csv' || tgt === 'tsv') {
        const sep = tgt === 'tsv' || options?.delimiter === '\t' ? '\t' : options?.delimiter || ',';
        resultText = jsonToCsv(parsed, sep);
      } else if (tgt === 'xml') {
        resultText = jsonToXml(parsed);
      } else if (tgt === 'yaml') {
        resultText = jsonToYaml(parsed);
      } else if (tgt === 'txt' || tgt === 'md') {
        resultText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, options?.indentSpaces || 2);
      } else {
        resultText = JSON.stringify(parsed, null, options?.indentSpaces || 2);
      }
    }
    // 2. Convert CSV / TSV
    else if (file.name.endsWith('.csv') || file.name.endsWith('.tsv') || text.includes(',')) {
      const sep = file.name.endsWith('.tsv') ? '\t' : ',';
      const parsedJson = csvToJson(text, sep);
      if (tgt === 'json') {
        resultText = JSON.stringify(parsedJson, null, options?.indentSpaces || 2);
      } else if (tgt === 'xml') {
        resultText = jsonToXml({ record: parsedJson });
      } else if (tgt === 'yaml') {
        resultText = jsonToYaml(parsedJson);
      } else if (tgt === 'tsv') {
        resultText = jsonToCsv(parsedJson, '\t');
      } else {
        resultText = text;
      }
    }
    // 3. Convert Markdown / Text / HTML
    else {
      if (tgt === 'html') {
        resultText = markdownToHtml(text);
      } else if (tgt === 'json') {
        resultText = JSON.stringify({ content: text, lines: text.split('\n') }, null, 2);
      } else {
        resultText = text;
      }
    }
  } catch (err) {
    // Fallback: output plain text
    resultText = text;
  }

  onProgress?.(90);

  let mimeType = 'text/plain';
  if (tgt === 'json') mimeType = 'application/json';
  else if (tgt === 'csv') mimeType = 'text/csv';
  else if (tgt === 'xml') mimeType = 'application/xml';
  else if (tgt === 'html') mimeType = 'text/html';
  else if (tgt === 'pdf') mimeType = 'application/pdf';

  const blob = new Blob([resultText], { type: mimeType });
  onProgress?.(100);

  return { blob, convertedText: resultText };
}

// Data Helper Functions
function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function jsonToCsv(json: unknown, delimiter = ','): string {
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length === 0) return '';

  const headers = Object.keys(arr[0] as Record<string, unknown>);
  const headerLine = headers.join(delimiter);

  const rows = arr.map((item) => {
    const record = item as Record<string, unknown>;
    return headers
      .map((header) => {
        const val = record[header];
        if (val === null || val === undefined) return '';
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return strVal.includes(delimiter) || strVal.includes('\n') ? `"${strVal.replace(/"/g, '""')}"` : strVal;
      })
      .join(delimiter);
  });

  return [headerLine, ...rows].join('\n');
}

function csvToJson(csvText: string, delimiter = ','): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];

  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, index) => {
      obj[h] = values[index] || '';
    });
    results.push(obj);
  }

  return results;
}

function jsonToXml(obj: unknown, rootName = 'root'): string {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;

  function buildXml(data: unknown, indent = '  ') {
    if (Array.isArray(data)) {
      data.forEach((item) => {
        xml += `${indent}<item>\n`;
        buildXml(item, indent + '  ');
        xml += `${indent}</item>\n`;
      });
    } else if (typeof data === 'object' && data !== null) {
      Object.entries(data as Record<string, unknown>).forEach(([key, val]) => {
        const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
        if (typeof val === 'object' && val !== null) {
          xml += `${indent}<${cleanKey}>\n`;
          buildXml(val, indent + '  ');
          xml += `${indent}</${cleanKey}>\n`;
        } else {
          xml += `${indent}<${cleanKey}>${val}</${cleanKey}>\n`;
        }
      });
    } else {
      xml += `${indent}${data}\n`;
    }
  }

  buildXml(obj);
  xml += `</${rootName}>`;
  return xml;
}

function jsonToYaml(obj: unknown, indent = 0): string {
  let yaml = '';
  const spaces = ' '.repeat(indent);

  if (Array.isArray(obj)) {
    obj.forEach((item) => {
      if (typeof item === 'object' && item !== null) {
        yaml += `${spaces}-\n${jsonToYaml(item, indent + 2)}`;
      } else {
        yaml += `${spaces}- ${item}\n`;
      }
    });
  } else if (typeof obj === 'object' && obj !== null) {
    Object.entries(obj as Record<string, unknown>).forEach(([key, val]) => {
      if (typeof val === 'object' && val !== null) {
        yaml += `${spaces}${key}:\n${jsonToYaml(val, indent + 2)}`;
      } else {
        yaml += `${spaces}${key}: ${val}\n`;
      }
    });
  } else {
    yaml += `${spaces}${obj}\n`;
  }

  return yaml;
}

function markdownToHtml(md: string): string {
  let html = md
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
    .replace(/\*(.*)\*/gim, '<i>$1</i>')
    .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')
    .replace(/\n$/gim, '<br />');

  return `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"/><title>Converted Document</title></head>\n<body style="font-family:sans-serif;padding:2rem;">\n${html}\n</body>\n</html>`;
}

// Ready-to-use Sample File Generator for 1-click quick testing!
export function generateSampleFile(category: FileCategory): File {
  if (category === 'image') {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;

    // Draw vibrant gradient card
    const grad = ctx.createLinearGradient(0, 0, 400, 300);
    grad.addColorStop(0, '#3b82f6');
    grad.addColorStop(0.5, '#8b5cf6');
    grad.addColorStop(1, '#ec4899');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 300);

    // Draw glass card
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.roundRect(40, 40, 320, 220, 16);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('FormatShift Sample Image', 60, 120);
    ctx.font = '14px sans-serif';
    ctx.fillText('PNG with Alpha Gradient & Sharp Details', 60, 160);

    const dataUrl = canvas.toDataURL('image/png');
    const blob = dataUrlToBlob(dataUrl);
    return new File([blob], 'sample_vibrant_card.png', { type: 'image/png' });
  }

  if (category === 'audio') {
    // Generate a 2-second synthesized audio chime WAV
    const sampleRate = 44100;
    const duration = 2;
    const numSamples = sampleRate * duration;
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Synthesize C Major chord sound
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-2 * t);
      const tone1 = Math.sin(2 * Math.PI * 440 * t);
      const tone2 = Math.sin(2 * Math.PI * 554.37 * t);
      const tone3 = Math.sin(2 * Math.PI * 659.25 * t);
      channelData[i] = 0.3 * (tone1 + tone2 + tone3) * decay;
    }

    const wavBlob = audioBufferToWavBlob(buffer);
    audioCtx.close();
    return new File([wavBlob], 'sample_audio_chime.wav', { type: 'audio/wav' });
  }

  if (category === 'data') {
    const sampleData = [
      { id: 1, name: 'FormatShift Pro', category: 'Software', userCount: 12500, rating: 4.9, active: true },
      { id: 2, name: 'Cloud Converter', category: 'API', userCount: 8400, rating: 4.7, active: true },
      { id: 3, name: 'Media Toolkit', category: 'Utility', userCount: 3200, rating: 4.8, active: false },
      { id: 4, name: 'Fast Encoder', category: 'Engine', userCount: 19800, rating: 5.0, active: true },
    ];
    const jsonStr = JSON.stringify(sampleData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    return new File([blob], 'sample_dataset.json', { type: 'application/json' });
  }

  // Document default
  const docMd = `# FormatShift Universal Converter

Welcome to **FormatShift**! Convert any file format instantly inside your browser or server.

## Features Supported:
- **Images**: PNG, JPG, WEBP, GIF, BMP, ICO, SVG, AVIF
- **Audio**: MP3, WAV, OGG, AAC, M4A, FLAC
- **Video**: MP4, WEBM, GIF, MOV
- **Data & Documents**: JSON, CSV, XML, YAML, MD, HTML, TXT

> Designed with modern UI/UX and full responsiveness!
`;
  const docBlob = new Blob([docMd], { type: 'text/markdown' });
  return new File([docBlob], 'sample_document.md', { type: 'text/markdown' });
}

// File Size Formatter Helper
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
