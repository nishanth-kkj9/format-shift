import React, { useState, useRef, useEffect, useLayoutEffect, useId } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Image } from "lucide-react";
import { FileCategory, TargetFormat } from "../types";
import { CONVERSION_REGISTRY, getAvailableTargets } from "../core/conversionRegistry";
import { FORMAT_META } from "./formatMeta";

interface FormatOption {
  format: TargetFormat;
  label: string;
  badge: string;
  engine: "browser" | "server";
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const FORMAT_OPTIONS: Record<FileCategory, FormatOption[]> = Object.fromEntries(
  (Object.keys(CONVERSION_REGISTRY) as FileCategory[]).map((category) => [
    category,
    getAvailableTargets(category).map((format) => {
      const meta = FORMAT_META[category]?.[format];
      const engine = CONVERSION_REGISTRY[category].targets[format].engine;
      return {
        format,
        label: meta?.label ?? format.toUpperCase(),
        badge: meta?.badge ?? (engine === "server" ? "FFmpeg" : "Browser"),
        engine,
        icon: meta?.icon ?? Image,
        description: meta?.description,
      };
    }),
  ])
) as Record<FileCategory, FormatOption[]>;

interface FormatDropdownProps {
  value: TargetFormat;
  onChange: (format: TargetFormat) => void;
  category: FileCategory;
  /** optional source-aware whitelist; falls back to all category targets */
  availableFormats?: string[];
  disabled?: boolean;
}

export const FormatDropdown: React.FC<FormatDropdownProps> = ({
  value,
  onChange,
  category,
  availableFormats,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    openUp: boolean;
    width: number;
  } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const options = availableFormats
    ? FORMAT_OPTIONS[category].filter((o) => availableFormats.includes(o.format))
    : FORMAT_OPTIONS[category] || FORMAT_OPTIONS.image;
  const selectedOption = options.find((o) => o.format === value) || options[0];
  const SelectedIcon = selectedOption.icon;
  const activeOption = isOpen && activeIndex >= 0 ? options[activeIndex] : undefined;

  const openMenu = (initialIndex: number) => {
    const idx = initialIndex >= 0 && initialIndex < options.length ? initialIndex : 0;
    setActiveIndex(idx);
    setIsOpen(true);
  };

  const closeMenu = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (isOpen) {
          setActiveIndex((i) => (i >= options.length - 1 ? 0 : i + 1));
        } else {
          const cur = options.findIndex((o) => o.format === value);
          openMenu(cur >= 0 ? cur : 0);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (isOpen) {
          setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
        } else {
          const cur = options.findIndex((o) => o.format === value);
          openMenu(cur >= 0 ? cur : options.length - 1);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (isOpen) {
          const active = options[activeIndex];
          if (active) {
            onChange(active.format);
            closeMenu();
          }
        } else {
          openMenu(0);
        }
        break;
      case "Escape":
        if (isOpen) {
          e.preventDefault();
          closeMenu();
        }
        break;
    }
  };

  // Scroll the highlighted option into view when navigating with the keyboard.
  // `?.` guards jsdom, where scrollIntoView is not implemented.
  useEffect(() => {
    if (!activeOption) return;
    document.getElementById(`${menuId}-${activeOption.format}`)?.scrollIntoView?.({
      block: "nearest",
    });
  }, [activeOption, menuId]);

  // Close on outside click - checks both the trigger and the portaled menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = dropdownRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);
      if (!clickedTrigger && !clickedMenu) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Compute viewport-anchored position whenever the menu opens, and keep it
  // pinned on scroll/resize instead of relying on a CSS `absolute` ancestor.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const menuHeight = 300; // approx max-h-72 (18rem=288px) + header
      const menuWidth = 256; // w-64
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight && rect.top > menuHeight;

      let left = rect.left;
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) left = 8;

      setMenuPos({
        top: openUp ? rect.top - 8 : rect.bottom + 8,
        left,
        openUp,
        width: menuWidth,
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu() : openMenu(0))}
        onKeyDown={handleTriggerKeyDown}
        onBlur={(e) => {
          // Mousedown on a menu option (a non-focusable div) moves focus to
          // <body>, so relatedTarget is null; closing here would unmount the
          // menu before the option's click completes and the selection would
          // never change. Only close when focus actually moves elsewhere (e.g.
          // Tab to another control); clicks outside are handled by the
          // document mousedown listener above.
          const related = e.relatedTarget as Node | null;
          if (
            isOpen &&
            related &&
            !e.currentTarget.contains(related) &&
            !menuRef.current?.contains(related)
          ) {
            closeMenu();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-activedescendant={activeOption ? `${menuId}-${activeOption.format}` : undefined}
        aria-label={`Choose output format, currently ${value}`}
        className="px-3.5 py-1.5 rounded-xl text-xs font-bold glass-input text-white border border-white/15 hover:border-indigo-400/50 hover:bg-white/10 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="w-5 h-5 rounded-md bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
          <SelectedIcon className="w-3.5 h-3.5" />
        </div>
        <span className="uppercase tracking-wider font-extrabold">{value}</span>
        <span className="hidden sm:inline text-[10px] text-slate-400 font-medium font-mono">
          .{selectedOption.format}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180 text-indigo-400" : "group-hover:text-white"}`}
        />
      </button>

      {/* Floating Popover Menu - portaled to <body> and positioned in fixed
          viewport coordinates, so it can never get trapped inside a parent's
          stacking context or overlap unrelated page sections below it. */}
      {isOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            id={menuId}
            aria-label={`Output formats for ${category}`}
            style={{
              position: "fixed",
              top: menuPos.openUp ? undefined : menuPos.top,
              bottom: menuPos.openUp ? window.innerHeight - menuPos.top : undefined,
              left: menuPos.left,
              width: menuPos.width,
            }}
            className="rounded-2xl glass-card backdrop-blur-2xl bg-slate-900/95 border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[999] p-2 space-y-1 animate-fade-in max-h-72 overflow-y-auto no-scrollbar"
          >
            <div className="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400 border-b border-white/10 flex items-center justify-between">
              <span>Select Output Format</span>
              <span className="text-indigo-400 font-mono">{category.toUpperCase()}</span>
            </div>

            {options.map((opt, index) => {
              const Icon = opt.icon;
              const isSelected = opt.format === value;

              return (
                <div
                  key={opt.format}
                  id={`${menuId}-${opt.format}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.format);
                    closeMenu();
                  }}
                  className={`w-full px-2.5 py-2 rounded-xl text-left transition-all flex items-center justify-between cursor-pointer ${
                    activeIndex === index ? "ring-1 ring-indigo-400" : ""
                  } ${
                    isSelected
                      ? "bg-indigo-500/20 text-white border border-indigo-400/40 shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? "bg-indigo-500 text-white shadow-sm"
                          : "bg-white/10 text-slate-300 group-hover:bg-indigo-500/20 group-hover:text-indigo-300"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold truncate">{opt.label}</span>
                      </div>
                      {opt.description && (
                        <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
                          {opt.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        isSelected
                          ? "bg-indigo-400/20 text-indigo-300 border border-indigo-400/30"
                          : "bg-white/5 text-slate-400 group-hover:text-slate-200"
                      }`}
                    >
                      {opt.badge}
                    </span>
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                        opt.engine === "server"
                          ? "bg-amber-500/15 text-amber-300 border-amber-400/30"
                          : "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
                      }`}
                    >
                      {opt.engine === "server" ? "FFmpeg" : "Browser"}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </div>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};
