# Implementation Plan

## Full-Matrix Correctness Audit — Formats, Frontend, Endpoints

### [Overview]

Prove that **every conversion the registry advertises actually works end-to-end on its declared engine**, that **every endpoint honors its documented contract**, and that the **frontend presents the format space honestly and accessibly** — then fix every discrepancy found. No new formats, categories, endpoints, or features will be added (user decision: "Audit & fix only").

Scope is grounded in the current facts of the repo (branch `main` @ `19032c1`, all CI green):

- **Conversion matrix (single source of truth: `src/core/conversionRegistry.ts`)** — 220 source→target pairs across 5 categories:
  - `image`: 9 sources (png, jpg, jpeg, webp, gif, bmp, ico, svg, avif) × 9 targets (jpg, jpeg, png, webp, svg = browser; gif, bmp, ico, avif = server) = 81 pairs
  - `audio`: 7 sources (mp3, wav, ogg, aac, m4a, flac, weba) × 6 targets (wav = browser; mp3, ogg, aac, m4a, flac = server) = 42 pairs
  - `video`: 6 sources (mp4, webm, mov, avi, mkv, flv) × 12 targets (mp4, webm, mov, mkv, avi, gif + audio extraction mp3, wav, ogg, aac, flac, m4a; all server) = 72 pairs
  - `data`: 3 sources (json, csv, tsv) × 5 targets (json, csv, tsv, xml, yaml; all browser) = 15 pairs
  - `document`: 4 sources (txt, md, html, htm) × 3 targets (txt, md, html; browser), minus 2 exclusions (html/htm → md) = 10 pairs
  - Split: **143 server-engine pairs** (real ffmpeg) and **77 browser-engine pairs** (Canvas/WebAudio/string transforms).
- **Endpoints (4 API + static)**: `GET /api/health`, `GET /api/ready`, `POST /api/convert` (multipart; category via `?category` + `x-category`; rate limits 30/min/IP and 60/min global, skipped in `NODE_ENV=test`), `POST /api/code-template` (JSON, 10 kB limit, `CODE_TEMPLATE_RATE_LIMIT_MAX` default 120), plus static `dist/` serving with SPA fallback that exempts `/api/*`, `/robots.txt`, `/sitemap.xml`.
- **Frontend**: 13 components; `formatMeta.ts` covers all 5 categories; theme = Tailwind v4 dark-first + `html:not(.dark)` remap layer (audited in `docs/ui-ux-review.md` §10); a11y baseline in place (F-001…F-016).
- **Current test state**: 28 test files / 390 tests; e2e covers only the image→ico path; integration tests cover a _subset_ of conversions — **no generated full-matrix test exists**, which is the central gap this plan closes.

**Known suspected defects the audit is expected to confirm** (from code inspection; each has a prepared fix inside existing feature scope):

1. **SVG sources → server-engine image targets (gif, bmp, ico, avif) likely fail at runtime.** The frontend routes them to the server (`needsServerEngine`), but Debian's ffmpeg build has no SVG decoder (`librsvg` is not a ffmpeg dependency), so `svg → gif` etc. should fail while `svg → jpg/jpeg/png/webp` (browser) works. Fix: add `excludedTargetsBySource: { svg: ["gif", "bmp", "ico", "avif"] }` to the registry — the honest exclusion, consistent with the existing `html → md` precedent.
2. **AVIF output under Debian's ffmpeg 5.1** — verify `libaom-av1` muxing produces a decodable AVIF (matrix test asserts `ftyp` box with `avif` brand, not just nonzero bytes).
3. **Document pair semantics are under-defined** — `md → html` exists (`markdownToHtml`), but `txt → md`, `txt → html`, `md → txt`, `html → txt` need explicit expected behavior defined and verified (passthrough vs. tag stripping), with the OWASP output-guard applied to every text target.
4. **Unknown `/api/*` routes return Express's default HTML 404**, inconsistent with the JSON API contract. Fix: JSON 404 for unmatched API routes.

Approach: build the audit on top of the existing single source of truth — generate the matrix _from the registry_ so the test suite and the app can never disagree, run the 143 server pairs against real ffmpeg with tiny per-format fixtures, prove the 77 browser pairs at the unit layer, contract-test every endpoint, and reconcile the frontend surfaces (`formatMeta`, `FormatGuide`, option-modal capability gating, `FormatDropdown`) against the registry. All fixes are data edits, small derivations, or honest exclusions — no new capability.

### [Types]

