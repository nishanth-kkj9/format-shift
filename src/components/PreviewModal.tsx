import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Eye, Download, ArrowRight, Music, Film, FileCode } from 'lucide-react';
import { ConversionItem } from '../types';
import { formatBytes } from '../utils/converter';

interface PreviewModalProps {
  item: ConversionItem | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (item: ConversionItem) => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  item,
  isOpen,
  onClose,
  onDownload,
}) => {
  const [sliderPos, setSliderPos] = useState(50);
  const [convertedText, setConvertedText] = useState<string>('');

  const originalUrl = useMemo(
    () => item?.previewUrl || (item ? URL.createObjectURL(item.file) : ''),
    [item?.previewUrl, item?.file]
  );
  const convertedUrl = item?.convertedUrl || '';

  // Clean up object URLs when component unmounts or item changes
  useEffect(() => {
    return () => {
      // Only revoke the URL we created ourselves (when previewUrl is undefined)
      if (item?.previewUrl === undefined && item?.file) {
        URL.revokeObjectURL(originalUrl);
      }
      // Do NOT revoke convertedUrl — it's owned by App.tsx and used by history
    };
  }, [item, originalUrl]);

  // Read the converted blob text for data/document previews
  useEffect(() => {
    if (item && (item.category === 'data' || item.category === 'document') && item.convertedBlob) {
      item.convertedBlob.text().then(setConvertedText).catch(() => setConvertedText(''));
    } else {
      setConvertedText('');
    }
  }, [item?.category, item?.convertedBlob]);

  if (!item) return null;

  const sizeDiff = item.convertedSize ? item.convertedSize - item.originalSize : 0;
  const pctSaved = item.convertedSize
    ? Math.round(((item.originalSize - item.convertedSize) / item.originalSize) * 100)
    : 0;

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
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="relative z-10 w-full max-w-4xl bg-slate-900 text-white rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] border border-white/15 overflow-hidden glass-card flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <span className="truncate max-w-[200px]">{item.name}</span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                    <span className="text-indigo-400 font-black uppercase">
                      {item.targetFormat}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Live Quality & Format Comparison
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Comparison Stats Bar */}
            <div className="grid grid-cols-3 gap-4 px-6 py-3 bg-slate-950/60 border-b border-white/10 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Original File</span>
                <span className="font-bold text-white">
                  {formatBytes(item.originalSize)} ({item.originalExtension.toUpperCase()})
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Converted File</span>
                <span className="font-bold text-emerald-400">
                  {item.convertedSize ? formatBytes(item.convertedSize) : 'N/A'} ({item.targetFormat.toUpperCase()})
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Size Delta / Savings</span>
                <span className={`font-bold ${pctSaved > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {pctSaved > 0 ? `Saved ${pctSaved}% (${formatBytes(Math.abs(sizeDiff))})` : `${pctSaved}% difference`}
                </span>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col items-center justify-center min-h-[300px]">
              
              {/* IMAGE COMPARISON (Interactive Split Slider) */}
              {item.category === 'image' && (
                <div className="w-full flex flex-col items-center">
                  <div className="relative w-full max-w-2xl h-[360px] rounded-2xl overflow-hidden border border-white/15 bg-checkered select-none shadow-2xl">
                    
                    {/* Converted Image (Base Layer) */}
                    <img
                      src={convertedUrl || originalUrl}
                      alt="Converted Result"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />

                    {/* Original Image (Clipped Layer on Top) */}
                    <div
                      className="absolute inset-0 overflow-hidden"
                      style={{ width: `${sliderPos}%` }}
                    >
                      <img
                        src={originalUrl}
                        alt="Original Source"
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none max-w-none"
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>

                    {/* Vertical Divider Handle */}
                    <div
                      className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)] cursor-ew-resize z-20 flex items-center justify-center"
                      style={{ left: `${sliderPos}%` }}
                    >
                      <div className="w-7 h-7 rounded-full bg-white text-indigo-600 shadow-lg flex items-center justify-center text-[10px] font-black border border-indigo-200">
                        ↔
                      </div>
                    </div>

                    {/* Range Input Driver for Slider */}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sliderPos}
                      onChange={(e) => setSliderPos(parseInt(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
                    />

                    {/* Corner Labels */}
                    <span className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-black/70 text-white backdrop-blur-md border border-white/10">
                      BEFORE ({item.originalExtension.toUpperCase()})
                    </span>
                    <span className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-600/90 text-white backdrop-blur-md border border-white/10">
                      AFTER ({item.targetFormat.toUpperCase()})
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mt-3 font-medium">
                    Drag slider left and right to inspect image compression quality and detail preservation.
                  </p>
                </div>
              )}

              {/* AUDIO PLAYER COMPARISON */}
              {item.category === 'audio' && (
                <div className="w-full max-w-md space-y-5">
                  <div className="p-4 rounded-2xl border border-white/10 bg-white/5 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <Music className="w-4 h-4 text-indigo-400" />
                      <span>Original Audio Track ({item.originalExtension.toUpperCase()})</span>
                    </div>
                    <audio controls src={originalUrl} className="w-full h-10 rounded-xl" />
                  </div>

                  {convertedUrl && (
                    <div className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                        <Music className="w-4 h-4 text-indigo-400" />
                        <span>Converted Audio Output ({item.targetFormat.toUpperCase()})</span>
                      </div>
                      {item.options.audio?.spectrumVisualizer ? (
                        <video controls src={convertedUrl} className="w-full rounded-xl" />
                      ) : (
                        <audio controls src={convertedUrl} className="w-full h-10 rounded-xl" />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* VIDEO PLAYER COMPARISON */}
              {item.category === 'video' && (
                <div className="w-full max-w-xl space-y-4">
                  <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-black">
                    <video
                      controls
                      src={convertedUrl || originalUrl}
                      className="w-full max-h-[350px] object-contain"
                    />
                  </div>
                  <p className="text-xs text-slate-400 text-center font-medium">
                    <Film className="w-3.5 h-3.5 inline mr-1 text-indigo-400" /> Previewing converted video stream
                  </p>
                </div>
              )}

              {/* DATA / DOCUMENT CODE PREVIEW */}
              {(item.category === 'data' || item.category === 'document') && (
                <div className="w-full space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <FileCode className="w-4 h-4 text-emerald-400" /> Converted Output Snippet
                  </div>
                  <div className="p-4 rounded-2xl border border-white/10 bg-slate-950 font-mono text-xs text-emerald-400 max-h-[300px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {convertedText || (item.convertedBlob ? 'Formatted file output generated successfully.' : 'Processing data payload...')}
                  </div>
                </div>
              )}

            </div>

            {/* Footer with Download Button */}
            <div className="px-6 py-4 border-t border-white/10 bg-slate-900/80 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">Ready to save your file</span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Close
                </button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => onDownload(item)}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4" /> Download Converted File
                </motion.button>
              </div>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
