import React, { useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, FileText, Image, Music, Video, Database } from "lucide-react";
import { useDialogFocus } from "../hooks/useDialogFocus";

interface FormatGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FormatGuide: React.FC<FormatGuideProps> = ({ isOpen, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, dialogRef, onClose);
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="format-guide-title"
            tabIndex={-1}
            className="relative z-10 w-full max-w-3xl bg-slate-900 text-white rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] border border-white/15 overflow-hidden glass-card flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 id="format-guide-title" className="text-sm font-black text-white">
                  Format Selection Guide &amp; Cheat Sheet
                </h3>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
              {/* Images Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                  <Image className="w-4 h-4 text-blue-400" /> Image Formats
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-blue-400 block text-xs">.WEBP / .AVIF</span>
                    <p className="text-slate-300 leading-relaxed">
                      Best for modern web performance. High compression with lossless alpha transparency and
                      ultra-small file sizes.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-indigo-400 block text-xs">.PNG</span>
                    <p className="text-slate-300 leading-relaxed">
                      Best for graphics, logos, screenshots, and artwork requiring crisp lines and true
                      transparent backgrounds.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-amber-400 block text-xs">.JPG / .JPEG</span>
                    <p className="text-slate-300 leading-relaxed">
                      Best for photography and real-world complex images where small file size is required.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-rose-400 block text-xs">.GIF / .BMP</span>
                    <p className="text-slate-300 leading-relaxed">
                      .GIF is 256-colour palette output (and the video-clip animation target). .BMP is
                      uncompressed lossless pixel data. Both are produced by the server engine.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-emerald-400 block text-xs">.ICO / .SVG</span>
                    <p className="text-slate-300 leading-relaxed">
                      .ICO is standard for web favicons (32x32px). .SVG is accepted as a vector source and
                      rendered at the size you choose; converting <em>to</em> .SVG wraps a raster image in SVG
                      markup, so it does not create scalable vector output.
                    </p>
                  </div>
                </div>
              </div>

              {/* Audio Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                  <Music className="w-4 h-4 text-purple-400" /> Audio Formats
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-purple-400 block text-xs">.MP3</span>
                    <p className="text-slate-300 leading-relaxed">
                      Universal audio format supported on all devices, phones, and media players. Compact file
                      size.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-pink-400 block text-xs">.WAV</span>
                    <p className="text-slate-300 leading-relaxed">
                      Uncompressed studio quality PCM audio. Ideal for audio editing, production, and
                      high-fidelity sound.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-purple-400 block text-xs">.OGG / .AAC</span>
                    <p className="text-slate-300 leading-relaxed">
                      .OGG (Vorbis) and .AAC are efficient lossy formats for streaming and smaller downloads,
                      both encoded by the server engine.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-pink-400 block text-xs">.M4A / .FLAC</span>
                    <p className="text-slate-300 leading-relaxed">
                      .M4A wraps AAC audio for Apple devices; .FLAC is lossless compression for archiving
                      without giving up quality.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-slate-200 block text-xs">.WEBA / .WEBM sources</span>
                    <p className="text-slate-300 leading-relaxed">
                      Audio-only WebM uploads arrive as WebM containers; they are accepted as sources and
                      converted like any other audio file.
                    </p>
                  </div>
                </div>
              </div>

              {/* Video Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                  <Video className="w-4 h-4 text-rose-400" /> Video Formats
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-rose-400 block text-xs">.MP4 / .MOV</span>
                    <p className="text-slate-300 leading-relaxed">
                      .MP4 (H.264 + AAC, fast-start for web playback) and .MOV for Apple ecosystems. The
                      universal choice for sharing and editing.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-rose-400 block text-xs">.WEBM / .MKV</span>
                    <p className="text-slate-300 leading-relaxed">
                      .WEBM pairs VP9 video with Opus audio for open-format browsers; .MKV (Matroska) is a
                      flexible container for archiving and remuxing.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-slate-200 block text-xs">.AVI / .FLV sources</span>
                    <p className="text-slate-300 leading-relaxed">
                      Legacy .AVI and .FLV files are accepted as sources (MPEG-4 + MP3 / Flash-era uploads)
                      and converted into a modern container. .FLV is a source only.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-amber-400 block text-xs">.GIF clips</span>
                    <p className="text-slate-300 leading-relaxed">
                      Turn a video clip into an animated GIF with a generated colour palette. Best for short,
                      silent loops — GIF carries no audio.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-purple-400 block text-xs">
                      Extract .MP3 / .WAV / .OGG / .AAC / .FLAC / .M4A
                    </span>
                    <p className="text-slate-300 leading-relaxed">
                      Pull the audio track out of any video: lossy MP3, OGG, AAC and M4A, or lossless WAV and
                      FLAC. Resolution, fps and mute do not apply to these targets — the video stream is
                      dropped.
                    </p>
                  </div>
                </div>
              </div>

              {/* Document Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-400" /> Document Formats
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-teal-400 block text-xs">.MD → .HTML</span>
                    <p className="text-slate-300 leading-relaxed">
                      Markdown becomes a standalone .HTML page: headings, bold/italic and links are rendered,
                      output is HTML-escaped, and link targets are limited to http, https and mailto.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-teal-400 block text-xs">.HTML / .TXT sources</span>
                    <p className="text-slate-300 leading-relaxed">
                      HTML (and .HTM) sources are stripped of markup and converted to plain .TXT. HTML →
                      Markdown is deliberately not offered: no HTML parser is integrated, so passing markup
                      through as Markdown would misrepresent the result.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-slate-200 block text-xs">No PDF, either way</span>
                    <p className="text-slate-300 leading-relaxed">
                      PDF is neither a source nor a target — no PDF engine is integrated. Convert to .TXT, .MD
                      or .HTML instead.
                    </p>
                  </div>
                </div>
              </div>

              {/* Data Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-400" /> Data & Code Formats
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-amber-400 block text-xs">.JSON ↔ .CSV</span>
                    <p className="text-slate-300 leading-relaxed">
                      Convert tabular JSON arrays into CSV spreadsheets for Excel/Google Sheets, or vice
                      versa.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-teal-400 block text-xs">.TSV ↔ .JSON / .CSV</span>
                    <p className="text-slate-300 leading-relaxed">
                      Tab-separated tables run through the same engine as CSV, so .TSV converts to and from
                      JSON, CSV, XML and YAML.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-white/10 bg-white/5 space-y-1">
                    <span className="font-black text-teal-400 block text-xs">.YAML / .XML (output only)</span>
                    <p className="text-slate-300 leading-relaxed">
                      Generated from parsed JSON, CSV or TSV for system configurations and enterprise data
                      exchange. They are output-only here: no XML/YAML parser is integrated, so they cannot be
                      used as sources.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 bg-slate-900/80 flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 shadow-md cursor-pointer transition-all"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
