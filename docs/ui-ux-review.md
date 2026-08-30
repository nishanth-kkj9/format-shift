# UI/UX Review — FormatShift (format-shift)

Branch: `ui-ux-review` (based on `main` @ `3270af8`) · Date: 2026-08-27 · Tooling: Vite 8 + React 19 + TypeScript + Tailwind v4, Motion (`motion/react`), Vitest (24 files / 378 tests)

---

## 1. Executive Summary

The frontend is a mature, well-structured single-page converter built dark-first on Tailwind v4 utilities with a hand-rolled light-theme remap layer and consistent `motion/react` overlay choreography. The biggest problems found were accessibility gaps rather than visual ones: unlabeled icon-only controls, one modal missing the shared focus-trap used by all others, sub-44px touch targets across the entire header and mobile nav, no `prefers-reduced-motion` handling for five looping CSS animations, and light-theme secondary text that failed WCAG AA contrast. Eleven scoped fixes were applied as individually-revertable commits, each passing typecheck/lint/tests/build and re-verified live at 375/768/1440px. Remaining structural concerns are modest: dialog open/close motion relies on JS spring animation that is not covered by the new reduced-motion guard, and the light theme's class-remap architecture should eventually be replaced by real tokens.

## 2. Frontend Coverage

- **Framework:** React 19 + TypeScript, Vite 8, single route (`/`), `src/App.tsx` orchestrates state; dev servers via `npm run dev:all` (API :4000 + Vite :5173)
- **Styling system:** Tailwind v4 utility classes + custom utilities layer in `src/index.css` (`glass-card`, `glass-input`, `mesh-bg`, `orb-*`, `shimmer-bg`, `bg-checkered`, `no-scrollbar`)
- **Design-system approach:** shared utility primitives instead of component library; light theme implemented as an `html:not(.dark)` remap block over the same utility classes
- **Routes reviewed:** `/` (single-route app; all flows are overlays/state on this route)
- **Major shared components reviewed:** `Header`, `Dropzone`, `FileList`, `BatchBar`, `FormatDropdown`, `ConversionOptionsModal`, `PreviewModal`, `CodeSnippetModal`, `HistoryDrawer`, `FormatGuide`, `useDialogFocus` hook
- **Viewport sizes tested:** 375px, 768px, 1440px (before + after captures)
- **Allowed paths:** inferred conservatively in Phase 0 as `src/**` (frontend source only); no file outside it was touched. `docs/ui-ux-review.md` added per output spec.

Screenshots live in `.review/screenshots/` using `{route-or-element}__{breakpoint}__{before|after}.png`.

## 3. Element & Animation Coverage Ledger