All new types are test/audit-side. Production types change only if the audit forces a registry data edit (values, not shapes).

- `src/server-test/types.ts` (new, shared by matrix tests):
  - `export interface MatrixPair { category: FileCategory; source: string; target: string; engine: ConversionEngine; expectedMime: string; }` — one row of the full 220-pair matrix, derived from `CONVERSION_REGISTRY` + `planConversion(category, target, source)`.
  - `export interface SourceFixture { filename: string; mimetype: string; bytes: Buffer | string; }` — a minimal valid source file for one (category, source).
  - `export interface OutputProbe { minBytes: number; magic?: (head: Buffer) => boolean; }` — per-target output validator. `magic` asserts format identity beyond "nonzero bytes" (e.g. `RIFF….WAVE` for wav, `GIF8` for gif, `ftyp` box with `avif`/`isom`/`qt ` brand for mp4/avif/mov, `OggS` for ogg, `ID3`/`0xFFFB` for mp3, `fLaC` for flac, `BM` for bmp, `00 00 01 00` for ico, `<?xml`/`<` for xml, `}`/`[`/`[`-detection for json, YAML/TSV/text heuristics for the text targets).
  - `export type FixtureSet = Map<string, SourceFixture>;` keyed by `${category}/${source}`.
- `scripts/generate-format-matrix.mjs` (new): no new types; imports the esbuild-bundled registry and emits `docs/format-matrix.md` tables (`| category | source | target | engine | mime |`).
- `server/app.ts` JSON-404 handler: response shape `{ error: string }` — matches every existing error response (`{ error: ... }`), no schema change.
- **Registry edits (data only, if audit confirms finding 1):** `excludedTargetsBySource` gains `{ svg: ["gif", "bmp", "ico", "avif"] }`; the `ConversionPlan.reason` strings already cover it. Pair count becomes 220 − 4 = **216**.

### [Files]

**New files**

- `server/testFixtures.ts` — pure module (eligible for the coverage gate): minimal, valid source files per (category, source) and per-target output probes. Binary fixtures are **generated at test setup via the ffmpeg `-f lavfi` sources** already proven by the integration suite (8×8 `color`/`testsrc` images, 0.3 s `sine`/`sine+color` audio and video), so every fixture is real and decode-verified by ffmpeg itself; text formats (svg, txt, md, html, json, csv, tsv) are inline string literals. Mimetypes/extensions are consistent with `server/upload.ts`'s `ALLOWED_MIME` and `MIME_SOURCE_FALLBACK`.
- `server/matrix.test.ts` — registry-generated full-matrix integration test. Phase A (static, no ffmpeg): the generated pair list matches the expected pair count and every pair passes `planConversion`. Phase B (server pairs, 143 → 139 if the SVG exclusion lands): `it.each` over every server-engine pair through the Express app using the same multipart helpers as `server/integration.test.ts`, asserting HTTP 200, `content-type` = registry MIME, `content-disposition: attachment`, `x-content-type-options: nosniff`, `bytes.length ≥ probe.minBytes`, and `probe.magic(head)` where defined. Phase C (browser pairs): runtime assertions for the 77 browser pairs via the unit harness (see [Testing]).
- `src/core/consistency.test.ts` — zero-ffmpeg drift tests pinning every surface to the registry:
  1. every `sourceFormats` entry resolves through the upload MIME map or `MIME_SOURCE_FALLBACK`;
  2. every target has `engine` ∈ {browser, server}, a MIME, and — for server targets — a codec mapping in `AUDIO_CODECS` / `VIDEO_CODECS` / the `imageArgs` codec table (`svg` asserted absent there);
  3. every (category, target) has a `FORMAT_META` entry (`src/components/formatMeta.ts`);
  4. `ACCEPTED_EXTENSIONS` ≡ all registry targets minus `svg`;
  5. `convertImage`'s browser/server target sets ≡ the registry (after the derivation refactor);
  6. `convertAudio` accepts exactly the registry's browser audio targets;
  7. `SERVER_OPTION_KEYS` ≡ `OPTIONS_SCHEMA` keys (existing contract test retained);
  8. capability flags (`quality`, `resize`, `preview`, `audioExtract`) agree with the option modal's UI-gating behavior tests;
  9. `FormatGuide` documents all five categories;
  10. every `excludedTargetsBySource` entry references a real target, and no excluded target remains reachable from that source (html/htm → md, svg → server targets).
