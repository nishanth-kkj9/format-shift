import { useState, useEffect, useRef, lazy, Suspense } from "react";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "motion/react";
import { FileCategory, TargetFormat, ConversionItem, ConversionHistoryItem } from "./types";
import {
  detectCategoryAndFormats,
  convertImage,
  convertAudio,
  convertVideo,
  convertDataDocument,
} from "./utils/converter";
import { extractFileMetadata } from "./utils/metadata";
import {
  clearHistoryRevoking,
  historyForStorage,
  hydrateHistory,
  trimHistoryRevoking,
  MAX_HISTORY_ENTRIES,
} from "./utils/historyCleanup";
import { convertServerSide, needsServerConversion } from "./utils/serverConvert";
import { zipBatchOverLimit, ZIP_MAX_TOTAL_BYTES } from "./utils/zipPolicy";
import { extensionForMime } from "./core/conversionRegistry";

import { Header } from "./components/Header";
import { Dropzone } from "./components/Dropzone";
import { FileList } from "./components/FileList";
import { BatchBar } from "./components/BatchBar";
import { Sparkles, Zap, ShieldCheck, HeartHandshake } from "lucide-react";

// Heavy modal components load on demand — keeps the initial bundle small.
const ConversionOptionsModal = lazy(() =>
  import("./components/ConversionOptionsModal").then((m) => ({ default: m.ConversionOptionsModal }))
);
const PreviewModal = lazy(() =>
  import("./components/PreviewModal").then((m) => ({ default: m.PreviewModal }))
);
const HistoryDrawer = lazy(() =>
  import("./components/HistoryDrawer").then((m) => ({ default: m.HistoryDrawer }))
);
const CodeSnippetModal = lazy(() =>
  import("./components/CodeSnippetModal").then((m) => ({ default: m.CodeSnippetModal }))
);
const FormatGuide = lazy(() => import("./components/FormatGuide").then((m) => ({ default: m.FormatGuide })));

