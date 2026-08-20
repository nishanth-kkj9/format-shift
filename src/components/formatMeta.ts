import type { ComponentType } from "react";
import {
  Image,
  Music,
  Video,
  FileText,
  Database,
  Sparkles,
  Code,
  Film,
  Disc,
  FileSpreadsheet,
  FileCode2,
} from "lucide-react";
import type { FileCategory } from "../types";

export interface FormatMetaEntry {
  label: string;
  badge: string;
  icon: ComponentType<{ className?: string }>;
  description?: string;
}

// UI metadata per (category, format). Format membership itself comes from the
// conversion registry so the dropdown can never advertise a fake conversion.
// Kept in its own module so FormatDropdown.tsx stays component-only (react-refresh)
// and the honesty of the copy can be tested.
export const FORMAT_META: Record<FileCategory, Record<string, FormatMetaEntry>> = {
  image: {
    jpg: {
      label: "JPEG / JPG",
      badge: "Universal",
      icon: Image,
      description: "Best for standard photos & web",
    },
    png: {
      label: "PNG Image",
      badge: "Lossless",
      icon: Image,
      description: "Supports transparent background",
    },
    webp: { label: "WEBP Web", badge: "Web Fast", icon: Sparkles, description: "30% smaller size for web" },
    gif: { label: "GIF Graphic", badge: "Animated", icon: Film, description: "Standard frame animations" },
    svg: {
      label: "SVG Wrapper",
      badge: "Raster Wrapper",
      icon: Code,
      description: "Raster image wrapped in SVG markup",
    },
    ico: { label: "ICO Favicon", badge: "App Icon", icon: Sparkles, description: "Favicon badge format" },
    avif: {
      label: "AVIF Next-Gen",
      badge: "Next-Gen",
      icon: Sparkles,
      description: "Ultra compression for web",
    },
    bmp: { label: "BMP Bitmap", badge: "Raw", icon: Image, description: "Uncompressed raw pixel image" },
  },
  audio: {
    mp3: { label: "MP3 Audio", badge: "Universal", icon: Music, description: "Standard compressed audio" },
    wav: {
      label: "WAV Audio",
      badge: "Lossless",
      icon: Disc,
      description: "Studio quality uncompressed PCM",
    },
    ogg: {
      label: "OGG Vorbis",
      badge: "Open Source",
      icon: Music,
      description: "Optimized open-source media",
    },
    aac: { label: "AAC Audio", badge: "Stream HD", icon: Music, description: "High efficiency audio stream" },
    m4a: { label: "M4A Apple", badge: "Apple AAC", icon: Music, description: "Container for Apple devices" },
    flac: { label: "FLAC Hi-Fi", badge: "Studio", icon: Disc, description: "Lossless compressed audio" },
  },
  video: {
    mp4: { label: "MP4 Video", badge: "Universal", icon: Video, description: "Standard H.264 video file" },
    webm: { label: "WEBM Video", badge: "Web HD", icon: Video, description: "HTML5 web player video" },
    gif: {
      label: "GIF Clip",
      badge: "No Audio",
      icon: Film,
      description: "Convert video clip to animated GIF",
    },
    mov: { label: "QuickTime MOV", badge: "Apple", icon: Video, description: "Apple QuickTime container" },
    mkv: { label: "MKV Video", badge: "Matroska", icon: Video, description: "Matroska multimedia container" },
    avi: { label: "AVI Video", badge: "Classic", icon: Video, description: "Classic Audio Video Interleave" },
    mp3: {
      label: "Extract MP3",
      badge: "Audio Only",
      icon: Music,
      description: "Extract audio track from video",
    },
    wav: {
      label: "Extract WAV",
      badge: "Lossless Audio",
      icon: Disc,
      description: "Extract PCM audio from video",
    },
    ogg: {
      label: "Extract OGG",
      badge: "Audio Only",
      icon: Music,
      description: "Extract Vorbis audio from video",
    },
    aac: {
      label: "Extract AAC",
      badge: "Audio Only",
      icon: Music,
      description: "Extract AAC audio from video",
    },
  },
  data: {
    csv: {
      label: "CSV Table",
      badge: "Spreadsheet",
      icon: FileSpreadsheet,
      description: "Comma separated values for Excel",
    },
    json: {
      label: "JSON Data",
      badge: "Structured",
      icon: FileCode2,
      description: "Standard JavaScript object data",
    },
    xml: { label: "XML Doc", badge: "Hierarchical", icon: Code, description: "Extensible markup schema" },
    yaml: {
      label: "YAML Config",
      badge: "Readable",
      icon: Code,
      description: "Human readable configuration",
    },
    tsv: {
      label: "TSV Tabbed",
      badge: "Tab Delimited",
      icon: Database,
      description: "Tab delimited table data",
    },
  },
  document: {
    txt: {
      label: "Plain Text",
      badge: "Raw Text",
      icon: FileText,
      description: "Simple UTF-8 plain text file",
    },
    md: { label: "Markdown", badge: "Docs Specs", icon: FileText, description: "Formatted markdown text" },
    html: { label: "HTML Page", badge: "Web Render", icon: Code, description: "Hypertext webpage document" },
  },
};