- `scripts/generate-format-matrix.mjs` — generates `docs/format-matrix.md` from the registry (bundled to a temp CJS file with the already-present `esbuild` devDependency, imported, rendered as Markdown tables grouped by category with engine and MIME columns).
- `docs/format-matrix.md` — generated, human-readable matrix with a "generated file" header; the at-a-glance deliverable for "all formats working correct in each category".

**Modified files**

- `src/core/conversionRegistry.ts` — **data edit only, pending audit confirmation:** add the `svg` source exclusions (finding 1). No shape changes.
- `src/utils/convertImage.ts` — replace the hand-maintained `BROWSER` / `SERVER_ONLY` arrays with sets **derived from the registry** (`getAvailableTargets("image")` filtered by `needsServerEngine`), keeping the exported names used by existing tests. Removes an entire drift class; behavior identical.
- `src/components/FormatGuide.tsx` — add the two missing sections: **Video Formats** (6 containers; 6 outputs + "extract audio to MP3/WAV/OGG/AAC/FLAC/M4A"; resolution/fps/mute; GIF palette note) and **Document Formats** (txt/md/html/htm; no-PDF honesty note; html→md exclusion), reusing the existing section markup.
- `server/app.ts` — after the two API routers, before static serving: `app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));` so unknown API paths and wrong-method requests answer JSON, not Express's HTML 404.
- `e2e/app.e2e.ts` — three new flows via the existing sample buttons, one per uncovered category/engine: **audio → mp3** (server path), **data → csv** (browser), **document → html** (browser). Reuses the keyboard/listbox helpers already in the file.
- `vitest.config.ts` — add `server/testFixtures.ts` to the coverage `include` list.
- `package.json` — add `"matrix:docs": "node scripts/generate-format-matrix.mjs"`.
- `CHANGELOG.md`, `docs/ui-ux-review.md` — record audit results and fixes (final phase).

**Files NOT modified (deliberate):** no new dependencies; `server/ffmpeg/*` only if the matrix run surfaces a broken arg builder; `server/upload.ts` only if the audit finds a MIME/source gap (inspection shows flv/weba/avif already covered); `src/utils/convertData.ts` only if pair semantics fail their newly defined expectations; no new formats, categories, or endpoints.

### [Functions]

**New functions**