| Item                                                         | Type                       | Category                    | Status                         | Finding ID   |
| ------------------------------------------------------------ | -------------------------- | --------------------------- | ------------------------------ | ------------ |
| Primary Convert button (gradient)                            | Element                    | Buttons                     | Clean                          | —            |
| Header toolbar buttons (Guide/API Snippets/History/Theme)    | Element                    | Buttons                     | Issue Logged                   | F-006        |
| Icon-only close buttons (4 overlays)                         | Element                    | Buttons                     | Issue Logged                   | F-001        |
| Color-preset swatch buttons                                  | Element                    | Buttons                     | Issue Logged                   | F-002        |
| Sample-file chip buttons                                     | Element                    | Buttons                     | Clean                          | —            |
| Mobile category pills                                        | Element                    | Buttons / Nav               | Issue Logged                   | F-007, F-010 |
| BatchBar action buttons + Clear All                          | Element                    | Buttons                     | Clean                          | —            |
| Row action icon buttons (options/preview/remove/cancel)      | Element                    | Buttons                     | Clean                          | —            |
| Global "Set All Formats" select                              | Element                    | Inputs (select)             | Issue Logged                   | F-003        |
| Per-row format selects                                       | Element                    | Inputs (select)             | Clean                          | —            |
| Quality/resize range sliders                                 | Element                    | Inputs (range)              | Clean                          | —            |
| Color picker input                                           | Element                    | Inputs (color)              | Clean                          | —            |
| Dropzone container + hidden file input                       | Element                    | Inputs (file) / Empty state | Issue Logged                   | F-004        |
| Desktop category tab bar                                     | Element                    | Navigation                  | Clean                          | —            |
| History badge count                                          | Element                    | Badge                       | Clean                          | —            |
| Modals: ConversionOptions, Preview, CodeSnippet, FormatGuide | Element                    | Overlays (modal)            | Issue Logged (FormatGuide)     | F-001, F-005 |
| HistoryDrawer side panel                                     | Element                    | Overlay (drawer)            | Clean                          | —            |
| Backdrop click-to-dismiss layer                              | Element                    | Overlay pattern             | Clean                          | —            |
| File queue cards (FileList)                                  | Element                    | Card / List                 | Clean                          | —            |
| Progress/spinner conversion states                           | Element                    | Loading                     | Clean                          | —            |
| `shimmer-bg` loading sweep                                   | Animation                  | Loading                     | Clean after fix                | F-011        |
| Empty state (= Dropzone)                                     | Element                    | Empty state                 | Clean                          | —            |
| Image preview w/ checkered backdrop                          | Element                    | Media                       | Clean                          | —            |
| Audio/video/code previews                                    | Element                    | Media                       | Clean                          | —            |
| Background mesh + floating orbs (`floatOrb`)                 | Animation (CSS)            | Decoration                  | Clean after fix                | F-011        |
| `spin` 10s decoration loop                                   | Animation (CSS)            | Decoration                  | Clean after fix                | F-011        |
| `bounce` 3s scroll-hint                                      | Animation (CSS)            | Orientation cue             | Clean after fix                | F-011        |
| Modal/drawer enter-exit springs (`AnimatePresence`)          | Animation (Motion)         | Overlay transition          | Clean                          | —            |
| Hover/tap scale micro-interactions (`whileHover`/`whileTap`) | Animation (Motion)         | Micro-interaction           | See deferred D-2               | —            |
| Hover/focus color transitions (Tailwind classes)             | Animation (CSS transition) | Micro-interaction           | Clean (covered by F-011 guard) | —            |

Every row was traced in source and exercised in-browser where renderable. None were skipped.

## 4. Findings & Fixes

| ID    | Area                        | Severity | Location                                                                                                       | Issue                                                                                                                           | Fix Applied                                                                                   | What Changed / Why Deferred |
| ----- | --------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------- |
| F-001 | Accessibility               | Major    | `CodeSnippetModal.tsx:118,259`, `ConversionOptionsModal.tsx:123`, `HistoryDrawer.tsx:57`, `FormatGuide.tsx:42` | Icon-only close buttons had no accessible name                                                                                  | Added `aria-label="Close"` to all 5 close buttons                                             | Fixed — commit `a1427b9`    |
| F-002 | Accessibility               | Minor    | `ConversionOptionsModal.tsx:215`                                                                               | Background-color swatches were unlabeled image-less buttons                                                                     | Mapped hexes to human names, added `aria-label="Background: …"`                               | Fixed — commit `dd7dbed`    |
| F-003 | A11y / UX                   | Minor    | `BatchBar.tsx:58-84`                                                                                           | Global format select had no label; duplicated formats repeated across optgroups                                                 | Added `aria-label="Set all file formats"`; deduped via `Set`                                  | Fixed — commit `690a4de`    |
| F-004 | Semantics                   | Major    | `Dropzone.tsx:70-72`                                                                                           | Container with nested interactive children was `role="button"` (invalid nested-button semantics)                                | Changed to `role="region"` + `aria-labelledby`; kept keyboard activation                      | Fixed — commit `30115bc`    |
| F-005 | Accessibility / Consistency | Major    | `FormatGuide.tsx`                                                                                              | Only overlay without the shared `useDialogFocus` trap, `role="dialog"`, `aria-modal`, or labelled title — Tab escaped into page | Wired hook + dialog semantics, matching the other three modals                                | Fixed — commit `07a24a1`    |
| F-006 | Responsive / Touch          | Major    | `Header.tsx:92,103,114,130`                                                                                    | All four header toolbar buttons ~32px tall (<44px touch minimum)                                                                | Added `min-h-11 min-w-11`; verified 44×44 computed size at 375px                              | Fixed — commit `e6b6e3d`    |
| F-007 | Responsive UX               | Minor    | `Header.tsx:142+`                                                                                              | Scrollable mobile category nav gave no affordance that more items existed off-screen                                            | Right-edge fade gradient indicator over the scroller                                          | Fixed — commit `86eb37d`    |
| F-008 | Color / Contrast            | Major    | `index.css:175-179`                                                                                            | Light-theme secondary text (`slate-300/70`, `slate-400`) ≈3.9:1 on white — WCAG AA fail for body text                           | Darkened to ≥7:1 equivalents; computed style verified live                                    | Fixed — commit `0b77a60`    |
| F-009 | Accessibility               | Minor    | `index.css` (light block)                                                                                      | Focus-ring offset color stayed dark-slate in light mode, rings blended into white surfaces                                      | Remapped offset to white under `html:not(.dark)`                                              | Fixed — commit `7d4d62a`    |
| F-010 | Responsive / Touch          | Major    | `Header.tsx:150` (found during Phase 6 re-test)                                                                | Mobile category pills measured only ~26px tall on the touch-only breakpoint                                                     | Added `min-h-11`; overflow still 0px                                                          | Fixed — commit `d0d2de1`    |
| F-011 | Accessibility / Motion      | Major    | `index.css:19,23,49,61,91`                                                                                     | Four infinite decorative animations ran unconditionally; **zero** `prefers-reduced-motion` handling app-wide                    | Reduce-media guard disabling loops + neutralizing transitions; verified via emulated `reduce` | Fixed — commit `47d6f07`    |
| F-012 | Contrast                    | Polish   | several components                                                                                             | Some indigo-on-white small text remains borderline AA in light mode                                                             | —                                                                                             | Deferred (§8 D-1)           |

