import { useState, useEffect, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ConversionItem, FileCategory } from "./types";
import { useConversionQueue } from "./hooks/useConversionQueue";

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

  // Modals
  const [optionsItem, setOptionsItem] = useState<ConversionItem | null>(null);
  const [previewItem, setPreviewItem] = useState<ConversionItem | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isFormatGuideOpen, setIsFormatGuideOpen] = useState(false);

  // Queue + history live in a hook so this component stays presentation-only.
  const {
    queue,
    history,
    isConvertingAny,
    handleFilesAdded,
    handleTargetFormatChange,
    handleApplyGlobalFormat,
    handleSaveOptions,
    convertSingleFile,
    handleCancelConversion,
    handleConvertAll,
    handleDownloadSingle,
    handleDownloadZip,
    handleRemove,
    handleClearAll,
    handleClearHistory,
  } = useConversionQueue();

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

  const filteredQueue =
    selectedCategory === "all" ? queue : queue.filter((item) => item.category === selectedCategory);

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
          <Dropzone onFilesAdded={handleFilesAdded} selectedCategory={selectedCategory} />
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
