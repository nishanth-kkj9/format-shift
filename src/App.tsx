import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCategory,
  TargetFormat,
  ConversionItem,
  ConversionHistoryItem,
} from './types';
import {
  detectCategoryAndFormats,
  convertImage,
  convertAudio,
  convertVideo,
  convertDataDocument,
  formatBytes,
} from './utils/converter';
import { extractFileMetadata } from './utils/metadata';
import { convertServerSide, needsServerConversion } from './utils/serverConvert';

import { Header } from './components/Header';
import { Dropzone } from './components/Dropzone';
import { FileList } from './components/FileList';
import { BatchBar } from './components/BatchBar';
import { ConversionOptionsModal } from './components/ConversionOptionsModal';
import { PreviewModal } from './components/PreviewModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { CodeSnippetModal } from './components/CodeSnippetModal';
import { FormatGuide } from './components/FormatGuide';
import { FORMAT_OPTIONS } from './components/FormatDropdown';
import { Sparkles, RefreshCw, Zap, ShieldCheck, HeartHandshake } from 'lucide-react';

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<FileCategory | 'all'>('all');
  
  // File Queue
  const [queue, setQueue] = useState<ConversionItem[]>([]);
  
  // History
  const [history, setHistory] = useState<ConversionHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('formatshift_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modals
  const [optionsItem, setOptionsItem] = useState<ConversionItem | null>(null);
  const [previewItem, setPreviewItem] = useState<ConversionItem | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isFormatGuideOpen, setIsFormatGuideOpen] = useState(false);

  // Sync theme class to <html> tag
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  // Sync history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('formatshift_history', JSON.stringify(history));
    } catch {
      // ignore quota error
    }
  }, [history]);

  // Add Files to Queue with Auto-Detection & Async Metadata Extraction
  const handleFilesAdded = (files: File[]) => {
    const newItems: ConversionItem[] = files.map((file) => {
      const { category, sourceFormat, defaultTargetFormat } = detectCategoryAndFormats(file);

      const newItem: ConversionItem = {
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        originalSize: file.size,
        originalExtension: sourceFormat,
        category,
        targetFormat: defaultTargetFormat,
        status: 'idle',
        progress: 0,
        options: {
          image: {
            quality: 85,
            maintainAspectRatio: true,
            bgColor: '#ffffff',
            grayscale: false,
            rotation: 0,
            flipHorizontal: false,
            flipVertical: false,
          },
          audio: {
            bitrate: '192k',
            sampleRate: 44100,
            channels: 2,
            volume: 100,
          },
          video: {
            resolution: 'original',
            fps: 30,
            muteAudio: false,
          },
          data: {
            delimiter: ',',
            prettyPrint: true,
            indentSpaces: 2,
          },
        },
      };

      // Asynchronously extract metadata (preview image, duration, dimensions)
      extractFileMetadata(file).then((meta) => {
        setQueue((prev) =>
          prev.map((item) =>
            item.id === newItem.id
              ? {
                  ...item,
                  previewUrl: meta.previewUrl,
                  dimensions: meta.dimensions,
                  duration: meta.duration,
                  lineCount: meta.lineCount,
                }
              : item
          )
        );
      });

      return newItem;
    });

    setQueue((prev) => [...prev, ...newItems]);
  };

  // Target Format Change per item
  const handleTargetFormatChange = (id: string, newTarget: TargetFormat) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, targetFormat: newTarget } : item))
    );
  };

  // Global Target Format apply
  const handleApplyGlobalFormat = (format: TargetFormat) => {
    setQueue((prev) =>
      prev.map((item) =>
        FORMAT_OPTIONS[item.category].some((o) => o.format === format)
          ? { ...item, targetFormat: format }
          : item
      )
    );
  };

  // Update Conversion Options for single item
  const handleSaveOptions = (itemId: string, updatedOptions: ConversionItem['options']) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        // Spectrum visualizer outputs a video — force a video target so routing + extension match.
        const isSpectrum = item.category === 'audio' && updatedOptions.audio?.spectrumVisualizer;
        const targetFormat =
          isSpectrum && item.targetFormat !== 'webm' ? 'mp4' : item.targetFormat;
        return { ...item, options: updatedOptions, targetFormat };
      })
    );
  };

  // Convert Single File
  const convertSingleFile = async (id: string) => {
    const item = queue.find((q) => q.id === id);
    if (!item) return;

    // Create abort controller for this conversion
    const abortController = new AbortController();

    // Update state to converting
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'converting', progress: 5 } : q))
    );

    let resultBlob: Blob;
    let dimensions: { width: number; height: number } | undefined;
    let duration: number | undefined;

    const updateProgress = (pct: number) => {
      setQueue((prev) =>
        prev.map((q) => (q.id === id ? { ...q, progress: pct } : q))
      );
    };

    // Listen for abort signal to update status if conversion is cancelled
    const handleAbort = () => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id
            ? { ...q, status: 'error', errorMessage: 'Conversion cancelled', progress: 0 }
            : q
        )
      );
    };

    abortController.signal.addEventListener('abort', handleAbort);

    try {

      // Spectrum visualizer always produces a video, regardless of the queued target.
      const effectiveTarget: TargetFormat =
        item.category === 'audio' && item.options.audio?.spectrumVisualizer && item.targetFormat !== 'webm'
          ? 'mp4'
          : item.targetFormat;

      if (needsServerConversion(item.category, effectiveTarget)) {
        updateProgress(30);
        resultBlob = await convertServerSide(
          item.file,
          item.category,
          item.originalExtension,
          effectiveTarget,
          item.options,
          abortController.signal
        );
        updateProgress(100);
      } else if (item.category === 'image') {
        const res = await convertImage(item.file, item.targetFormat, item.options.image!, updateProgress);
        resultBlob = res.blob;
        dimensions = res.dimensions;
      } else if (item.category === 'audio') {
        const res = await convertAudio(item.file, effectiveTarget, item.options.audio!, updateProgress, abortController.signal);
        resultBlob = res.blob;
        duration = res.duration;
      } else if (item.category === 'video') {
        const res = await convertVideo(item.file, item.targetFormat, item.options.video!, updateProgress, abortController.signal);
        resultBlob = res.blob;
        dimensions = res.dimensions;
        duration = res.duration;
      } else {
        const res = await convertDataDocument(item.file, item.targetFormat, item.options.data, updateProgress);
        resultBlob = res.blob;
      }

      const convertedUrl = URL.createObjectURL(resultBlob);
      const nameWithoutExt = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
      const extFromMime = (t: string) =>
        t === 'video/webm' ? 'webm' :
        t === 'video/mp4' ? 'mp4' :
        t === 'image/gif' ? 'gif' :
        t === 'image/avif' ? 'avif' :
        t === 'image/webp' ? 'webp' :
        t === 'image/png' ? 'png' :
        t === 'image/jpeg' ? 'jpg' : null;
      const actualExt = extFromMime(resultBlob.type) || effectiveTarget;
      const convertedName = `${nameWithoutExt}_converted.${actualExt}`;

      // Update item in queue as completed
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                status: 'completed',
                progress: 100,
                convertedBlob: resultBlob,
                convertedUrl,
                convertedSize: resultBlob.size,
                convertedName,
                dimensions,
                duration,
              }
            : q
        )
      );

      // Add to history
      const historyEntry: ConversionHistoryItem = {
        id: Math.random().toString(36).substring(2, 9),
        originalName: item.name,
        convertedName,
        category: item.category,
        sourceFormat: item.originalExtension,
        targetFormat: effectiveTarget,
        originalSize: item.originalSize,
        convertedSize: resultBlob.size,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        downloadUrl: convertedUrl,
      };

      setHistory((prev) => [historyEntry, ...prev]);

    } catch (err: unknown) {
      // Ignore abort errors as they're handled separately
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Already handled by the abort event listener
        return;
      }
      
      const errorMsg = err instanceof Error ? err.message : 'Conversion failed';
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, status: 'error', errorMessage: errorMsg, progress: 0 } : q
        )
      );
    } finally {
      // Clean up abort controller event listener
      abortController.signal.removeEventListener('abort', handleAbort);
    }
  };

  // Convert All Pending Files
  const handleConvertAll = async () => {
    const pendingItems = queue.filter((item) => item.status !== 'completed');
    for (const item of pendingItems) {
      await convertSingleFile(item.id);
    }

    // Trigger celebratory confetti on batch completion!
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }
  };

  // Download Single File
  const handleDownloadSingle = (item: ConversionItem) => {
    if (!item.convertedUrl || !item.convertedName) return;
    const a = document.createElement('a');
    a.href = item.convertedUrl;
    a.download = item.convertedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download All as ZIP
  const handleDownloadZip = async () => {
    const completedItems = queue.filter((item) => item.status === 'completed' && item.convertedBlob);
    if (completedItems.length === 0) return;

    const zip = new JSZip();
    completedItems.forEach((item) => {
      if (item.convertedBlob && item.convertedName) {
        zip.file(item.convertedName, item.convertedBlob);
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(content);

    const a = document.createElement('a');
    a.href = zipUrl;
    a.download = `formatshift_converted_files.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Remove single item from queue
  const handleRemove = (id: string) => {
    setQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      // Only revoke convertedUrl if it's not referenced in history
      if (item?.convertedUrl && !history.some((h) => h.downloadUrl === item.convertedUrl)) {
        URL.revokeObjectURL(item.convertedUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  // Clear All Queue
  const handleClearAll = () => {
    setQueue((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
  };

  const filteredQueue = selectedCategory === 'all'
    ? queue
    : queue.filter((item) => item.category === selectedCategory);

  const isConvertingAny = queue.some((i) => i.status === 'converting');

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 relative overflow-x-hidden ${
      isDark ? 'bg-[#0b1120] text-slate-100' : 'bg-slate-950 text-slate-100'
    }`}>
      
      {/* Mesh Background & Ambient Floating Glowing Orbs */}
      <div className="mesh-bg">
        <div className="orb-1" />
        <div className="orb-2" />
      </div>
      
      {/* Top Header */}
      <Header
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenCodeModal={() => setIsCodeModalOpen(true)}
        onOpenFormatGuide={() => setIsFormatGuideOpen(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        historyCount={history.length}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Hero Banner */}
        <motion.section 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center space-y-3 max-w-3xl mx-auto pt-2"
        >
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold glass-card text-indigo-300 border-indigo-400/30 shadow-lg cursor-default"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>Universal In-Browser & Server Format Engine</span>
          </motion.div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white accent-glow leading-tight">
            Convert <span className="text-indigo-400">Every Format</span> into Selected Format
          </h2>

          <p className="text-sm sm:text-base text-slate-300/80 leading-relaxed">
            Instant conversion for PNG, JPG, WEBP, SVG, MP3, WAV, MP4, WEBM, GIF, JSON, CSV, and Documents. Fast, private, and powered by client-side HTML5 & Node.js engines.
          </p>
        </motion.section>

        {/* Dropzone Component */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Dropzone
            onFilesAdded={handleFilesAdded}
            selectedCategory={selectedCategory}
            onBatchTargetChange={handleApplyGlobalFormat}
          />
        </motion.div>

        {/* File Queue List */}
        <AnimatePresence mode="popLayout">
          {queue.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
            >
              <FileList
                items={filteredQueue}
                onTargetFormatChange={handleTargetFormatChange}
                onOpenOptions={(item) => setOptionsItem(item)}
                onConvertSingle={convertSingleFile}
                onPreview={(item) => setPreviewItem(item)}
                onDownload={handleDownloadSingle}
                onRemove={handleRemove}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Key Features Feature Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 border-t border-white/10">
          <motion.div 
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="p-5 rounded-2xl glass-card space-y-2 border-white/15"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold border border-blue-400/30">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Lightning Speed</h3>
            <p className="text-xs text-slate-300/70 leading-relaxed">
              Files convert directly in your browser using HTML5 Canvas, Web Audio API, and Web Media Encoders. Zero queue waiting times!
            </p>
          </motion.div>

          <motion.div 
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="p-5 rounded-2xl glass-card space-y-2 border-white/15"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold border border-emerald-400/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">100% Private & Secure</h3>
            <p className="text-xs text-slate-300/70 leading-relaxed">
              Your files stay on your device or process securely in isolated server containers without permanent remote storage logs.
            </p>
          </motion.div>

          <motion.div 
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="p-5 rounded-2xl glass-card space-y-2 border-white/15"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold border border-purple-400/30">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Multi-Language Code</h3>
            <p className="text-xs text-slate-300/70 leading-relaxed">
              Need to convert programmatically? Get ready-to-run Python (`Pillow`/`pydub`), Node.js (`sharp`/`ffmpeg`), and HTML5 JavaScript code snippets!
            </p>
          </motion.div>
        </section>

      </main>

      {/* Floating Batch Control Bar */}
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 25 }}
          >
            <BatchBar
              items={queue}
              onConvertAll={handleConvertAll}
              onDownloadZip={handleDownloadZip}
              onClearAll={handleClearAll}
              onApplyGlobalFormat={handleApplyGlobalFormat}
              isConvertingAny={isConvertingAny}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals & Drawers */}
      {optionsItem && (
        <ConversionOptionsModal
          item={optionsItem}
          isOpen={!!optionsItem}
          onClose={() => setOptionsItem(null)}
          onSaveOptions={handleSaveOptions}
        />
      )}

      {previewItem && (
        <PreviewModal
          item={previewItem}
          isOpen={!!previewItem}
          onClose={() => setPreviewItem(null)}
          onDownload={handleDownloadSingle}
        />
      )}

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onClearHistory={() => setHistory([])}
      />

      <CodeSnippetModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        category={queue[0]?.category || 'image'}
        sourceFormat={queue[0]?.originalExtension || 'png'}
        targetFormat={queue[0]?.targetFormat || 'jpg'}
      />

      <FormatGuide
        isOpen={isFormatGuideOpen}
        onClose={() => setIsFormatGuideOpen(false)}
      />

      {/* Footer */}
      <footer className="relative z-10 mt-auto py-6 border-t border-white/10 text-center text-xs text-slate-400">
        <p>FormatShift Universal File Converter • Built with React, TypeScript, Node.js & HTML5</p>
      </footer>

    </div>
  );
}
