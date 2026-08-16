// Single source of truth for which conversions exist and where they run.
// Pure data + pure functions — no DOM, no Node — so Vite (client) and esbuild
// (server bundle) can both import it without platform assumptions.

export type FileCategory = "image" | "audio" | "video" | "document" | "data";
export type ConversionEngine = "browser" | "server";

export interface TargetCapabilities {
  quality?: boolean;
  resize?: boolean;
  preview?: boolean;
  audioExtract?: boolean;
  visualizer?: boolean;
}

export interface TargetSpec {
  format: string;
  mime: string;
  engine: ConversionEngine;
  capabilities: TargetCapabilities;
}

export interface CategorySpec {
  category: FileCategory;
  /** extensions/format identifiers accepted as sources for this category */
  sourceFormats: string[];
  /** allowed target formats -> how/whether they run */
  targets: Record<string, TargetSpec>;
  /** pick a sensible default target for a given source format */
  defaultTarget: (sourceFormat: string) => string;
}

const IMAGE_TARGETS: Record<string, TargetSpec> = {
  jpg: {
    format: "jpg",
    mime: "image/jpeg",
    engine: "browser",
    capabilities: { quality: true, resize: true, preview: true },
  },
  jpeg: {
    format: "jpeg",
    mime: "image/jpeg",
    engine: "browser",
    capabilities: { quality: true, resize: true, preview: true },
  },
  png: {
    format: "png",
    mime: "image/png",
    engine: "browser",
    capabilities: { quality: true, resize: true, preview: true },
  },
  webp: {
    format: "webp",
    mime: "image/webp",
    engine: "browser",
    capabilities: { quality: true, resize: true, preview: true },
  },
  svg: {
    format: "svg",
    mime: "image/svg+xml",
    engine: "browser",
    capabilities: { resize: true, preview: true },
  },
  gif: { format: "gif", mime: "image/gif", engine: "server", capabilities: { resize: true, preview: true } },
  bmp: { format: "bmp", mime: "image/bmp", engine: "server", capabilities: { resize: true, preview: true } },
  ico: {
    format: "ico",
    mime: "image/x-icon",
    engine: "server",
    capabilities: { resize: true, preview: true },
  },
  avif: {
    format: "avif",
    mime: "image/avif",
    engine: "server",
    capabilities: { quality: true, resize: true, preview: true },
  },
};

const AUDIO_TARGETS: Record<string, TargetSpec> = {
  wav: { format: "wav", mime: "audio/wav", engine: "browser", capabilities: { preview: true } },
  mp3: {
    format: "mp3",
    mime: "audio/mpeg",
    engine: "server",
    capabilities: { quality: true, preview: true },
  },
  ogg: { format: "ogg", mime: "audio/ogg", engine: "server", capabilities: { quality: true, preview: true } },
  aac: { format: "aac", mime: "audio/aac", engine: "server", capabilities: { quality: true, preview: true } },
  m4a: { format: "m4a", mime: "audio/mp4", engine: "server", capabilities: { quality: true, preview: true } },
  flac: { format: "flac", mime: "audio/flac", engine: "server", capabilities: { preview: true } },
  // audio -> spectrum visualizer videos are produced client-side
  mp4: {
    format: "mp4",
    mime: "video/mp4",
    engine: "browser",
    capabilities: { visualizer: true, preview: true },
  },
  webm: {
    format: "webm",
    mime: "video/webm",
    engine: "browser",
    capabilities: { visualizer: true, preview: true },
  },
};

const VIDEO_TARGETS: Record<string, TargetSpec> = {
  mp4: { format: "mp4", mime: "video/mp4", engine: "server", capabilities: { resize: true, preview: true } },
  webm: {
    format: "webm",
    mime: "video/webm",
    engine: "server",
    capabilities: { resize: true, preview: true },
  },
  mov: {
    format: "mov",
    mime: "video/quicktime",
    engine: "server",
    capabilities: { resize: true, preview: true },
  },
  mkv: {
    format: "mkv",
    mime: "video/x-matroska",
    engine: "server",
    capabilities: { resize: true, preview: true },
  },
  avi: {
    format: "avi",
    mime: "video/x-msvideo",
    engine: "server",
    capabilities: { resize: true, preview: true },
  },
  gif: { format: "gif", mime: "image/gif", engine: "server", capabilities: { resize: true, preview: true } },
  // video -> audio extraction
  mp3: {
    format: "mp3",
    mime: "audio/mpeg",
    engine: "server",
    capabilities: { audioExtract: true, quality: true, preview: true },
  },
  wav: {
    format: "wav",
    mime: "audio/wav",
    engine: "server",
    capabilities: { audioExtract: true, preview: true },
  },
  ogg: {
    format: "ogg",
    mime: "audio/ogg",
    engine: "server",
    capabilities: { audioExtract: true, quality: true, preview: true },
  },
  aac: {
    format: "aac",
    mime: "audio/aac",
    engine: "server",
    capabilities: { audioExtract: true, quality: true, preview: true },
  },
  flac: {
    format: "flac",
    mime: "audio/flac",
    engine: "server",
    capabilities: { audioExtract: true, preview: true },
  },
  m4a: {
    format: "m4a",
    mime: "audio/mp4",
    engine: "server",
    capabilities: { audioExtract: true, quality: true, preview: true },
  },
};