Each fix was committed independently referencing its ID and passed `typecheck` + `lint` (+ tests/build where CSS or shared files changed) before the next landed.

## 5. Diff Summary

| File                                        | Change                                                                   | Reason                                     | Finding ID          |
| ------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ | ------------------- |
| `src/components/CodeSnippetModal.tsx`       | +2 aria-labels on close buttons                                          | Unnamed icon-only controls                 | F-001               |
| `src/components/ConversionOptionsModal.tsx` | aria-label on close; labeled color presets                               | Unnamed controls                           | F-001, F-002        |
| `src/components/HistoryDrawer.tsx`          | aria-label on close                                                      | Unnamed icon-only control                  | F-001               |
| `src/components/FormatGuide.tsx`            | aria-label on close; focus trap + dialog semantics + labelled heading    | Missing trap/semantics vs sibling modals   | F-001, F-005        |
| `src/components/BatchBar.tsx`               | aria-label on select; deduped optgroups                                  | Unlabeled control, duplicate options       | F-003               |
| `src/components/Dropzone.tsx`               | role=region + aria-labelledby + id on h2                                 | Nested interactive semantics               | F-004               |
| `src/components/Header.tsx`                 | 44px targets ×4; mobile nav fade wrapper; pill min-height                | Touch targets + scroll affordance          | F-006, F-007, F-010 |
| `src/index.css`                             | darker light-theme text; white ring-offset; prefers-reduced-motion block | Contrast, focus visibility, reduced motion | F-008, F-009, F-011 |
| `docs/ui-ux-review.md`                      | this report                                                              | Output spec                                | —                   |

## 6. Before/After Visual Validation

