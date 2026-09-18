import React, { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * D-2: honors the OS-level "reduce motion" preference for the JS-driven
 * motion/react animations (entrances, springs, whileHover/whileTap), the same
 * way the CSS `@media (prefers-reduced-motion: reduce)` guard in index.css
 * already covers keyframes and transitions.
 *
 * Reads the media query defensively: in environments without `matchMedia`
 * (older browsers, jsdom) it resolves to `false` and animations keep running,
 * so neither the app nor the test suite can crash on this code path.
 */
function readPrefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

export const ReducedMotionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [reduced, setReduced] = useState(readPrefersReducedMotion);

  // Track live changes (e.g. the user toggles "reduce motion" while the tab
  // is open) instead of only reading the preference once on mount.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia(QUERY);
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // "always" collapses transform/layout animations to their final state when
  // the preference is on; opacity-only fades still play, per WCAG 2.3.3.
  return <MotionConfig reducedMotion={reduced ? "always" : "never"}>{children}</MotionConfig>;
};
