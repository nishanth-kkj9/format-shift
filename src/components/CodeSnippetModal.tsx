import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Code2, Copy, Check, AlertTriangle } from "lucide-react";
import { CodeTemplateResponse, FileCategory } from "../types";
import { CONVERSION_REGISTRY, getAvailableTargets } from "../core/conversionRegistry";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { buildLocalFallback } from "../utils/snippetFallback";

interface CodeSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: string;
  sourceFormat?: string;
  targetFormat?: string;
}

type SnippetTab = "python" | "node" | "html";

const SNIPPET_TABS: SnippetTab[] = ["python", "node", "html"];

const TAB_LABEL: Record<SnippetTab, string> = {
  python: "Python",
  node: "Node.js",
  html: "HTML5 / JS",
};

// Active-tab styling is unchanged from the original dark-first design.
const TAB_ACTIVE_CLASS: Record<SnippetTab, string> = {
  python: "bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]",
  node: "bg-emerald-600 text-white shadow-[0_0_12px_rgba(5,150,105,0.4)]",
  html: "bg-orange-600 text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]",
};

export const CodeSnippetModal: React.FC<CodeSnippetModalProps> = ({
  isOpen,
  onClose,
  category = "image",
  sourceFormat = "png",
  targetFormat = "jpg",
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, dialogRef, onClose);

  const [activeTab, setActiveTab] = useState<SnippetTab>("python");
  const [copied, setCopied] = useState(false);
  /** Pointers for APG roving-tabindex focus movement between snippet tabs. */
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [codeData, setCodeData] = useState<CodeTemplateResponse["code"] | null>(null);
  // D-4: true when the server snippet request failed and generic local
  // templates are shown instead — surfaced to the user as a visible notice.
  const [isFallback, setIsFallback] = useState(false);

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

    // Guard against out-of-order responses when the selection changes quickly:
    // only the newest request is allowed to update state.
    let cancelled = false;

    fetch("/api/code-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: selCategory, sourceFormat: selSource, targetFormat: selTarget }),
    })
      .then((res) => {
        // Non-2xx (e.g. 429 rate limit, 500) must fall through to the local
        // fallback instead of parsing an error body as a template payload.
        if (!res.ok) throw new Error(`API responded with status ${res.status}`);
        return res.json() as Promise<CodeTemplateResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setCodeData(data.code);
        setIsFallback(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback local code templates — category-aware, and flagged so the UI
        // can tell the user these are generic starters, not tailored output.
        setCodeData(buildLocalFallback(selCategory, selSource, selTarget));
        setIsFallback(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selCategory, selSource, selTarget]);

  const currentCode = codeData ? codeData[activeTab] : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** APG tablist keyboard support: Left/Right move between snippet languages. */
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = SNIPPET_TABS.indexOf(activeTab);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = SNIPPET_TABS[(index + delta + SNIPPET_TABS.length) % SNIPPET_TABS.length];
    setActiveTab(next);
    tabRefs.current[next]?.focus();
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

            {/* D-4: visible notice when generic fallback templates are shown */}
            {isFallback && (
              <div
                role="status"
                className="mx-6 mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  Server unreachable — showing generic starter templates instead of code tailored to this
                  conversion.
                </span>
              </div>
            )}

            {/* Language Tabs & Copy Action */}
            <div className="flex items-center justify-between px-6 py-2.5 border-b border-white/10 bg-slate-950/60">
              <div
                role="tablist"
                aria-label="Code language"
                className="flex gap-2"
                onKeyDown={handleTabKeyDown}
              >
                {SNIPPET_TABS.map((tab) => (
                  <button
                    key={tab}
                    ref={(element) => {
                      tabRefs.current[tab] = element;
                    }}
                    role="tab"
                    id={`snippet-tab-${tab}`}
                    aria-selected={activeTab === tab}
                    aria-controls="snippet-code-panel"
                    tabIndex={activeTab === tab ? 0 : -1}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeTab === tab
                        ? TAB_ACTIVE_CLASS[tab]
                        : "text-slate-400 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {TAB_LABEL[tab]}
                  </button>
                ))}
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
            <div
              role="tabpanel"
              id="snippet-code-panel"
              aria-labelledby={`snippet-tab-${activeTab}`}
              className="p-6 overflow-y-auto flex-1 bg-slate-950 text-emerald-400 font-mono text-xs leading-relaxed border-b border-white/10"
            >
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
              <button
                onClick={onClose}
                aria-label="Close"
                className="font-bold text-indigo-400 hover:underline cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