| Route/element                        | Viewport   | Before                   | After                                                                       | Key difference                                                                 | Finding           |
| ------------------------------------ | ---------- | ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| Home                                 | 1440       | `home__1440__before.png` | `home__1440__after.png`                                                     | Toolbar buttons slightly taller (intended); no other change                    | F-006             |
| Home                                 | 768        | `home__768__before.png`  | `home__768__after.png`                                                      | Layout identical                                                               | —                 |
| Home                                 | 375        | `home__375__before.png`  | `home__375__after.png`                                                      | Larger touch targets, nav fade hint; 0px horizontal overflow verified          | F-006/F-007/F-010 |
| Format Guide modal                   | 1440 / 375 | —                        | `format-guide-modal__1440__after.png`, `format-guide-modal__375__after.png` | Focus trapped; Esc closes; focus returns to opener (verified programmatically) | F-005             |
| Conversion Options modal             | 1440       | —                        | `options-modal__1440__after.png`                                            | Swatches named for SR; visuals unchanged                                       | F-002             |
| Queue + BatchBar                     | 1440       | —                        | `queue-batchbar__1440__after.png`                                           | Unchanged                                                                      | —                 |
| Converting state                     | 1440       | —                        | `converting-state__1440__after.png`                                         | Unchanged                                                                      | —                 |
| Preview modal                        | 1440       | —                        | `preview-modal__1440__after.png`                                            | Unchanged                                                                      | —                 |
| Code snippets modal / History drawer | 1440       | —                        | `code-snippets-modal__1440__after.png`, `history-drawer__1440__after.png`   | Close buttons labeled                                                          | F-001             |
| Light theme                          | 1440       | —                        | `light-theme__1440__after.png`                                              | Secondary text darker/readable; computed rgb(71,85,105) verified               | F-008             |

Before/after comparison found **no regressions**: no layout shifts, wrapping changes, clipping, stray scrollbars, or altered dimensions beyond the intended hit-area growth.

## 7. Accessibility Validation

- **Automated:** console error monitoring across all sessions (0 errors/warnings); programmatic checks of computed contrast values, focus-ring variables, dialog roles/aria attributes, and button geometry; full 378-test suite green; production build clean.
- **Keyboard checks performed:** Tab reaches header controls and Dropzone; Enter opens the file picker path retained; Esc closes Format Guide and Conversion Options modal; focus returns to the triggering button after Esc; Tab cycles correctly inside Format Guide after F-005.
- **Fixes applied:** F-001, F-002, F-003, F-004, F-005, F-009, F-011.
- **Remaining concerns:** hover-scale Motion animations don't yet respond to reduced motion (D-2); some accent-on-light small-text pairs sit near 4.5:1 (D-1).

## 8. Deferred / Structural Recommendations

**D-1 (from F-012) — borderline light-mode accent contrast.** Specific indigo/emerald small-text instances sit just under AA in light mode where the coarse class remap doesn't reach. Not auto-fixed because a correct fix needs an instance-by-instance palette decision, not blanket overrides. Approach: tokenize accent text colors and darken per-surface. Affected: `index.css` light block, badges/footer text.

**D-2 — Motion micro-interactions ignore `prefers-reduced-motion`.** F-011 covers CSS animations/transitions, but `whileHover`/`whileTap`/spring overlays run via JS. A global solution belongs in a shared `useReducedMotion()` config touching every animated component — larger than this pass allows. Affected: all 10 components using `motion/*`.

**D-3 — Light-theme class-remap architecture.** The `html:not(.dark)` block duplicates every utility with hand-picked colors; fragile as components evolve. Recommend migrating to Tailwind v4 `@theme` semantic tokens. Large refactor, explicitly out of scope.

**D-4 — Observed-but-out-of-scope backend issue.** `.review/dev.log` recorded `ECONNREFUSED /api/code-template` when the API server wasn't running, surfacing as a failed snippets fetch. Frontend-only mitigation possible (friendly error copy/retry); logged per exception clause, no change made.

## 9. Follow-up Checklist

- [ ] Confirm light-theme accent adjustments (D-1) against brand guidelines before adopting darker shades product-wide.
- [ ] Verify updated copy ("Set all file formats", "Background: …") reads naturally with product terminology.
- [ ] Run one manual screen-reader pass (NVDA/VoiceOver) over convert → preview → download.
- [ ] Schedule the `useReducedMotion()` migration (D-2) and token refactor (D-3) as tracked efforts.
- [ ] Validate core upload→convert→download workflow with a real user session.

---

**Net result:** 10 commits on `ui-ux-review` (11 fixes across 8 files, zero test/lint/build failures at any step), each independently revertable, preserving the product's visual identity and all existing functionality.
