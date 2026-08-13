import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Upload, Image, Music, Video, Database, Wand2 } from 'lucide-react';
import { FileCategory, TargetFormat } from '../types';
import { generateSampleFile } from '../utils/converter';

interface DropzoneProps {
  onFilesAdded: (files: File[]) => void;
  selectedCategory: FileCategory | 'all';
  onBatchTargetChange?: (format: TargetFormat) => void;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFilesAdded,
  onBatchTargetChange,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onFilesAdded(filesArray);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onFilesAdded(filesArray);
      e.target.value = ''; // Reset input
    }
  };

  const handleAddSample = (category: FileCategory) => {
    const sample = generateSampleFile(category);
    onFilesAdded([sample]);
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInput}
        multiple
        className="hidden"
      />

      {/* Main Drag and Drop Container */}
      <motion.div
        whileHover={{ scale: 1.008 }}
        whileTap={{ scale: 0.99 }}
        animate={{ scale: isDragOver ? 1.03 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative cursor-pointer rounded-3xl border-2 border-dashed transition-colors duration-300 p-8 sm:p-12 text-center group overflow-hidden ${
          isDragOver
            ? 'border-indigo-400 bg-indigo-500/20 shadow-[0_0_40px_rgba(99,102,241,0.4)]'
            : 'border-white/20 glass-card hover:border-indigo-400/60 hover:bg-white/10 shadow-xl'
        }`}
      >
        {/* Subtle background glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
          
          {/* Icon Badge */}
          <motion.div 
            animate={isDragOver ? { y: [-4, 4, -4] } : {}}
            transition={{ repeat: Infinity, duration: 1.2 }}
            className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-indigo-500/30 transition-all duration-300"
          >
            <Upload className="w-8 h-8 animate-bounce-slow" />
          </motion.div>

          {/* Main Headline */}
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Drag & Drop files here, or <span className="text-indigo-400 underline decoration-indigo-400/50 underline-offset-4">browse</span>
            </h2>
            <p className="text-sm text-slate-300/80 max-w-md mx-auto">
              Select any Image, Audio, Video, Document, or Data file. FormatShift will detect and convert it into your target format instantly.
            </p>
          </div>

          {/* Format Badges Pill List */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-400/30">
              <Image className="w-3.5 h-3.5" /> PNG • JPG • WEBP • GIF • SVG • ICO • AVIF
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-400/30">
              <Music className="w-3.5 h-3.5" /> MP3 • WAV • OGG • AAC • FLAC
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-400/30">
              <Video className="w-3.5 h-3.5" /> MP4 • WEBM • MOV • GIF
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-400/30">
              <Database className="w-3.5 h-3.5" /> JSON • CSV • XML • YAML • TSV
            </span>
          </div>

          {/* Quick Select Buttons */}
          <div className="pt-3 flex flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" /> Try with sample files:
            </span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => handleAddSample('image')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 text-slate-200 hover:bg-indigo-500/30 hover:text-indigo-200 border border-white/15 transition-all cursor-pointer"
            >
              🖼️ Sample PNG Image
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => handleAddSample('audio')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 text-slate-200 hover:bg-indigo-500/30 hover:text-indigo-200 border border-white/15 transition-all cursor-pointer"
            >
              🎵 Sample Audio WAV
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={() => handleAddSample('data')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/10 text-slate-200 hover:bg-indigo-500/30 hover:text-indigo-200 border border-white/15 transition-all cursor-pointer"
            >
              📊 Sample JSON Dataset
            </motion.button>
          </div>

        </div>
      </motion.div>
    </div>
  );
};
