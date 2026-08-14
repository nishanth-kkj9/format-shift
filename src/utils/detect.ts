import {
  FileCategory,
  TargetFormat,
  ImageFormat,
  AudioFormat,
  VideoFormat,
  DataFormat,
  DocumentFormat,
  SocialMediaPreset,
} from '../types';

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
