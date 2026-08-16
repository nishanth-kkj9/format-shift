# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
