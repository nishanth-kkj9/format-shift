export interface ExtractedMetadata {
  previewUrl?: string;
  dimensions?: { width: number; height: number };
  duration?: number; // seconds
  lineCount?: number;
  mimeType: string;
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function extractFileMetadata(file: File): Promise<ExtractedMetadata> {
  const mimeType = file.type || 'application/octet-stream';
  const metadata: ExtractedMetadata = { mimeType };

  try {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'svg', 'avif'].includes(ext)) {
      const url = URL.createObjectURL(file);
      metadata.previewUrl = url;

      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          metadata.dimensions = { width: img.naturalWidth, height: img.naturalHeight };
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          metadata.previewUrl = undefined;
          resolve();
        };
        img.src = url;
      });
    } else if (file.type.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'].includes(ext)) {
      const url = URL.createObjectURL(file);
      metadata.previewUrl = url;

      await new Promise<void>((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          metadata.duration = video.duration;
          metadata.dimensions = { width: video.videoWidth, height: video.videoHeight };
          resolve();
        };
        video.onerror = () => {
          URL.revokeObjectURL(url);
          metadata.previewUrl = undefined;
          resolve();
        };
        video.src = url;
      });
    } else if (file.type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'weba'].includes(ext)) {
      const url = URL.createObjectURL(file);
      metadata.previewUrl = url;

      await new Promise<void>((resolve) => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          metadata.duration = audio.duration;
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          metadata.previewUrl = undefined;
          resolve();
        };
        audio.src = url;
      });
    } else if (file.type.startsWith('text/') || ['json', 'csv', 'xml', 'yaml', 'yml', 'txt', 'md', 'tsv'].includes(ext)) {
      if (file.size < 2 * 1024 * 1024) {
        const text = await file.text();
        const lines = text.split('\n').length;
        metadata.lineCount = lines;
      }
    }
  } catch (err) {
    console.warn('Metadata extraction non-fatal error:', err);
  }

  return metadata;
}
