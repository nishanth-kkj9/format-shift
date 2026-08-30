import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Code2, Copy, Check } from "lucide-react";
import { CodeTemplateResponse, FileCategory } from "../types";
import { CONVERSION_REGISTRY, getAvailableTargets } from "../core/conversionRegistry";
import { useDialogFocus } from "../hooks/useDialogFocus";

interface CodeSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: string;
  sourceFormat?: string;
  targetFormat?: string;
}

export const CodeSnippetModal: React.FC<CodeSnippetModalProps> = ({
  isOpen,
  onClose,
  category = "image",
  sourceFormat = "png",
  targetFormat = "jpg",
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, dialogRef, onClose);

  const [activeTab, setActiveTab] = useState<"python" | "node" | "html">("python");
  const [copied, setCopied] = useState(false);
  const [codeData, setCodeData] = useState<CodeTemplateResponse["code"] | null>(null);

  // Local state for user-selectable conversion parameters. Reset via the parent's
  // key={queue[0]?.id} remount, so no effect is needed to sync props -> state.
  const [selCategory, setSelCategory] = useState<FileCategory>((category as FileCategory) || "image");
  const [selSource, setSelSource] = useState(sourceFormat || "png");
  const [selTarget, setSelTarget] = useState(targetFormat || "jpg");

  // Available source formats for the selected category
  const sourceOptions = CONVERSION_REGISTRY[selCategory]?.sourceFormats || [];
  // Available target formats for the selected category
  const targetOptions = getAvailableTargets(selCategory) || [];

  // No code yet for the current selection until a fetch resolves.
  const loading = codeData === null;

  useEffect(() => {
    if (!isOpen) return;

    fetch("/api/code-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: selCategory, sourceFormat: selSource, targetFormat: selTarget }),
    })
      .then((res) => res.json())
      .then((data: CodeTemplateResponse) => {
        setCodeData(data.code);
      })
      .catch(() => {
        // Fallback local code templates
        setCodeData({
          python: `# Python Code (PIL/Pillow)\nfrom PIL import Image\n\nimg = Image.open('input.${selSource}')\nimg.save('output.${selTarget}')`,
          node: `// Node.js Code\nimport sharp from 'sharp';\n\nawait sharp('input.${selSource}').toFile('output.${selTarget}');`,
          html: `<!-- HTML5 + Canvas JS -->\n<script>\nconst canvas = document.createElement('canvas');\n</script>`,
        });
      });
  }, [isOpen, selCategory, selSource, selTarget]);

  const currentCode = codeData ? codeData[activeTab] : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="code-snippet-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative z-10 w-full max-w-3xl bg-slate-900 text-white rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] border border-white/15 overflow-hidden glass-card flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="code-snippet-title" className="text-sm font-black text-white">
                    Developer API & Code Snippets
                  </h3>
                  <p className="text-xs text-slate-400">
                    Programmatic <span className="font-bold text-indigo-400 uppercase">{sourceFormat}</span> →{" "}
                    <span className="font-bold text-indigo-400 uppercase">{targetFormat}</span> conversion
                    code templates
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conversion Parameter Selectors */}
            <div className="px-6 py-3 border-b border-white/10 bg-slate-950/60 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Category
                </label>
                <select
                  value={selCategory}
                  onChange={(e) => {
                    const cat = e.target.value as FileCategory;
                    setSelCategory(cat);
                    setCodeData(null); // show loading while the new selection fetches
                    // Reset source/target to sensible defaults for the new category
                    const srcs = CONVERSION_REGISTRY[cat]?.sourceFormats || [];
                    const tgts = getAvailableTargets(cat) || [];
                    setSelSource(srcs[0] || "png");
                    setSelTarget(tgts[0] || "jpg");
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-slate-900 border border-white/15 text-white cursor-pointer"
                >
                  {(["image", "audio", "video", "data", "document"] as FileCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Source Format
                </label>
                <select
                  value={selSource}
                  onChange={(e) => {
                    setSelSource(e.target.value);
                    setCodeData(null);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-slate-900 border border-white/15 text-white cursor-pointer"
                >
                  {sourceOptions.map((f) => (
                    <option key={f} value={f}>
                      {f.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Target Format
                </label>
                <select
                  value={selTarget}
                  onChange={(e) => {
                    setSelTarget(e.target.value);
                    setCodeData(null);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-slate-900 border border-white/15 text-white cursor-pointer"
                >
                  {targetOptions.map((f) => (
                    <option key={f} value={f}>
                      {f.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Language Tabs & Copy Action */}
            <div className="flex items-center justify-between px-6 py-2.5 border-b border-white/10 bg-slate-950/60">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("python")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "python"
                      ? "bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]"
                      : "text-slate-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  🐍 Python
                </button>
                <button
                  onClick={() => setActiveTab("node")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "node"
                      ? "bg-emerald-600 text-white shadow-[0_0_12px_rgba(5,150,105,0.4)]"
                      : "text-slate-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  🟢 Node.js
                </button>
                <button
                  onClick={() => setActiveTab("html")}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "html"
                      ? "bg-orange-600 text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]"
                      : "text-slate-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  🌐 HTML5 / JS
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCopy}
                className="px-3.5 py-1.5 rounded-xl border border-white/15 bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Snippet
                  </>
                )}
              </motion.button>
            </div>

            {/* Code Output Terminal Block */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-950 text-emerald-400 font-mono text-xs leading-relaxed border-b border-white/10">
              {loading ? (
                <div className="text-slate-500 py-12 text-center animate-pulse">
                  Generating runnable code snippet...
                </div>
              ) : (
                <pre className="whitespace-pre-wrap">{currentCode}</pre>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-slate-900/80 text-[11px] text-slate-400 flex justify-between items-center">
              <span>FormatShift Developer Suite</span>
              <button onClick={onClose} aria-label="Close" className="font-bold text-indigo-400 hover:underline cursor-pointer">
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
