# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `ReducedMotionProvider`: a single `MotionConfig` mounted at the app root so the
  JS-driven `motion/react` animations (springs, `whileHover`/`whileTap`) honor
  `prefers-reduced-motion`, complementing the existing CSS animation guard.
- Category-aware offline starter templates in the code-snippets modal: when
  `/api/code-template` is unreachable the fallback now matches the selected file
  type (ffmpeg for media, csv/json for data, Markdown for documents) instead of
  always suggesting an image toolchain, and the modal labels them as generic.
- Tests for the snippets fallback + tab semantics, and pressed-state coverage for
  the options modal flip toggles.

### Fixed

- CI `docker` job: the Trivy HIGH/CRITICAL gate failed on 2026-09-18 with the
  image building successfully, because the pinned `node:22.23.2-slim` base image
  (last rebuilt 2026-08-25) carried Debian packages that had since received
  security fixes. The runtime stage now applies `apt-get upgrade` so the shipped
  layer carries current security patches, and the scan report is published to the
  job summary so a failure names the offending package.
- Light mode: the header scroll affordance no longer smears a dark slate gradient
  across the light sticky header.
- Light mode: all five overlay backdrops now share one scrim treatment, tuned to
  45% instead of a near-black 75% (previously the drawer used a white scrim while
  the four modals stayed dark).
- Light mode: the file progress track renders as a light inset groove instead of a
  black bar inside a white card.
- Light mode: the "Shift" wordmark gradient is darkened for AA contrast
  (previously ~2.8:1 against light glass).
- Code-snippets language tabs now expose `tablist`/`tab`/`aria-selected` with
  arrow-key navigation; the flip toggles in the options modal report `aria-pressed`.

### Changed

- Design-system `MASTER.md` palette and typography synced to the shipped UI
  (indigo accent, DM Sans) instead of the stale green/Satoshi values.
- `.env.example` documents `CODE_TEMPLATE_RATE_LIMIT_MAX`.

## [0.1.0] - 2026-08-16

### Added

- Security hardening: helmet with CSP, opt-in HSTS, per-IP and global rate
  limits, forced `Content-Disposition: attachment` + `nosniff` on converted
  files.
- OWASP-style option allowlist (zod `.strict()`) — unknown option keys are
  rejected instead of being passed through to ffmpeg.
- Environment validation at boot via zod (`server/config.ts`), with a
  documented `.env.example`.
- ESLint + Prettier with `typecheck` / `lint` / `format` / `coverage` scripts.
- Frontend test suite for detection, metadata extraction, and the
  server-conversion client, with enforced coverage thresholds.
- CI: split quality / test / security-audit / docker+trivy jobs, Codecov
  upload, dependabot.
- Multi-arch (amd64 + arm64) Docker images with a non-root user, healthcheck,
  and system ffmpeg (`FFMPEG_PATH`).
- MIT LICENSE, CONTRIBUTING, CHANGELOG, CODE_OF_CONDUCT, and issue templates.

### Changed

- Split `server.ts` into `server/app.ts` (Express app) + `server/main.ts`
  (listen). Build entry is now `server/main.ts`.
- `ffmpeg-static` moved to devDependencies; the runtime image uses the system
  ffmpeg.
- Strict TypeScript (`strict`, `noUnusedLocals`, `noUnusedParameters`,
  `exactOptionalPropertyTypes`, `noImplicitReturns`, …).
- Root visualizer smoke-test scripts moved to `tests/visualizer/`.

### Removed

- Duplicate `vite` entry in `dependencies` and the `bun.lock` file (npm is the
  single lockfile source).
- `.vscode/` from version control.
- AI Studio `DISABLE_HMR` scaffolding from `vite.config.ts`.