export default function App() {
  // Theme preference is persisted so the toggle actually sticks across sessions.
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("formatshift_theme");
      return saved === null ? true : saved === "dark";
    } catch {
      return true;
    }
  });
  const [selectedCategory, setSelectedCategory] = useState<FileCategory | "all">("all");

  // File Queue
  const [queue, setQueue] = useState<ConversionItem[]>([]);

  // History (persisted metadata only: blob URLs are session-scoped and are
  // stripped on write / on load, so restored entries never carry dead links).
  const [history, setHistory] = useState<ConversionHistoryItem[]>(() => {
    try {
      // Older versions could have persisted more than the cap; trim on load so
      // runtime state respects the same bound as storage.
      return hydrateHistory(localStorage.getItem("formatshift_history")).slice(0, MAX_HISTORY_ENTRIES);
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

  // Track in-flight abort controllers so the UI can cancel conversions.
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // URLs currently referenced by queue items, kept in sync at the exact
  // transitions where those references begin (conversion) and end (remove /
  // clear all). Clear History reads this ref inside its state updater so the
  // retained set is atomic with the history transition, never render-captured.
  const queueUrlsRef = useRef<Set<string>>(new Set());

  // Sync theme class to <html> tag and persist the preference.
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("formatshift_theme", isDark ? "dark" : "light");
    } catch {
      // ignore storage failure; theme still applies for the session
    }
  }, [isDark]);

  // Sync history to localStorage (metadata only; never blob URLs)
  useEffect(() => {
    try {
      localStorage.setItem("formatshift_history", JSON.stringify(historyForStorage(history)));
    } catch {
      // ignore quota error
    }
  }, [history]);

  // Add Files to Queue with Auto-Detection & Async Metadata Extraction
  const handleFilesAdded = (files: File[]) => {
    const newItems: ConversionItem[] = files.map((file) => {
      let detected: ReturnType<typeof detectCategoryAndFormats> | null = null;
      let detectError: string | null = null;
      try {
        detected = detectCategoryAndFormats(file);
      } catch (err) {
        detectError = err instanceof Error ? err.message : "Unsupported file type";
      }

      const newItem: ConversionItem = {
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        originalSize: file.size,
        originalExtension: detected?.sourceFormat || (file.name.split(".").pop() || "").toLowerCase(),
        category: detected?.category || "document",
        targetFormat: detected?.defaultTargetFormat || "txt",
        availableTargets: detected?.availableTargets ?? [],
        status: detectError ? "error" : "idle",
        progress: 0,
        errorMessage: detectError || undefined,
        options: {
          image: {
            quality: 85,
            maintainAspectRatio: true,
            bgColor: "#ffffff",
            grayscale: false,
            rotation: 0,
            flipHorizontal: false,
            flipVertical: false,
          },
          audio: {
            bitrate: "192k",
            sampleRate: 44100,
            channels: 2,
            volume: 100,
          },
          video: {
            resolution: "original",
            fps: 30,
            muteAudio: false,
          },
          data: {
            delimiter: ",",
            prettyPrint: true,
            indentSpaces: 2,
          },
        },
      };

      // Asynchronously extract metadata (preview image, duration, dimensions).
      // If the item was removed while extraction was in flight, the queue
      // update is a no-op and the preview blob URL must be revoked, or it
      // leaks for the session.
      if (!detectError) {
        extractFileMetadata(file).then((meta) => {
          setQueue((prev) => {
            if (!prev.some((item) => item.id === newItem.id)) {
              if (meta.previewUrl) URL.revokeObjectURL(meta.previewUrl);
              return prev;
            }
            return prev.map((item) =>
              item.id === newItem.id
                ? {
                    ...item,
                    previewUrl: meta.previewUrl,
                    dimensions: meta.dimensions,
                    duration: meta.duration,
                    lineCount: meta.lineCount,
                  }
                : item
            );
          });
        });
      }

      return newItem;
    });

    setQueue((prev) => [...prev, ...newItems]);
  };

  // Target Format Change per item
  const handleTargetFormatChange = (id: string, newTarget: TargetFormat) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, targetFormat: newTarget } : item)));
  };

  // Global Target Format apply (source-aware: never force a target a source
  // cannot actually be converted to, e.g. HTML -> Markdown).
  const handleApplyGlobalFormat = (format: TargetFormat) => {
    setQueue((prev) =>
      prev.map((item) => (item.availableTargets.includes(format) ? { ...item, targetFormat: format } : item))
    );
  };

  // Update Conversion Options for single item
  const handleSaveOptions = (itemId: string, updatedOptions: ConversionItem["options"]) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        // Spectrum visualizer outputs a video — force a video target so routing + extension match.
        const isSpectrum = item.category === "audio" && updatedOptions.audio?.spectrumVisualizer;
        // Social presets are for posting; social platforms want a single raster
        // format, so a preset pins the target to jpg.
        const isPreset =
          item.category === "image" &&
          updatedOptions.image?.socialPreset &&
          updatedOptions.image.socialPreset !== "custom";
        const targetFormat = isPreset
          ? "jpg"
          : isSpectrum && item.targetFormat !== "webm"
            ? "mp4"
            : item.targetFormat;
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
    abortControllersRef.current.set(id, abortController);

    // Update state to converting
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, status: "converting", progress: 5 } : q)));

    let resultBlob: Blob;
    let dimensions: { width: number; height: number } | undefined;
    let duration: number | undefined;

    const updateProgress = (pct: number) => {
      setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, progress: pct } : q)));
    };

    // Listen for abort signal to update status if conversion is cancelled
    const handleAbort = () => {
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id ? { ...q, status: "error", errorMessage: "Conversion cancelled", progress: 0 } : q
        )
      );
    };

    abortController.signal.addEventListener("abort", handleAbort);

    try {
      // Spectrum visualizer always produces a video, regardless of the queued target.
      const effectiveTarget: TargetFormat =
        item.category === "audio" && item.options.audio?.spectrumVisualizer && item.targetFormat !== "webm"
          ? "mp4"
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
      } else if (item.category === "image") {
        const res = await convertImage(
          item.file,
          item.targetFormat,
          item.options.image!,
          updateProgress,
          abortController.signal
        );
        resultBlob = res.blob;
        dimensions = res.dimensions;
      } else if (item.category === "audio") {
        const res = await convertAudio(
          item.file,
          effectiveTarget,
          item.options.audio!,
          updateProgress,
          abortController.signal
        );
        resultBlob = res.blob;
        duration = res.duration;
      } else if (item.category === "video") {
        const res = await convertVideo(
          item.file,
          item.targetFormat,
          item.options.video!,
          updateProgress,
          abortController.signal
        );
        resultBlob = res.blob;
        dimensions = res.dimensions;
        duration = res.duration;
      } else {
        const res = await convertDataDocument(
          item.file,
          item.targetFormat,
          item.options.data,
          updateProgress
        );
        resultBlob = res.blob;
      }

      const convertedUrl = URL.createObjectURL(resultBlob);
      queueUrlsRef.current.add(convertedUrl);
      const nameWithoutExt = item.name.substring(0, item.name.lastIndexOf(".")) || item.name;
      const actualExt = extensionForMime(resultBlob.type) || effectiveTarget;
      const convertedName = `${nameWithoutExt}_converted.${actualExt}`;

      // Update item in queue as completed
      setQueue((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                status: "completed",
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
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        downloadUrl: convertedUrl,
      };

      // Add to history, bounded to MAX_HISTORY_ENTRIES. The queue URL set is
      // current here (convertedUrl was added synchronously above), so an entry
      // trimmed off the end is revoked only when no queue item still shows it.
      setHistory((prev) => trimHistoryRevoking([historyEntry, ...prev], queueUrlsRef.current));
    } catch (err: unknown) {
      // Ignore abort errors as they're handled separately
      if (err instanceof DOMException && err.name === "AbortError") {
        // Already handled by the abort event listener
        return;
      }

      const errorMsg = err instanceof Error ? err.message : "Conversion failed";
      setQueue((prev) =>
        prev.map((q) => (q.id === id ? { ...q, status: "error", errorMessage: errorMsg, progress: 0 } : q))
      );
    } finally {
      // Clean up abort controller event listener
      abortController.signal.removeEventListener("abort", handleAbort);
      abortControllersRef.current.delete(id);
    }
  };

  // Cancel an in-progress conversion
  const handleCancelConversion = (id: string) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }
  };

  // Convert All Pending Files — run up to 3 conversions concurrently for
  // better batch throughput without overwhelming the browser/server.
  const handleConvertAll = async () => {
    const pendingItems = queue.filter((item) => item.status !== "completed");
    const CONCURRENCY = 3;
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < pendingItems.length) {
        const item = pendingItems[nextIndex++];
        await convertSingleFile(item.id);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, pendingItems.length) }, () => worker());
    await Promise.allSettled(workers);

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
    const a = document.createElement("a");
    a.href = item.convertedUrl;
    a.download = item.convertedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download All as ZIP
  const handleDownloadZip = async () => {
    const completedItems = queue.filter((item) => item.status === "completed" && item.convertedBlob);
    if (completedItems.length === 0) return;

    // JSZip holds every blob in memory while building the archive; refuse a
    // batch that would blow past the cap instead of OOM-ing the tab.
    if (zipBatchOverLimit(completedItems.map((i) => i.convertedBlob!.size))) {
      window.alert(
        `Batch exceeds the ${ZIP_MAX_TOTAL_BYTES / 1024 / 1024}MB ZIP limit. Download files individually instead.`
      );
      return;
    }

    // JSZip loads only when the user actually zips — keeps it out of the initial bundle.
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    completedItems.forEach((item) => {
      if (item.convertedBlob && item.convertedName) {
        zip.file(item.convertedName, item.convertedBlob);
      }
    });

    // STORE (no recompression): the media is already compressed, so DEFLATE
    // only wastes CPU/memory for nothing.
    const content = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const zipUrl = URL.createObjectURL(content);

    const a = document.createElement("a");
    a.href = zipUrl;
    a.download = `formatshift_converted_files.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // The ZIP URL is only referenced by the transient <a> element; revoke it
    // right after the click so it does not leak for the session.
    URL.revokeObjectURL(zipUrl);
  };

  // Remove single item from queue
  const handleRemove = (id: string) => {
    setQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.convertedUrl) {
        queueUrlsRef.current.delete(item.convertedUrl);
      }
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
      queueUrlsRef.current.clear();
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        // Only revoke convertedUrl if it's not referenced in history
        if (item.convertedUrl && !history.some((h) => h.downloadUrl === item.convertedUrl)) {
          URL.revokeObjectURL(item.convertedUrl);
        }
      });
      return [];
    });
  };

  // Clear History (revokes removed blob URLs, never a URL still shown by a queue item)
  const handleClearHistory = () => {
    // queueUrlsRef is current at updater time (it is synced synchronously at
    // every queue URL transition), so retention is atomic with the history clear.
    setHistory((prev) => clearHistoryRevoking(prev, queueUrlsRef.current));
  };

  const filteredQueue =
    selectedCategory === "all" ? queue : queue.filter((item) => item.category === selectedCategory);

  const isConvertingAny = queue.some((i) => i.status === "converting");

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 relative overflow-x-hidden ${
        isDark ? "bg-[#0b1120] text-slate-100" : "bg-slate-100 text-slate-900"
      }`}
    >
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
          transition={{ duration: 0.6, ease: "easeOut" }}
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
            Instant conversion for PNG, JPG, WEBP, SVG, MP3, WAV, MP4, WEBM, GIF, JSON, CSV, and Documents.
            Fast, private, and powered by client-side HTML5 & Node.js engines.
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
                onCancelConversion={handleCancelConversion}
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
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="p-5 rounded-2xl glass-card space-y-2 border-white/15"
          >
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold border border-blue-400/30">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Lightning Speed</h3>
            <p className="text-xs text-slate-300/70 leading-relaxed">
              Files convert directly in your browser using HTML5 Canvas, Web Audio API, and Web Media
              Encoders. Zero queue waiting times!
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="p-5 rounded-2xl glass-card space-y-2 border-white/15"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold border border-emerald-400/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">100% Private & Secure</h3>
            <p className="text-xs text-slate-300/70 leading-relaxed">
              Your files stay on your device or process securely in isolated server containers without
              permanent remote storage logs.
            </p>
          </motion.div>

          <motion.div
            whileHover={{ y: -4, scale: 1.01 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="p-5 rounded-2xl glass-card space-y-2 border-white/15"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold border border-purple-400/30">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Multi-Language Code</h3>
            <p className="text-xs text-slate-300/70 leading-relaxed">
              Need to convert programmatically? Get ready-to-run Python (`Pillow`/`pydub`), Node.js
              (`sharp`/`ffmpeg`), and HTML5 JavaScript code snippets!
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
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
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
      <Suspense fallback={null}>
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
          onClearHistory={handleClearHistory}
        />

        <CodeSnippetModal
          key={queue[0]?.id ?? "none"}
          isOpen={isCodeModalOpen}
          onClose={() => setIsCodeModalOpen(false)}
          category={queue[0]?.category || "image"}
          sourceFormat={queue[0]?.originalExtension || "png"}
          targetFormat={queue[0]?.targetFormat || "jpg"}
        />

        <FormatGuide isOpen={isFormatGuideOpen} onClose={() => setIsFormatGuideOpen(false)} />
      </Suspense>

      {/* Footer */}
      <footer className="relative z-10 mt-auto py-6 border-t border-white/10 text-center text-xs text-slate-400">
        <p>FormatShift Universal File Converter • Built with React, TypeScript, Node.js & HTML5</p>
      </footer>
    </div>
  );
}
