<div align="center">

# FormatShift

**Universal File Conversion for Images, Audio, Video, Documents & Data**

A browser-first conversion application built with **React 19**, **TypeScript**, and **Express**. FormatShift converts files locally in the browser when possible using Canvas, Web Audio, and browser APIs — and falls back to a hardened **FFmpeg** server pipeline for formats that require native codecs or seekable media output.

**Private by default · Batch processing · Live previews · Conversion history · ZIP downloads**

</div>

<p align="center">
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/nishanth-kkj9/format-shift/ci.yml?branch=main&label=CI">
  <img alt="Coverage" src="https://img.shields.io/codecov/c/github/nishanth-kkj9/format-shift">
  <img alt="License" src="https://img.shields.io/github/license/nishanth-kkj9/format-shift">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D22-green">
</p>

---

## Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Supported Formats](#-supported-formats)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Security & Resource Handling](#-security--resource-handling)
- [Testing & CI](#-testing--ci)
- [Docker](#-docker)
- [Project Structure](#-project-structure)
- [Roadmap](#-roadmap)
- [License](#-license)

---

## ✨ Features

### Conversion

- **Batch conversion** — queue multiple files and convert them together.
- **Automatic format detection** — identifies image, audio, video, data, and document categories from file type and extension.
- **Per-file & global target formats** — set an output format per file or apply one target across the queue.
- **Browser-first processing** — common conversions run locally without an API upload.
- **FFmpeg fallback** — server-side processing for formats that need native codecs.
- **Video → audio extraction** — extract MP3, WAV, OGG, AAC, M4A, and FLAC from video.
- **Code templates** — generate source-aware Python, Node.js, and HTML examples via the API.

### Image Tools

| Capability | Description                                                  |
| ---------- | ------------------------------------------------------------ |
| Formats    | PNG, JPG/JPEG, WEBP, GIF, BMP, ICO, SVG, AVIF                |
| Quality    | Configurable output quality (1–100)                          |
| Resize     | Max width/height with aspect-ratio preservation              |
| Transform  | Rotation (0/90/180/270), horizontal/vertical flip, grayscale |
| Presets    | Social-media sizes and 32×32 favicon                         |

### Audio Tools

| Capability  | Description                                    |
| ----------- | ---------------------------------------------- |
| Formats     | MP3, WAV, OGG, AAC, M4A, FLAC                  |
| Bitrate     | 128k – 320k                                    |
| Sample rate | 8k – 96kHz                                     |
| Channels    | Mono / Stereo                                  |
| Effects     | Volume adjustment (0–200%), start/end trimming |

### Video Tools

| Capability  | Description                              |
| ----------- | ---------------------------------------- |
| Formats     | MP4, WEBM, GIF, MOV, MKV, AVI            |
| Resolutions | 360p, 480p, 720p, 1080p, original        |
| FPS         | 1 – 120                                  |
| Extraction  | Video → audio (MP3/WAV/OGG/AAC/M4A/FLAC) |

### Data & Document Tools

- JSON, CSV, TSV, XML, and YAML conversions.
- RFC-4180 CSV/TSV parsing with quoted-field and multiline handling.
- Markdown/text → HTML conversion.
- PDF is **not** supported as input or output — requests return an explicit error rather than a fake file.

### UX

- Drag-and-drop upload queue with per-file progress.
- Live image/audio/video previews.
- Conversion options modal.
- History persisted in `localStorage` with re-download.
- Batch ZIP download.
- Dark/light theme.
- Lazy-loaded heavy modal components to keep the initial bundle small.
- Object URL cleanup to prevent preview memory leaks.

---

## 🏗️ Architecture

```text
┌─────────────────────────────── Browser ───────────────────────────────┐
│                                                                       │
│  Dropzone → File Detection → Conversion Queue → Options / Preview     │
│                                  │                                    │
│                    ┌─────────────┴─────────────┐                      │
│                    │                           │                      │
│             Browser Conversion           Server Conversion           │
│             Canvas / Web Audio             HTTP multipart             │
│             Media APIs                    /api/convert                │
│                    │                           │                      │
│                    │                     Busboy streaming             │
│                    │                           │                      │
│                    │                         ffmpeg                    │
│                    │                           │                      │
│                    └──────────────┬────────────┘                      │
│                                   │                                   │
│                          Converted Blob/File                          │
│                                   │                                   │
│                        Preview → History → Download                   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Client-Side Path

The frontend contains category-specific conversion modules:

- `convertImage.ts` — HTML5 Canvas image processing.
- `convertAudio.ts` — Web Audio API decoding, trimming, gain, resampling, and WAV encoding.
- `convertVideo.ts` — browser video/canvas processing where supported.
- `convertData.ts` — JSON/CSV/TSV/XML/YAML/text transformations.

All targets are defined **once** in `src/core/conversionRegistry.ts`; the UI, detection, server endpoint, and code templates all derive from it, so the app never advertises a conversion it cannot genuinely perform.

### Server-Side Path

- `server/upload.ts` — streams multipart files to randomized temp filenames with strict pre-file category validation.
- `server/ffmpeg/` — the FFmpeg pipeline: runner, filters (image), audio, video.
- `server/convert.ts` — orchestrates the pipeline and derives allowed targets from the shared registry.
- `server/routes/convert.ts` — streams results back and cleans up temp files.
- `server/routes/templates.ts` — generates source-aware code examples.

---

## 📦 Supported Formats

| Category     | Targets                                          | Browser engine            | Server (FFmpeg) engine                             |
| ------------ | ------------------------------------------------ | ------------------------- | -------------------------------------------------- |
| **Image**    | JPG, JPEG, PNG, WEBP, SVG, GIF, BMP, ICO, AVIF   | JPG, JPEG, PNG, WEBP, SVG | GIF, BMP, ICO, AVIF (+ any browser target via API) |
| **Audio**    | WAV, MP3, OGG, AAC, M4A, FLAC                    | WAV                       | MP3, OGG, AAC, M4A, FLAC                           |
| **Video**    | MP4, WEBM, MOV, MKV, AVI, GIF + audio extraction | —                         | All                                                |
| **Data**     | JSON, CSV, TSV, XML, YAML                        | All                       | —                                                  |
| **Document** | TXT, MD, HTML                                    | All                       | —                                                  |

### Server Upload Limits

Server-side uploads are limited by category:

| Category | Maximum Upload Size |
| -------- | ------------------: |
| Image    |               50 MB |
| Audio    |              100 MB |
| Video    |              200 MB |
| Document |               10 MB |
| Data     |               10 MB |

The multipart parser also enforces an overall **200 MB** Busboy file-size limit as defense-in-depth.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 22 or newer**
- npm
- A modern browser with Canvas/Web Audio/media API support

The app uses `ffmpeg-static` as a dev-time fallback, so a system FFmpeg is **not required** for local development.

### Install & Run

```bash
git clone https://github.com/nishanth-kkj9/format-shift.git
cd format-shift
npm install
```

Run frontend and API together:

```bash
npm run dev:all
```

Or run them separately:

```bash
npm run dev      # Vite dev server → http://localhost:5173
npm run server   # Express API      → http://localhost:4000
```

### NPM Scripts

| Command                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Start the Vite development server                            |
| `npm run server`       | Start the Express API with `tsx`                             |
| `npm run dev:all`      | Start Vite and Express together                              |
| `npm run build`        | Build the frontend and bundle the API into `dist/server.cjs` |
| `npm start`            | Start the production server                                  |
| `npm run preview`      | Preview the Vite production build                            |
| `npm run typecheck`    | TypeScript type-check (`tsc --noEmit`)                       |
| `npm run lint`         | ESLint                                                       |
| `npm run format:check` | Prettier check                                               |
| `npm test`             | Run the Vitest test suite                                    |
| `npm run test:e2e`     | Build + Playwright end-to-end tests                          |

---

## 🔌 API Reference

### Health Check

```http
GET /api/health
```

Returns status, app name, timestamp, and FFmpeg concurrency metrics.

### Readiness

```http
GET /api/ready
```

Reports whether the resolved FFmpeg binary meets the configured feature floor (`FFMPEG_MIN_FEATURE_VERSION`) and security-patch floor (`FFMPEG_MIN_SECURITY_VERSION`). Returns `200` when ready, `503` otherwise.

### Convert a File

```http
POST /api/convert
Content-Type: multipart/form-data
X-Category: image|audio|video|document|data
```

Because per-category upload caps must be selected **before** the multipart file bytes arrive, every request must include a valid category in pre-file metadata — either the `X-Category` header **or** the `?category=` query parameter. Missing, unknown, or mutually conflicting header/query categories are rejected with `400` before any file bytes are accepted.

Multipart fields:

| Field          | Required | Description                                      |
| -------------- | -------- | ------------------------------------------------ |
| `file`         | Yes      | Source file                                      |
| `category`     | Yes      | `image`, `audio`, `video`, `document`, or `data` |
| `sourceFormat` | Optional | Source extension/format                          |
| `targetFormat` | Yes      | Requested output format                          |
| `options`      | Optional | JSON-encoded conversion options                  |

Successful responses return the converted binary with an appropriate `Content-Type` and an attachment filename. Common client errors return a JSON payload with an `error` message and a `requestId`.

The endpoint is rate-limited to **30 requests/minute/IP** plus a **60 req/min** aggregate backstop (both per server process).

### Code Templates

```http
POST /api/code-template
Content-Type: application/json
```

```json
{
  "category": "image",
  "sourceFormat": "png",
  "targetFormat": "webp"
}
```

Returns source-aware Python, Node.js, and HTML examples. JSON sources generate JSON-parsing snippets; CSV/TSV sources generate delimiter-aware CSV/TSV parsing snippets.

---

## 🔐 Security & Resource Handling

FormatShift is built with a defense-in-depth posture for file-processing workloads:

- **Streaming uploads** — multipart files are streamed to randomized temp filenames, never buffered fully in memory.
- **Fail-closed category contract** — per-category caps are enforced during streaming; missing/unknown/conflicting pre-file metadata is rejected with `400` before bytes are accepted.
- **Magic-byte validation** — file signatures are checked with `file-type` for binary categories; `application/octet-stream` cannot bypass allowlists.
- **Strict option allowlist** — the convert API accepts only known option keys (Zod `.strict()`). Unknown keys such as `-map` are rejected, never forwarded to FFmpeg.
- **FFmpeg safety** — a bounded concurrency semaphore + queue (over capacity → `503`), a hard timeout (`504`), and output-size caps (`413`), with cleanup on success, error, and client disconnect.
- **FFmpeg version policy** — `/api/ready` verifies both a feature floor and a security-patch floor (defaults `4.2.0` / `5.1.9`).
- **Header hardening** — served via Helmet with CSP, `X-Frame-Options: DENY`, `nosniff`, and strict referrer policy.
- **Sanitized errors** — FFmpeg stderr is stripped of absolute paths and memory addresses; every error carries a `requestId`.
- **Container hardening** — the Docker image runs as a **non-root** user and pins immutable GitHub Action SHAs in CI.

> **Deployment note:** rate limits use an in-process store, so they are per server process. The shipped deployment is a single container where the quotas hold exactly as documented. If you scale to multiple replicas, move rate limiting to a shared store (e.g., Redis) first.

---

## 🧪 Testing & CI

The repository ships a substantial automated test suite:

- **Unit tests** — conversion option validation, FFmpeg argument builders, image/audio/video filters, upload parsing.
- **Integration tests** — real streamed PNG/audio/video conversions through the Express app, per-category size limits, magic-byte rejection, temp-file cleanup, code-template source-awareness, and environment-config enforcement.
- **E2E tests** — Playwright browser coverage.

### CI Pipeline (GitHub Actions)

| Job                | Steps                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **quality**        | `npm ci`, lockfile drift check, typecheck, lint, format check, build |
| **test**           | Full Vitest suite with V8 coverage → Codecov                         |
| **security-audit** | `npm audit --audit-level=high`                                       |
| **docker**         | Multi-stage image build + Trivy scan for HIGH/CRITICAL               |

Releases are published from a separate `docker-release.yml` workflow: on a `v*` tag push it builds and pushes `ghcr.io/<owner>/format-shift` for `linux/amd64` and `linux/arm64`, and creates a GitHub Release with auto-generated notes.

Run the full local validation:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
npm run test:e2e
```

---

## 🐳 Docker

```bash
docker build -t formatshift .
docker run --rm -p 4000:4000 formatshift
```

Then open `http://localhost:4000`.

The production image:

- Uses `node:22-slim` with system FFmpeg (`FFMPEG_PATH=/usr/bin/ffmpeg`) — glibc-compatible, unlike ffmpeg-static's musl binaries.
- Installs runtime dependencies only (`npm ci --omit=dev`) and drops the npm CLI to reduce CVE surface.
- Runs as a non-root `app` user.
- Exposes a healthcheck against `/api/ready`.

---

## 📁 Project Structure

```text
format-shift/
├── .github/workflows/
│   ├── ci.yml              # quality, test, audit, docker + trivy
│   └── docker-release.yml  # GHCR publish on v* tags (amd64 + arm64)
├── e2e/                    # Playwright end-to-end tests
├── server/
│   ├── main.ts             # entry point (tsx dev / bundled prod)
│   ├── app.ts              # Express app assembly (helmet, rate limits)
│   ├── config.ts           # Zod-validated environment config
│   ├── convert.ts          # conversion orchestration + option validation
│   ├── upload.ts           # streaming multipart parser (fail-closed)
│   ├── ffmpeg/
│   │   ├── runner.ts       # semaphore, queue, timeout, output caps
│   │   ├── audio.ts        # audio encode / video→audio args
│   │   ├── video.ts        # container conversion args
│   │   └── filters.ts      # image filter args
│   └── routes/
│       ├── convert.ts      # /api/convert streaming response
│       └── templates.ts    # /api/code-template source-aware snippets
├── src/
│   ├── core/conversionRegistry.ts   # single source of truth for targets
│   ├── components/         # Dropzone, FileList, modals, drawers…
│   ├── hooks/              # shared hooks (e.g. useDialogFocus)
│   ├── utils/              # convertImage/Audio/Video/Data, serverConvert
│   ├── types.ts
│   ├── App.tsx
│   └── main.tsx
├── Dockerfile
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## License

Released under the [MIT License](LICENSE).

## 👤 Author

Built by **Nishanth Kkj9** · [format-shift](https://github.com/nishanth-kkj9/format-shift)
