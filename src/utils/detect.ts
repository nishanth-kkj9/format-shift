import {
  TargetFormat,
  SocialMediaPreset,
} from '../types';
import { CONVERSION_REGISTRY, getAvailableTargets, FileCategory } from '../core/conversionRegistry';

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

const IMAGE_EXTS = new Set(CONVERSION_REGISTRY.image.sourceFormats);
const AUDIO_EXTS = new Set(CONVERSION_REGISTRY.audio.sourceFormats);
const VIDEO_EXTS = new Set(CONVERSION_REGISTRY.video.sourceFormats);
const DATA_EXTS = new Set(CONVERSION_REGISTRY.data.sourceFormats);

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
  if (type.startsWith('image/') || IMAGE_EXTS.has(ext)) {
    const sourceFormat = ext || 'png';
    return {
      category: 'image',
      sourceFormat,
      defaultTargetFormat: CONVERSION_REGISTRY.image.defaultTarget(sourceFormat) as TargetFormat,
      availableTargets: getAvailableTargets('image') as TargetFormat[],
    };
  }

  // 2. Audio Formats
  if (type.startsWith('audio/') || AUDIO_EXTS.has(ext)) {
    const sourceFormat = ext || 'mp3';
    return {
      category: 'audio',
      sourceFormat,
      defaultTargetFormat: CONVERSION_REGISTRY.audio.defaultTarget(sourceFormat) as TargetFormat,
      availableTargets: getAvailableTargets('audio') as TargetFormat[],
    };
  }

  // 3. Video Formats
  if (type.startsWith('video/') || VIDEO_EXTS.has(ext)) {
    const sourceFormat = ext || 'mp4';
    return {
      category: 'video',
      sourceFormat,
      defaultTargetFormat: CONVERSION_REGISTRY.video.defaultTarget(sourceFormat) as TargetFormat,
      availableTargets: getAvailableTargets('video') as TargetFormat[],
    };
  }

  // 4. Data Formats
  if (DATA_EXTS.has(ext) || type.includes('json') || type.includes('csv') || type.includes('xml')) {
    const sourceFormat = ext || 'json';
    return {
      category: 'data',
      sourceFormat,
      defaultTargetFormat: CONVERSION_REGISTRY.data.defaultTarget(sourceFormat) as TargetFormat,
      availableTargets: getAvailableTargets('data') as TargetFormat[],
    };
  }

  // 5. Document Formats
  const sourceFormat = ext || 'txt';
  return {
    category: 'document',
    sourceFormat,
    defaultTargetFormat: CONVERSION_REGISTRY.document.defaultTarget(sourceFormat) as TargetFormat,
    availableTargets: getAvailableTargets('document') as TargetFormat[],
  };
}
