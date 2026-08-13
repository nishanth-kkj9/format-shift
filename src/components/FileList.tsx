import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  File,
  Image as ImageIcon,
  Music,
  Video,
  Database,
  FileText,
  Sliders,
  Play,
  Download,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Maximize2,
  FileCode,
} from 'lucide-react';
import { ConversionItem, TargetFormat } from '../types';
import { formatBytes } from '../utils/converter';
import { formatDuration } from '../utils/metadata';
import { FormatDropdown } from './FormatDropdown';

interface FileListProps {
  items: ConversionItem[];
  onTargetFormatChange: (id: string, format: TargetFormat) => void;
  onOpenOptions: (item: ConversionItem) => void;
  onConvertSingle: (id: string) => void;
  onPreview: (item: ConversionItem) => void;
  onDownload: (item: ConversionItem) => void;
  onRemove: (id: string) => void;
}

export const FileList: React.FC<FileListProps> = ({
  items,
  onTargetFormatChange,
  onOpenOptions,
  onConvertSingle,
  onPreview,
  onDownload,
  onRemove,
}) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-4 w-full">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span>Conversion Queue</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full glass-input text-indigo-300 font-extrabold border border-white/10">
            {items.length} {items.length === 1 ? 'file' : 'files'}
          </span>
        </h3>
      </div>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {items.map((item) => {
            const isDone = item.status === 'completed';
            const isConverting = item.status === 'converting';
            const isError = item.status === 'error';

            // Category Icon fallback
            let IconComponent = File;
            let badgeBg = 'bg-white/10 text-slate-300 border border-white/10';
            if (item.category === 'image') {
              IconComponent = ImageIcon;
              badgeBg = 'bg-blue-500/20 text-blue-400 border border-blue-400/30';
            } else if (item.category === 'audio') {
              IconComponent = Music;
              badgeBg = 'bg-purple-500/20 text-purple-400 border border-purple-400/30';
            } else if (item.category === 'video') {
              IconComponent = Video;
              badgeBg = 'bg-rose-500/20 text-rose-400 border border-rose-400/30';
            } else if (item.category === 'data') {
              IconComponent = Database;
              badgeBg = 'bg-amber-500/20 text-amber-400 border border-amber-400/30';
            } else if (item.category === 'document') {
              IconComponent = FileText;
              badgeBg = 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30';
            }

            // Size difference calculation
            const pctSaved = item.convertedSize
              ? Math.round(((item.originalSize - item.convertedSize) / item.originalSize) * 100)
              : 0;

            // Dynamic status message helper for visually engaging progress
            let dynamicMessage = 'Ready to convert';
            if (isConverting) {
              if (item.progress < 20) dynamicMessage = 'Reading file stream & decoding...';
              else if (item.progress < 55) dynamicMessage = 'Transforming media buffer & applying pipeline...';
              else if (item.progress < 85) dynamicMessage = 'Encoding into target format stream...';
              else dynamicMessage = 'Finalizing file buffer & optimizing size...';
            } else if (isDone) {
              dynamicMessage = 'Conversion finished successfully!';
            } else if (isError) {
              dynamicMessage = item.errorMessage || 'Conversion failed';
            }

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -30, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                className={`group relative rounded-2xl border transition-colors duration-300 p-4 sm:p-5 glass-card ${
                  isDone
                    ? 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                    : isError
                    ? 'border-rose-500/40 bg-rose-950/20'
                    : 'hover:border-indigo-400/40 shadow-xl'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  
                  {/* Left: Thumbnail Preview & Media Details */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    
                    {/* Thumbnail / Icon Badge */}
                    {item.category === 'image' && item.previewUrl ? (
                      <motion.div 
                        whileHover={{ scale: 1.1, rotate: 2 }}
                        className="w-12 h-12 rounded-xl bg-checkered overflow-hidden border border-white/20 shrink-0 shadow-inner"
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </motion.div>
                    ) : (
                      <motion.div 
                        whileHover={{ scale: 1.1 }}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${badgeBg} shadow-md`}
                      >
                        <IconComponent className="w-6 h-6" />
                      </motion.div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-white truncate max-w-[220px] sm:max-w-xs">
                          {item.name}
                        </h4>
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded uppercase bg-white/10 text-indigo-300 border border-white/10 font-mono">
                          .{item.originalExtension}
                        </span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {item.category.toUpperCase()}
                        </span>
                      </div>

                      {/* Metadata & File Stats */}
                      <div className="flex items-center gap-2.5 mt-1.5 text-xs text-slate-300 flex-wrap">
                        <span className="font-mono text-slate-400">{formatBytes(item.originalSize)}</span>

                        {/* Image Dimensions Metadata */}
                        {item.dimensions && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-slate-300">
                            <Maximize2 className="w-3 h-3 text-blue-400" />
                            {item.dimensions.width}×{item.dimensions.height} px
                          </span>
                        )}

                        {/* Audio/Video Duration Metadata */}
                        {item.duration !== undefined && item.duration > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-slate-300">
                            <Clock className="w-3 h-3 text-amber-400" />
                            {formatDuration(item.duration)}
                          </span>
                        )}

                        {/* Text/Data Line Count Metadata */}
                        {item.lineCount !== undefined && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-slate-300">
                            <FileCode className="w-3 h-3 text-purple-400" />
                            {item.lineCount.toLocaleString()} lines
                          </span>
                        )}

                        {/* Converted result stats pill */}
                        {isDone && item.convertedSize && (
                          <>
                            <span className="text-slate-500">•</span>
                            <span className="flex items-center gap-1 font-bold text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {formatBytes(item.convertedSize)}
                            </span>
                            {pctSaved > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold text-[10px]">
                                Saved {pctSaved}%
                              </span>
                            )}
                          </>
                        )}

                        {/* Error text */}
                        {isError && (
                          <span className="text-rose-400 font-medium flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> {item.errorMessage || 'Conversion failed'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Output Target Format Selector & Action Controls */}
                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-white/10">
                    
                    {/* User-friendly Output Format Selection Dropdown */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-400 hidden lg:inline">Target:</span>
                      <FormatDropdown
                        value={item.targetFormat}
                        onChange={(fmt) => onTargetFormatChange(item.id, fmt)}
                        category={item.category}
                        disabled={isConverting}
                      />

                      {/* Fine-Tuning Gear Options Modal Trigger */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        onClick={() => onOpenOptions(item)}
                        title="Adjust Quality & Fine-Tuning Options"
                        className="p-1.5 rounded-xl border border-white/10 glass-input text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        <Sliders className="w-4 h-4" />
                      </motion.button>
                    </div>

                    {/* Primary Action Buttons */}
                    <div className="flex items-center gap-1.5">
                      
                      {/* Convert Button (when idle) */}
                      {!isDone && !isConverting && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          type="button"
                          onClick={() => onConvertSingle(item.id)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-500 hover:bg-indigo-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> Convert
                        </motion.button>
                      )}

                      {/* Converting Status Spinner */}
                      {isConverting && (
                        <div className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-500/20 text-indigo-300 flex items-center gap-1.5 border border-indigo-400/30">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {item.progress}%
                        </div>
                      )}

                      {/* Download & Preview Buttons (when completed) */}
                      {isDone && (
                        <>
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            type="button"
                            onClick={() => onPreview(item)}
                            title="Preview Before / After Quality"
                            className="p-2 rounded-xl border border-white/10 glass-input text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
                          >
                            <Eye className="w-4 h-4 text-indigo-400" />
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            type="button"
                            onClick={() => onDownload(item)}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> Save
                          </motion.button>
                        </>
                      )}

                      {/* Remove item */}
                      <motion.button
                        whileHover={{ scale: 1.1, color: '#f43f5e' }}
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        onClick={() => onRemove(item.id)}
                        title="Remove from Queue"
                        className="p-2 rounded-xl text-slate-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>

                    </div>

                  </div>
                </div>

                {/* Progress Indicator for Conversion Process */}
                {isConverting && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-3 space-y-1.5 pt-1 border-t border-white/5 overflow-hidden"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-300 font-medium">
                      <span className="flex items-center gap-1.5 text-indigo-300">
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                        {dynamicMessage}
                      </span>
                      <span className="font-mono font-bold text-indigo-400">{item.progress}%</span>
                    </div>

                    <div className="w-full bg-slate-950/80 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/10 shadow-inner">
                      <motion.div
                        className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full shadow-[0_0_12px_rgba(99,102,241,0.6)]"
                        initial={{ width: '0%' }}
                        animate={{ width: `${item.progress}%` }}
                        transition={{ ease: 'easeInOut', duration: 0.2 }}
                      />
                    </div>
                  </motion.div>
                )}

              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
