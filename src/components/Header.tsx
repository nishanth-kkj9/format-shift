import React from "react";
import {
  RefreshCw,
  Code2,
  History,
  Sun,
  Moon,
  FileText,
  Sparkles,
  Image as ImageIcon,
  Music,
  Video,
  Database,
  File as FileDoc,
} from "lucide-react";
import { FileCategory } from "../types";

interface HeaderProps {
  selectedCategory: FileCategory | "all";
  onSelectCategory: (cat: FileCategory | "all") => void;
  onOpenHistory: () => void;
  onOpenCodeModal: () => void;
  onOpenFormatGuide: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  historyCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  selectedCategory,
  onSelectCategory,
  onOpenHistory,
  onOpenCodeModal,
  onOpenFormatGuide,
  isDark,
  onToggleTheme,
  historyCount,
}) => {
  const categories: {
    id: FileCategory | "all";
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: "all", label: "All Formats", Icon: Sparkles },
    { id: "image", label: "Images", Icon: ImageIcon },
    { id: "audio", label: "Audio", Icon: Music },
    { id: "video", label: "Video", Icon: Video },
    { id: "data", label: "Data", Icon: Database },
    { id: "document", label: "Docs", Icon: FileDoc },
  ];

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-slate-950/70 border-b border-white/10 shadow-2xl transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-40 group-hover:opacity-75 transition duration-300"></div>
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg border border-white/20">
              <RefreshCw className="w-5 h-5 animate-spin-slow" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white">
                Format
                <span className="text-indigo-400 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                  Shift
                </span>
              </h1>
              <span className="text-[10px] font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 uppercase shadow-sm">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
              Universal High-Performance Media & Data Engine
            </p>
          </div>
        </div>

        {/* Category Selector Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 p-1 rounded-2xl glass-input border border-white/10">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.id;
            const Icon = cat.Icon;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)] scale-[1.02]"
                    : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Tools & Actions */}
        <div className="flex items-center gap-2">
          {/* Format Guide */}
          <button
            onClick={onOpenFormatGuide}
            title="Format Guide & Cheat Sheet"
            aria-label="Guide"
            className="min-h-11 min-w-11 px-2.5 py-1.5 rounded-xl glass-input border border-white/10 text-slate-200 hover:border-indigo-400/50 hover:text-indigo-300 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer"
          >
            <FileText className="w-4 h-4 text-indigo-400" />
            <span className="hidden lg:inline">Guide</span>
          </button>

          {/* Developer Code Snippets Button (Python, Node.js, HTML) */}
          <button
            onClick={onOpenCodeModal}
            title="Get Python, Node.js & HTML Code"
            aria-label="API Snippets"
            className="min-h-11 min-w-11 px-3 py-1.5 rounded-xl border border-white/10 text-slate-200 hover:border-emerald-400/50 hover:text-emerald-300 transition-all flex items-center gap-1.5 text-xs font-bold glass-input cursor-pointer"
          >
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">API Snippets</span>
          </button>

          {/* History Drawer Trigger */}
          <button
            onClick={onOpenHistory}
            title="Conversion History"
            aria-label="History"
            className="relative min-h-11 min-w-11 px-3 py-1.5 rounded-xl border border-white/10 text-slate-200 hover:border-amber-400/50 hover:text-amber-300 transition-all flex items-center gap-1.5 text-xs font-bold glass-input cursor-pointer"
          >
            <History className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">History</span>
            {historyCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center shadow-md">
                {historyCount}
              </span>
            )}
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            title="Toggle Light/Dark Theme"
            aria-label="Toggle Light/Dark Theme"
            className="min-h-11 min-w-11 p-2 rounded-xl border border-white/10 glass-input text-amber-400 hover:bg-white/10 transition-colors cursor-pointer"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-300" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Category Navigation Bar */}
      <div className="md:hidden relative border-t border-white/10">
        <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto no-scrollbar">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat.id;
            const Icon = cat.Icon;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`min-h-11 px-3 rounded-full text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-white/5 text-slate-300 border border-white/10"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
        {/* Fade gradient scroll affordance */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900 to-transparent pointer-events-none" />
      </div>
    </header>
  );
};
