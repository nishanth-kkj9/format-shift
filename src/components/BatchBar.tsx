import React from "react";
import { Play, Loader2, FolderArchive } from "lucide-react";
import { ConversionItem, TargetFormat, FileCategory } from "../types";
import { formatBytes } from "../utils/converter";
import { getAvailableTargets } from "../core/conversionRegistry";

interface BatchBarProps {
  items: ConversionItem[];
  onConvertAll: () => void;
  onDownloadZip: () => void;
  onClearAll: () => void;
  onApplyGlobalFormat: (format: TargetFormat) => void;
  isConvertingAny: boolean;
}

export const BatchBar: React.FC<BatchBarProps> = ({
  items,
  onConvertAll,
  onDownloadZip,
  onClearAll,
  onApplyGlobalFormat,
  isConvertingAny,
}) => {
  if (items.length === 0) return null;

  const completedCount = items.filter((i) => i.status === "completed").length;
  const totalCount = items.length;
  const isAllCompleted = completedCount === totalCount && totalCount > 0;

  const totalOriginalBytes = items.reduce((acc, i) => acc + i.originalSize, 0);
  const totalConvertedBytes = items.reduce((acc, i) => acc + (i.convertedSize || 0), 0);
  const totalSavedBytes = completedCount > 0 ? Math.max(0, totalOriginalBytes - totalConvertedBytes) : 0;

  return (
    <div className="sticky bottom-6 z-20 w-full max-w-4xl mx-auto px-4">
      <div className="rounded-2xl p-4 glass-card border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.8)] text-white flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-2xl">
        {/* Left: Global Stats & Batch Quick Selector */}
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <div>
            <div className="text-xs text-slate-300 font-bold flex items-center gap-1.5">
              <span>
                {completedCount} of {totalCount} Converted
              </span>
              {totalSavedBytes > 0 && (
                <span className="text-emerald-400 font-mono font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-[11px]">
                  Saved {formatBytes(totalSavedBytes)}
                </span>
              )}
            </div>
            <div className="text-xs font-semibold text-slate-400 mt-0.5">
              Queue Size: <span className="text-white font-mono">{formatBytes(totalOriginalBytes)}</span>
            </div>
          </div>

          {/* Quick Global Format Selector Dropdown — derived from the registry */}
          <select
            onChange={(e) => e.target.value && onApplyGlobalFormat(e.target.value as TargetFormat)}
            defaultValue=""
            className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-slate-900/90 text-indigo-300 border border-indigo-500/40 focus:ring-2 focus:ring-indigo-500 cursor-pointer uppercase shadow-inner"
          >
            <option value="" disabled>
              Set All Formats...
            </option>
            {(["image", "audio", "video", "data", "document"] as FileCategory[]).map((cat) => {
              const targets = getAvailableTargets(cat);
              if (targets.length === 0) return null;
              return (
                <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                  {targets.map((fmt) => (
                    <option key={fmt} value={fmt}>
                      All to .{fmt.toUpperCase()}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          {/* Clear Queue Button */}
          <button
            onClick={onClearAll}
            className="px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            Clear Queue
          </button>

          {/* Download All as ZIP (if any completed) */}
          {completedCount > 0 && (
            <button
              onClick={onDownloadZip}
              className="px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <FolderArchive className="w-4 h-4" /> Save All ZIP
            </button>
          )}

          {/* Convert All Button */}
          {!isAllCompleted && (
            <button
              onClick={onConvertAll}
              disabled={isConvertingAny}
              className="px-5 py-2 rounded-xl text-xs font-extrabold bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-[0_0_25px_rgba(99,102,241,0.5)] flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isConvertingAny ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Converting Queue...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" /> Convert All ({totalCount - completedCount})
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
