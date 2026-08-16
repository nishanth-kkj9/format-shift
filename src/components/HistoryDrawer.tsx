import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, History, Download, ArrowRight } from "lucide-react";
import { ConversionHistoryItem } from "../types";
import { formatBytes } from "../utils/converter";

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: ConversionHistoryItem[];
  onClearHistory: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ isOpen, onClose, history, onClearHistory }) => {
  const totalSavedBytes = history.reduce((acc, h) => acc + Math.max(0, h.originalSize - h.convertedSize), 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
          />

          {/* Drawer Body */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative z-10 w-full max-w-md bg-slate-900 text-white h-full shadow-2xl border-l border-white/10 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/80">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Conversion History</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overview Stats */}
            {history.length > 0 && (
              <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex justify-between items-center text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Total Converted
                  </span>
                  <span className="font-bold text-white">{history.length} Files</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Storage Saved</span>
                  <span className="font-extrabold text-emerald-400">{formatBytes(totalSavedBytes)}</span>
                </div>
                <button
                  onClick={onClearHistory}
                  className="text-xs text-rose-400 hover:underline font-bold cursor-pointer"
                >
                  Clear Log
                </button>
              </div>
            )}

            {/* History List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {history.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No converted files in history yet.</p>
                </div>
              ) : (
                history.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3.5 rounded-2xl border border-white/10 glass-card flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white truncate">
                        <span className="truncate">{item.originalName}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="text-indigo-400 uppercase">{item.targetFormat}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                        <span>
                          {formatBytes(item.originalSize)} → {formatBytes(item.convertedSize)}
                        </span>
                        <span>•</span>
                        <span>{item.timestamp}</span>
                      </div>
                    </div>

                    {item.downloadUrl ? (
                      <a
                        href={item.downloadUrl}
                        download={item.convertedName}
                        className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shrink-0 cursor-pointer shadow-md"
                        title="Download File"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    ) : (
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-white/5 text-slate-500 shrink-0"
                        title="This entry was restored from storage; the converted file only lives for the session in which it was created."
                      >
                        Session only
                      </span>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