- `buildSourceFixture(category: FileCategory, source: string): SourceFixture` — in `server/testFixtures.ts`. Returns the inline definition for one source; binary sources carry an ffmpeg `lavfi` generation recipe (`-f lavfi -i color=c=gray:s=8x8:d=0.1` / `sine`, correct `-f` muxer and codec per format), text sources return their string payload.
- `generateAllFixtures(): Promise<FixtureSet>` — in `server/testFixtures.ts`. Runs the ffmpeg recipes once into a per-run temp dir (`os.tmpdir()` + unique suffix), returning every source fixture keyed `category/source`. Called from `beforeAll`; throws with a diagnostic if ffmpeg is unavailable (the runner's `ffmpeg-static` fallback makes this effectively always available in dev/CI).
- `outputProbe(category: FileCategory, target: string): OutputProbe` — in `server/testFixtures.ts`. Static map per target: `minBytes` and, where meaningful, a `magic` predicate over the first 32 bytes.
- `buildMatrixPairs(): MatrixPair[]` — in `server/matrix.test.ts`. Walks `CONVERSION_REGISTRY`: for each category × source ∈ `sourceFormats` × target ∈ `getAvailableTargetsForSource(category, source)`, emits a pair with `engine` from the target spec and `expectedMime` from `getMimeForTarget`. Single generator used by both the static and runtime phases, so the test and the app cannot diverge.
- `toMultipart(category: FileCategory, pair: MatrixPair, fixture: SourceFixture): FormData` — reuse/extract the multipart construction already in `server/integration.test.ts` so both suites share one request shape (`?category`, `x-category`, `sourceFormat`, `targetFormat`, optional per-pair default options).
- `publishMatrixDoc(registry: typeof CONVERSION_REGISTRY): string` — in `scripts/generate-format-matrix.mjs`; renders the Markdown and writes `docs/format-matrix.md`.
- `apiNotFound` handler (inline in `server/app.ts`) — `(_req: Request, res: Response) => res.status(404).json({ error: "Not found" })`.

**Modified functions**

- `convertImage(...)` in `src/utils/convertImage.ts` — unchanged behavior; its `SERVER_ONLY` / `BROWSER` constants become registry-derived (see Files). Existing tests keep passing by name.
- `convertDataDocument(...)` in `src/utils/convertData.ts` — only if the audit's newly defined document-pair expectations fail (e.g. `html → txt` should strip tags rather than dump markup; `txt → md` passthrough is acceptable and will be asserted as such). Any change stays within the existing export surface and OWASP guard behavior.
- `getFFmpegVersion`-guarded test setup — `server/matrix.test.ts` reuses `server/integration.test.ts`'s existing app/listen harness; if that harness is inline, extract it into a shared helper (`server/testApp.ts`) so both suites use one implementation. Decision made during implementation; no behavior change.
- `validateOptions` in `server/convert.ts` — no range changes expected; touched only if the matrix run proves a needed correction.

**Removed functions:** none.

### [Classes]

None. The codebase is functional (React components + pure modules); server-side error classes (`NoAudioStreamError`, `UnsupportedFormatError`, `UnsupportedConversionError`, `InvalidOptionError`, `UploadError`, `ServerBusyError`, `FFmpegTimeoutError`, `OutputLimitError`) already exist and are reused as-is by the matrix test's negative expectations. No new classes, no inheritance changes.

### [Dependencies]

**None added.** Everything required is already present:

- `ffmpeg-static` (devDependency) — used by the ffmpeg runner's fallback so the matrix test runs on any dev machine and in CI's `test` job without a system ffmpeg.
- `esbuild` (devDependency, already used by `npm run build`) — used by `scripts/generate-format-matrix.mjs` to bundle the TS registry for the Node script.
- `file-type`, `zod`, `express` — existing runtime deps exercised by the tests.
- No version bumps, no lockfile changes → the `Lockfile check` and `npm audit --audit-level=high` CI steps are unaffected.

### [Testing]

**1. Registry-generated server matrix — `server/matrix.test.ts` (the core deliverable)**

- Generated via `buildMatrixPairs()`; the static phase asserts the pair-list size (220, or 216 after the SVG exclusion) and that every pair passes `planConversion(category, target, source)`.
- Runtime phase covers every **server-engine** pair (143, or 139 after SVG exclusion) through the real Express app with real ffmpeg, exactly the way `server/integration.test.ts` already runs conversions.
- Assertions per pair: HTTP 200; `content-type` equals the registry MIME; `content-disposition: attachment`; `x-content-type-options: nosniff`; `bytes.length ≥ probe.minBytes`; `probe.magic(head)` (RIFF/WAVE, GIF8, `ftyp` + brand for mp4/avif/mov, OggS, ID3/sync for mp3, fLaC, BM, `00 00 01 00` for ico, XML prolog, JSON/YAML/TSV heuristics); plus a round-trip check where an in-repo parser exists (JSON output re-parsed, CSV output re-read).
- Fixtures: generated once in `beforeAll` via ffmpeg `lavfi` (≈0.1–0.3 s media, 8×8 images), cached per run in a temp dir; text fixtures inline. Fixture generation must itself pass the upload validators — otherwise the pair result is meaningless.
- Negative expectations re-verified inside the matrix: `html → md` and (post-fix) `svg → {gif, bmp, ico, avif}` must 400 with the registry reason, and any `data`/`document` request aimed at the server engine must 400 (fail-closed) — proving the engine split is _enforced_, not just advertised.
- **Runtime budget / contingency:** ~139 ffmpeg runs at ≤1 s each with the existing 2-slot semaphore ≈ 90–150 s, roughly doubling the CI `test` job. If local measurement exceeds 3 min, split into `server/matrix.test.ts` (representative subset: one source per target per category ≈ 33 conversions, always on) and `server/matrix.full.test.ts` (all pairs) gated behind `MATRIX_FULL=1` with a dedicated CI step — decided in implementation phase 3 against real timings.

**2. Browser-engine pair proofs (77 pairs)**

- `data` (15) and `document` (10): pure-function tests over `convertDataDocument` in the existing jsdom suites — each pair gets explicit expected semantics first (e.g. `md→html` renders headings + sanitized links; `csv→tsv` preserves quoted fields; `txt→md/html` passthrough-with-guard), then asserted.
- `audio → wav` (7): extend the existing `convertAudio` jsdom tests to iterate every audio source (decode via the `AudioContext` mock already in place).
- `image` browser pairs (45): extend the existing `convertImage.test.ts` canvas-mocked harness to iterate source × {jpg, jpeg, png, webp, svg-wrapper}, asserting blob type and non-empty output. No new mocking infrastructure — the harness already stubs `canvas.toBlob`/`Image`.

**3. Consistency drift tests — `src/core/consistency.test.ts`**

- Pure and fast (no ffmpeg, no jsdom); runs in the default node environment beside `conversionRegistry.test.ts`. The ten assertions enumerated under [Files] turn every hand-maintained surface (formatMeta, FormatGuide, upload MIME map, codec maps, option-UI gating) into a contract with the registry.

**4. Endpoint contract additions**

- Unknown `/api/*` (GET/POST, e.g. `/api/nope`) → 404 JSON `{ error }` (after the fix), never HTML.
- Wrong method on `POST /api/convert` (e.g. GET) → JSON 404, never the SPA index fallback.
- `/robots.txt` and `/sitemap.xml` served from `dist` with the SPA fallback exempting them; `/api/health` (no version leak) and `/api/ready` (503 path) re-asserted where they already live.
- Folded into the existing `server/integration.test.ts` (or a new `server/api-contract.test.ts` if cleaner); rate-limit and error-path tests stay as-is.

**5. E2E additions — `e2e/app.e2e.ts`**

- Three flows (audio→mp3 server path, json→csv and md→html browser paths) using the sample buttons and existing keyboard/listbox helpers, asserting the converted item's Save control appears with the correct target badge. Keeps total e2e runtime inside the current job budget (~1 min).

**6. Generated documentation check**

- `npm run matrix:docs` regenerates `docs/format-matrix.md`; `consistency.test.ts` asserts the doc's category/pair numbers against the registry so the tables cannot silently rot. Optional CI doc-drift step can be added later without blocking.

**7. Coverage**

- Add `server/testFixtures.ts` to `vitest.config.ts` `include` (target ≥ 95%; it is pure data/logic). All existing per-file 80% gates keep passing; the new suites are additional files and do not change the gated list.

**8. Validation protocol (every phase)**

- `npm run typecheck && npm run lint && npm run format:check && npm test -- --run && npm run build && npm run test:e2e`
- The server matrix is additionally run with a system ffmpeg present AND via the `ffmpeg-static` fallback (both paths the runner supports).
- Final pass: `npm test -- --coverage` to confirm all per-file thresholds.

### [Implementation Order]

1. **Consistency drift tests first** (`src/core/consistency.test.ts`). Run them; each failure is an audit finding, recorded before any fix. Expected initial failures: FormatGuide missing video/document sections; possibly formatMeta or upload-map gaps.
2. **Fix the zero-ffmpeg findings**: derive `convertImage`'s target sets from the registry; extend `formatMeta`/`FormatGuide` where the drift tests flagged gaps. Drift tests go green.
3. **Build `server/testFixtures.ts`** (fixtures + probes) and self-test it: every generated fixture must pass the upload validators, under both ffmpeg resolution paths (system binary and `ffmpeg-static` fallback).
4. **Build `server/matrix.test.ts`** phases A+B; run locally with real ffmpeg. **This run produces the authoritative finding list** (svg-source server pairs expected to fail; AVIF muxing verified; any arg-builder surprises). Apply the prepared fixes — registry `svg` exclusions plus corrections for anything else the run surfaces — and re-run to green. Decide subset-vs-full split here against measured runtime.
5. **Browser-pair matrix** (phase C) for data/document/audio-wav/image pairs; touch `convertData.ts` only where a defined expectation fails.
6. **Endpoint contract tests + JSON 404** in `server/app.ts`; re-run the integration suite.
7. **E2E additions** for the audio/data/document flows; run `npm run test:e2e`.
8. **`scripts/generate-format-matrix.mjs` + `docs/format-matrix.md` + the `matrix:docs` npm script**, generated from the final registry state.
9. **Wrap-up**: coverage `include` update, `CHANGELOG.md` `[Unreleased]` entries, a dated audit section in `docs/ui-ux-review.md`, full validation protocol including coverage, then commit. `implementation_plan.md` itself stays an untracked working document unless you ask for it under `docs/`.

**Acceptance criteria** — the audit is complete when:

- every one of the 216–220 registry pairs has an automated pass assertion on its declared engine, or a documented registry-encoded exclusion with a 400 assertion;
- all 4 endpoints plus static serving carry explicit contract assertions, and API errors are JSON-shaped;
- zero drift is possible between the registry and the UI/option/codec surfaces without a failing test;
- `docs/format-matrix.md` reflects the true matrix, generated from code;
- the full validation protocol passes and CI (all 5 jobs) is green on the resulting commit.