const DATA_TARGETS: Record<string, TargetSpec> = {
  json: { format: "json", mime: "application/json", engine: "browser", capabilities: { preview: true } },
  csv: { format: "csv", mime: "text/csv", engine: "browser", capabilities: { preview: true } },
  tsv: {
    format: "tsv",
    mime: "text/tab-separated-values",
    engine: "browser",
    capabilities: { preview: true },
  },
  xml: { format: "xml", mime: "application/xml", engine: "browser", capabilities: { preview: true } },
  yaml: { format: "yaml", mime: "text/yaml", engine: "browser", capabilities: { preview: true } },
};

// No real PDF engine is integrated; only text<->html/md round-trips are honest.
const DOCUMENT_TARGETS: Record<string, TargetSpec> = {
  txt: { format: "txt", mime: "text/plain", engine: "browser", capabilities: { preview: true } },
  md: { format: "md", mime: "text/markdown", engine: "browser", capabilities: { preview: true } },
  html: { format: "html", mime: "text/html", engine: "browser", capabilities: { preview: true } },
};

export const CONVERSION_REGISTRY: Record<FileCategory, CategorySpec> = {
  image: {
    category: "image",
    sourceFormats: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "svg", "avif"],
    targets: IMAGE_TARGETS,
    defaultTarget: (source) =>
      source === "png" ? "jpg" : source === "jpg" || source === "jpeg" ? "webp" : "png",
  },
  audio: {
    category: "audio",
    sourceFormats: ["mp3", "wav", "ogg", "aac", "m4a", "flac", "weba"],
    targets: AUDIO_TARGETS,
    defaultTarget: (source) => (source === "wav" ? "mp3" : "wav"),
  },
  video: {
    category: "video",
    sourceFormats: ["mp4", "webm", "mov", "avi", "mkv", "flv"],
    targets: VIDEO_TARGETS,
    defaultTarget: (source) => (source === "mp4" ? "webm" : "mp4"),
  },
  data: {
    category: "data",
    sourceFormats: ["json", "csv", "tsv", "xml", "yaml", "yml"],
    targets: DATA_TARGETS,
    defaultTarget: (source) => (source === "json" ? "csv" : "json"),
  },
  document: {
    category: "document",
    // No PDF parser is integrated; only text-based sources are honest here.
    sourceFormats: ["txt", "md", "html", "htm"],
    targets: DOCUMENT_TARGETS,
    defaultTarget: (source) =>
      source === "md" ? "html" : source === "html" || source === "htm" ? "md" : "html",
  },
};

export type ConversionPlan =
  | { supported: true; category: FileCategory; target: TargetSpec }
  | { supported: false; category: FileCategory; reason: string };

/** Resolve whether category -> target is a real, supported conversion. */
export function planConversion(category: FileCategory, targetFormat: string): ConversionPlan {
  const spec = CONVERSION_REGISTRY[category];
  if (!spec) return { supported: false, category, reason: `Unknown category: ${category}` };
  const target = spec.targets[targetFormat?.toLowerCase()];
  if (!target) {
    return {
      supported: false,
      category,
      reason: `No ${targetFormat || "target"} conversion is supported for ${category} files`,
    };
  }
  return { supported: true, category, target };
}

/** All target formats for a category, in a stable order. */
export function getAvailableTargets(category: FileCategory): string[] {
  return Object.keys(CONVERSION_REGISTRY[category]?.targets ?? {});
}

/** MIME type for a target format within a category (or null). */
export function getMimeForTarget(category: FileCategory, targetFormat: string): string | null {
  return CONVERSION_REGISTRY[category]?.targets[targetFormat?.toLowerCase()]?.mime ?? null;
}

/** True when a conversion must run on the server (ffmpeg) rather than in-browser. */
export function needsServerEngine(category: FileCategory, targetFormat: string): boolean {
  return CONVERSION_REGISTRY[category]?.targets[targetFormat?.toLowerCase()]?.engine === "server";
}
