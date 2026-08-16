export type FileCategory = "image" | "audio" | "video" | "document" | "data";

export type ImageFormat = "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "ico" | "svg" | "avif";
export type AudioFormat = "mp3" | "wav" | "ogg" | "aac" | "m4a" | "flac";
export type VideoFormat = "mp4" | "webm" | "gif" | "mov" | "mkv" | "avi";
export type DocumentFormat = "pdf" | "txt" | "md" | "html";
export type DataFormat = "json" | "csv" | "xml" | "yaml" | "tsv";

export type TargetFormat = ImageFormat | AudioFormat | VideoFormat | DocumentFormat | DataFormat;

export type ConversionStatus = "idle" | "converting" | "completed" | "error";

export type SpectrumStyle = "bars" | "wave" | "radial" | "particles";
export type SpectrumTheme =
  "neon-lime" | "indigo-violet" | "cyan-emerald" | "sunset-fire" | "matrix-green" | "aurora";

export type SocialMediaPreset =
  | "custom"
  | "instagram-square"
  | "instagram-story"
  | "youtube-thumb"
  | "twitter-header"
  | "linkedin-banner"
  | "facebook-cover"
  | "favicon";

export interface ImageConversionOptions {
  quality: number; // 1 to 100
  maintainAspectRatio: boolean;
  maxWidth?: number | undefined;
  maxHeight?: number | undefined;
  bgColor: string; // e.g. '#ffffff' for transparent PNGs converted to JPEG
  grayscale: boolean;
  rotation: number; // 0, 90, 180, 270
  flipHorizontal: boolean;
  flipVertical: boolean;
  socialPreset?: SocialMediaPreset | undefined;
  stripExif?: boolean | undefined; // Default true (canvas rasterization removes EXIF metadata)
}

export interface AudioConversionOptions {
  bitrate: "128k" | "192k" | "256k" | "320k";
  sampleRate: 22050 | 44100 | 48000;
  channels: 1 | 2; // 1 = Mono, 2 = Stereo
  volume: number; // 100 = 100%
  trimStart?: number | undefined; // seconds
  trimEnd?: number | undefined; // seconds
  spectrumVisualizer?: boolean | undefined;
  spectrumStyle?: SpectrumStyle | undefined;
  spectrumTheme?: SpectrumTheme | undefined;
}

export interface VideoConversionOptions {
  resolution: "original" | "1080p" | "720p" | "480p" | "360p";
  fps: 15 | 24 | 30 | 60;
  muteAudio: boolean;
  gifFps?: number | undefined;
  gifWidth?: number | undefined;
}

export interface DataConversionOptions {
  delimiter: "," | ";" | "\t";
  prettyPrint: boolean;
  indentSpaces: 2 | 4;
}

export interface ConversionOptions {
  image?: ImageConversionOptions | undefined;
  audio?: AudioConversionOptions | undefined;
  video?: VideoConversionOptions | undefined;
  data?: DataConversionOptions | undefined;
}

export interface ConversionItem {
  id: string;
  file: File;
  name: string;
  originalSize: number;
  originalExtension: string;
  category: FileCategory;
  targetFormat: TargetFormat;
  status: ConversionStatus;
  progress: number; // 0 to 100
  options: ConversionOptions;

  // Results
  convertedBlob?: Blob | undefined;
  convertedUrl?: string | undefined;
  convertedSize?: number | undefined;
  convertedName?: string | undefined;
  errorMessage?: string | undefined;

  // Metadata & Previews
  previewUrl?: string | undefined;
  duration?: number | undefined; // for audio/video
  dimensions?: { width: number; height: number } | undefined; // for images/videos
  lineCount?: number | undefined;
  statusMessage?: string | undefined; // e.g. "Processing image canvas...", "Encapsulating MP4 stream..."
}

export interface ConversionHistoryItem {
  id: string;
  originalName: string;
  convertedName: string;
  category: FileCategory;
  sourceFormat: string;
  targetFormat: string;
  originalSize: number;
  convertedSize: number;
  timestamp: string;
  downloadUrl: string;
}

export interface CodeTemplateResponse {
  category: string;
  sourceFormat: string;
  targetFormat: string;
  code: {
    python: string;
    node: string;
    html: string;
  };
}
