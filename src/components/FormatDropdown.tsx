import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Image,
  Music,
  Video,
  FileText,
  Database,
  ChevronDown,
  Check,
  Sparkles,
  Code,
  Film,
  Disc,
  FileSpreadsheet,
  FileCode2,
} from 'lucide-react';
import { FileCategory, TargetFormat } from '../types';
import { CONVERSION_REGISTRY, getAvailableTargets } from '../core/conversionRegistry';

interface FormatOption {
  format: TargetFormat;
  label: string;
  badge: string;
  engine: 'browser' | 'server';
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

// UI metadata per (category, format). Format membership itself comes from the
// conversion registry so the dropdown can never advertise a fake conversion.
const FORMAT_META: Record<FileCategory, Record<string, Pick<FormatOption, 'label' | 'badge' | 'icon' | 'description'>>> = {
  image: {
    jpg: { label: 'JPEG / JPG', badge: 'Universal', icon: Image, description: 'Best for standard photos & web' },
    png: { label: 'PNG Image', badge: 'Lossless', icon: Image, description: 'Supports transparent background' },
    webp: { label: 'WEBP Web', badge: 'Web Fast', icon: Sparkles, description: '30% smaller size for web' },
    gif: { label: 'GIF Graphic', badge: 'Animated', icon: Film, description: 'Standard frame animations' },
    svg: { label: 'SVG Vector', badge: 'Scalable', icon: Code, description: 'Vector graphics for web icons' },
    ico: { label: 'ICO Favicon', badge: 'App Icon', icon: Sparkles, description: 'Favicon badge format' },
    avif: { label: 'AVIF Next-Gen', badge: 'Next-Gen', icon: Sparkles, description: 'Ultra compression for web' },
    bmp: { label: 'BMP Bitmap', badge: 'Raw', icon: Image, description: 'Uncompressed raw pixel image' },
  },
  audio: {
    mp3: { label: 'MP3 Audio', badge: 'Universal', icon: Music, description: 'Standard compressed audio' },
    wav: { label: 'WAV Audio', badge: 'Lossless', icon: Disc, description: 'Studio quality uncompressed PCM' },
    ogg: { label: 'OGG Vorbis', badge: 'Open Source', icon: Music, description: 'Optimized open-source media' },
    aac: { label: 'AAC Audio', badge: 'Stream HD', icon: Music, description: 'High efficiency audio stream' },
    m4a: { label: 'M4A Apple', badge: 'Apple AAC', icon: Music, description: 'Container for Apple devices' },
    flac: { label: 'FLAC Hi-Fi', badge: 'Studio', icon: Disc, description: 'Lossless compressed audio' },
    mp4: { label: 'MP4 Spectrum Video', badge: 'Visualizer', icon: Video, description: 'Animated audio spectrum video (MP4)' },
    webm: { label: 'WEBM Spectrum Video', badge: 'Visualizer', icon: Video, description: 'Animated audio spectrum video (WEBM)' },
  },
  video: {
    mp4: { label: 'MP4 Video', badge: 'Universal', icon: Video, description: 'Standard H.264 video file' },
    webm: { label: 'WEBM Video', badge: 'Web HD', icon: Video, description: 'HTML5 web player video' },
    gif: { label: 'GIF Clip', badge: 'No Audio', icon: Film, description: 'Convert video clip to animated GIF' },
    mov: { label: 'QuickTime MOV', badge: 'Apple', icon: Video, description: 'Apple QuickTime container' },
    mkv: { label: 'MKV Video', badge: 'Matroska', icon: Video, description: 'Matroska multimedia container' },
    avi: { label: 'AVI Video', badge: 'Classic', icon: Video, description: 'Classic Audio Video Interleave' },
    mp3: { label: 'Extract MP3', badge: 'Audio Only', icon: Music, description: 'Extract audio track from video' },
    wav: { label: 'Extract WAV', badge: 'Lossless Audio', icon: Disc, description: 'Extract PCM audio from video' },
    ogg: { label: 'Extract OGG', badge: 'Audio Only', icon: Music, description: 'Extract Vorbis audio from video' },
    aac: { label: 'Extract AAC', badge: 'Audio Only', icon: Music, description: 'Extract AAC audio from video' },
  },
  data: {
    csv: { label: 'CSV Table', badge: 'Spreadsheet', icon: FileSpreadsheet, description: 'Comma separated values for Excel' },
    json: { label: 'JSON Data', badge: 'Structured', icon: FileCode2, description: 'Standard JavaScript object data' },
    xml: { label: 'XML Doc', badge: 'Hierarchical', icon: Code, description: 'Extensible markup schema' },
    yaml: { label: 'YAML Config', badge: 'Readable', icon: Code, description: 'Human readable configuration' },
    tsv: { label: 'TSV Tabbed', badge: 'Tab Delimited', icon: Database, description: 'Tab delimited table data' },
  },
  document: {
    txt: { label: 'Plain Text', badge: 'Raw Text', icon: FileText, description: 'Simple UTF-8 plain text file' },
    md: { label: 'Markdown', badge: 'Docs Specs', icon: FileText, description: 'Formatted markdown text' },
    html: { label: 'HTML Page', badge: 'Web Render', icon: Code, description: 'Hypertext webpage document' },
  },
};

export const FORMAT_OPTIONS: Record<FileCategory, FormatOption[]> = Object.fromEntries(
  (Object.keys(CONVERSION_REGISTRY) as FileCategory[]).map((category) => [
    category,
    getAvailableTargets(category).map((format) => {
      const meta = FORMAT_META[category]?.[format];
      const engine = CONVERSION_REGISTRY[category].targets[format].engine;
      return {
        format,
        label: meta?.label ?? format.toUpperCase(),
        badge: meta?.badge ?? (engine === 'server' ? 'FFmpeg' : 'Browser'),
        engine,
        icon: meta?.icon ?? Image,
        description: meta?.description,
      };
    }),
  ])
) as Record<FileCategory, FormatOption[]>;

interface FormatDropdownProps {
  value: TargetFormat;
  onChange: (format: TargetFormat) => void;
  category: FileCategory;
  disabled?: boolean;
}

export const FormatDropdown: React.FC<FormatDropdownProps> = ({
  value,
  onChange,
  category,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUp: boolean; width: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const options = FORMAT_OPTIONS[category] || FORMAT_OPTIONS.image;
  const selectedOption = options.find((o) => o.format === value) || options[0];
  const SelectedIcon = selectedOption.icon;

  // Close on outside click - checks both the trigger and the portaled menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = dropdownRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);
      if (!clickedTrigger && !clickedMenu) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute viewport-anchored position whenever the menu opens, and keep it
  // pinned on scroll/resize instead of relying on a CSS `absolute` ancestor.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const menuHeight = 300; // approx max-h-72 (18rem=288px) + header
      const menuWidth = 256; // w-64
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight && rect.top > menuHeight;

      let left = rect.left;
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) left = 8;

      setMenuPos({
        top: openUp ? rect.top - 8 : rect.bottom + 8,
        left,
        openUp,
        width: menuWidth,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="px-3.5 py-1.5 rounded-xl text-xs font-bold glass-input text-white border border-white/15 hover:border-indigo-400/50 hover:bg-white/10 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md group"
      >
        <div className="w-5 h-5 rounded-md bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
          <SelectedIcon className="w-3.5 h-3.5" />
        </div>
        <span className="uppercase tracking-wider font-extrabold">{value}</span>
        <span className="hidden sm:inline text-[10px] text-slate-400 font-medium font-mono">
          .{selectedOption.format}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-400' : 'group-hover:text-white'}`} />
      </button>

      {/* Floating Popover Menu - portaled to <body> and positioned in fixed
          viewport coordinates, so it can never get trapped inside a parent's
          stacking context or overlap unrelated page sections below it. */}
      {isOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.openUp ? undefined : menuPos.top,
            bottom: menuPos.openUp ? window.innerHeight - menuPos.top : undefined,
            left: menuPos.left,
            width: menuPos.width,
          }}
          className="rounded-2xl glass-card backdrop-blur-2xl bg-slate-900/95 border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[999] p-2 space-y-1 animate-fade-in max-h-72 overflow-y-auto no-scrollbar"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 border-b border-white/10 flex items-center justify-between">
            <span>Select Output Format</span>
            <span className="text-indigo-400 font-mono">{category.toUpperCase()}</span>
          </div>

          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = opt.format === value;

            return (
              <button
                key={opt.format}
                type="button"
                onClick={() => {
                  onChange(opt.format);
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-2 rounded-xl text-left transition-all flex items-center justify-between group ${
                  isSelected
                    ? 'bg-indigo-500/20 text-white border border-indigo-400/40 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white/10 text-slate-300 group-hover:bg-indigo-500/20 group-hover:text-indigo-300'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate">{opt.label}</span>
                    </div>
                    {opt.description && (
                      <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
                        {opt.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    isSelected
                      ? 'bg-indigo-400/20 text-indigo-300 border border-indigo-400/30'
                      : 'bg-white/5 text-slate-400 group-hover:text-slate-200'
                  }`}>
                    {opt.badge}
                  </span>
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                    opt.engine === 'server'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                  }`}>
                    {opt.engine === 'server' ? 'FFmpeg' : 'Browser'}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </div>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
};
