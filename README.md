<div align="center">

# FormatShift

### Universal File Conversion for Images, Audio, Video, Documents & Data

A browser-first conversion app built with React and TypeScript. FormatShift converts common files locally in the browser when possible and uses a server-side `ffmpeg` pipeline for formats that require native codecs or seekable media output.

**Private by default for browser conversions · Batch processing · Live previews · Conversion history · ZIP downloads**

</div>

---

## What is FormatShift?

FormatShift is a full-stack file conversion application designed around a **hybrid conversion architecture**:

1. A user drops one or more files into the browser.
2. FormatShift detects the file category and source format automatically.
3. Conversions that the browser can reliably perform stay **client-side** using Canvas, Web Audio, and browser APIs.
4. Formats that need `ffmpeg` are sent to the local/server API and processed with `ffmpeg-static`.
5. The converted result is returned to the browser for preview and download.

This approach reduces unnecessary uploads while still supporting media formats that browser APIs cannot reliably encode.

> **Privacy note:** browser-side conversions do not need to upload the source file. Server-side conversions necessarily send the selected file to the FormatShift API for processing. On the bundled server, uploaded files are written to a temporary directory and cleaned up after the request.

---

## ✨ Features

### Conversion

- **Batch conversion** — queue multiple files and convert them together.
- **Automatic format detection** — identifies image, audio, video, data, and document categories from the file type/extension.
- **Per-file target format** — each queued file can have its own output format.
- **Global target format** — apply one compatible target format to multiple queued files.
- **Browser-first processing** — common conversions run locally without an API upload.
- **FFmpeg fallback** — server-side processing for formats that need native codecs.
- **Video → audio extraction** — extract MP3/WAV and other supported audio formats from video.
- **Audio spectrum video** — create audio visualizer videos from audio files.

### Image tools

- PNG, JPG/JPEG, WEBP, GIF, BMP, ICO, SVG and AVIF targets in the UI.
- Quality control.
- Maximum width/height resizing.
- Aspect-ratio preservation.
- Rotation and horizontal/vertical flipping.
- Grayscale conversion.
- Background color handling.
- Social-media presets.
- Favicon preset at 32×32.

### Audio tools

- MP3, WAV, OGG, AAC, M4A and FLAC targets.
- Bitrate selection.
- Sample-rate selection.
- Mono/stereo selection.
- Volume adjustment.
- Start/end trimming.
- Audio spectrum visualizer with multiple visual styles/themes.

### Video tools

- MP4, WEBM, GIF, MOV, MKV and AVI targets.
- 360p, 480p, 720p and 1080p presets.
- FPS selection.
- Video-to-audio extraction.
- Audio spectrum video generation from audio input.

### Data & document tools

- JSON, CSV, TSV, XML and YAML conversions.
- JSON ↔ CSV/TSV/XML/YAML transformations.
- RFC-4180 CSV/TSV parsing with quoted-field and multiline handling.
- Markdown/text → HTML conversion.
- Plain-text, Markdown and HTML document targets (all browser-side).

> **Current implementation note:** data/document conversion is text-based and browser-side. There is no full PDF rendering engine, so PDF is accepted as an *input* source but is **not** offered as an output target — asking for a PDF target returns an explicit "unsupported" error rather than a fake file.

### UX

- Drag-and-drop upload queue.
- Per-file conversion progress.
- Live image/audio/video previews.
- Conversion options modal.
- Conversion history persisted in `localStorage`.
- Re-download from history.
- Batch ZIP download.
- Code snippets for Python, Node.js and browser JavaScript.
- Dark/light theme support.
- Lazy-loaded heavy modal components to reduce the initial frontend bundle.
- Object URL cleanup to reduce preview memory leaks.

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

### Client-side path

The frontend contains category-specific conversion modules:

- `convertImage.ts` — HTML5 Canvas image processing.
- `convertAudio.ts` — Web Audio API decoding, trimming, gain, resampling and WAV encoding.
- `convertVideo.ts` — browser video/canvas processing where supported.
- `convertData.ts` — JSON/CSV/TSV/XML/YAML/text transformations.
- `audioVisualizer.ts` — spectrum visualization/video generation.

### Server-side path

The Express API handles conversions requiring FFmpeg:

- `server/upload.ts` streams multipart files to temporary storage instead of buffering the complete upload in memory, writes to a randomized temp filename (never the client-provided name) and keeps the original name separately.
- `server/ffmpeg/` contains the FFmpeg pipeline: `runner.ts` (spawns ffmpeg, writes to a seekable temp file, kills the child on client disconnect), `filters.ts` (image), `audio.ts` (audio encode / video→audio), `video.ts` (container conversion).
- `server/convert.ts` orchestrates the pipeline and derives allowed targets from the shared conversion registry.
- `server/routes/convert.ts` streams the result back to the client and cleans up temp files after the request.
- `server/routes/templates.ts` generates code examples only for conversions the registry actually supports.

The upload layer also performs category-specific size checks and best-effort magic-byte MIME validation before conversion.

---

## 📦 Supported Formats

All targets below are defined once in `src/core/conversionRegistry.ts`; the UI, detection, server endpoint and code templates all derive from it. No conversion is advertised that the app cannot genuinely perform.

| Category | Targets | Browser engine | Server (FFmpeg) engine |
|---|---|---|---|
| **Image** | JPG, JPEG, PNG, WEBP, SVG, GIF, BMP, ICO, AVIF | JPG, JPEG, PNG, WEBP, SVG | GIF, BMP, ICO, AVIF (and any browser target via API) |
| **Audio** | WAV, MP3, OGG, AAC, M4A, FLAC, MP4, WEBM | WAV, MP4/WEBM (spectrum visualizer) | MP3, OGG, AAC, M4A, FLAC |
| **Video** | MP4, WEBM, MOV, MKV, AVI, GIF, MP3, WAV, OGG, AAC, FLAC, M4A | — (all server) | All |
| **Data** | JSON, CSV, TSV, XML, YAML | All | — |
| **Document** | TXT, MD, HTML | All (PDF/TXT/MD/HTML accepted as *sources*) | — |

### Server upload limits

Server-side uploads are limited by category:

| Category | Maximum upload size |
|---|---:|
| Image | 50 MB |
| Audio | 100 MB |
| Video | 200 MB |
| Document | 10 MB |
| Data | 10 MB |

The multipart parser also has an overall 200 MB Busboy file-size limit.

---

## 🛠️ Tech Stack

### Frontend

- React 19
- TypeScript 5.8
- Vite 6
- Tailwind CSS 4
- Motion
- Lucide React
- Canvas / Web Audio / browser media APIs

### Backend

- Node.js 20+
- Express 4
- TypeScript
- `tsx`
- `ffmpeg-static`
- Busboy
- `file-type`
- `express-rate-limit`

### Utilities / Build

- esbuild
- Vitest
- JSZip
- Concurrently
- Docker support
- GitHub Actions CI

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 20 or newer**
- npm
- A modern browser with Canvas/Web Audio/media API support

The application uses `ffmpeg-static` for server-side conversion, so a separate system FFmpeg installation is normally **not required**.

### Install

```bash
git clone https://github.com/nishanth-kkj9/format-shift.git
cd format-shift
npm install
```

### Development

Run frontend and API together:

```bash
npm run dev:all
```

Or run them separately:

```bash
npm run dev
```

```bash
npm run server
```

Default development endpoints:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

### Environment

The repository includes `.env.example` for environment configuration. Copy it to `.env` when environment variables are required by your deployment.

---

## 📜 NPM Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run server` | Start the Express API with `tsx` |
| `npm run dev:all` | Start Vite and Express together |
| `npm run build` | Build the frontend and bundle the API into `dist/server.cjs` |
| `npm start` | Start the production server |
| `npm run preview` | Preview the Vite production build |
| `npm run lint` | TypeScript type-check with `tsc --noEmit` |
| `npm test` | Run the Vitest test suite |
| `npm run clean` | Remove generated build output |

---

## 🔌 API

### Health check

```http
GET /api/health
```

Example response:

```json
{
  "status": "ok",
  "app": "FormatShift Universal Converter",
  "timestamp": "2026-08-14T00:00:00.000Z"
}
```

### Convert a file

```http
POST /api/convert
Content-Type: multipart/form-data
```

Multipart fields:

| Field | Required | Description |
|---|---|---|
| `file` | Yes | Source file |
| `category` | Yes | `image`, `audio`, `video`, `document`, or `data` |
| `sourceFormat` | Optional | Source extension/format |
| `targetFormat` | Yes | Requested output format |
| `options` | Optional | JSON-encoded conversion options |

Successful responses return the converted binary with an appropriate `Content-Type` and an attachment filename.

Common client errors return JSON such as:

```json
{
  "error": "Unsupported target format: xyz"
}
```

The conversion endpoint is rate-limited to **30 requests per minute per IP** by default.

### Code templates

```http
POST /api/code-template
Content-Type: application/json
```

Example request:

```json
{
  "category": "image",
  "sourceFormat": "png",
  "targetFormat": "webp"
}
```

The response contains generated examples for:

- Python
- Node.js
- HTML/JavaScript

---

## 🧪 Testing & CI

FormatShift includes unit and integration tests using Vitest.

The integration suite covers important server behavior including:

- Successful streamed PNG conversion.
- Rejection of binary content whose magic bytes do not match the requested category.
- Invalid image data handling.
- Per-category upload size limits.
- Temporary-file cleanup after conversion.

Run locally:

```bash
npm run lint
npm test
npm run build
```

GitHub Actions runs the same type-check, test, and build pipeline on pushes to `main` and pull requests.

---

## 🐳 Docker

A multi-stage Dockerfile is included.

Build:

```bash
docker build -t formatshift .
```

Run:

```bash
docker run --rm -p 4000:4000 formatshift
```

Then open:

```text
http://localhost:4000
```

The production image uses Node 20 Alpine and installs runtime dependencies separately from development dependencies.

---

## 📁 Project Structure

```text
format-shift/
├── .github/
│   └── workflows/
│       └── ci.yml
├── server/
│   ├── convert.ts
│   ├── convert.test.ts
│   ├── e2e-server.mjs
│   ├── integration.test.ts
│   ├── upload.ts
│   ├── ffmpeg/
│   │   ├── audio.ts
│   │   ├── filters.ts
│   │   ├── runner.ts
│   │   └── video.ts
│   └── routes/
│       ├── convert.ts
│       └── templates.ts
├── src/
│   ├── core/
│   │   ├── conversionRegistry.ts
│   │   └── conversionRegistry.test.ts
│   ├── components/
│   │   ├── BatchBar.tsx
│   │   ├── CodeSnippetModal.tsx
│   │   ├── ConversionOptionsModal.tsx
│   │   ├── Dropzone.tsx
│   │   ├── FileList.tsx
│   │   ├── FormatDropdown.tsx
│   │   ├── FormatGuide.tsx
│   │   ├── Header.tsx
│   │   ├── HistoryDrawer.tsx
│   │   └── PreviewModal.tsx
│   ├── utils/
│   │   ├── audioVisualizer.ts
│   │   ├── convertAudio.ts
│   │   ├── convertData.ts
│   │   ├── convertImage.ts
│   │   ├── convertVideo.ts
│   │   ├── serverConvert.ts
│   │   ├── detect.ts
│   │   ├── metadata.ts
│   │   └── converter.ts
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
├── Dockerfile
├── index.html
├── package.json
├── server.ts
├── tsconfig.json
└── vite.config.ts
```

---

## 🔐 Security & Resource Handling

The server includes several safeguards for file-processing workloads:

- Multipart uploads are streamed to temporary files rather than fully buffered in RAM.
- Per-category file-size limits are enforced.
- File signatures are checked with `file-type` when a binary signature is available.
- The conversion API is rate-limited.
- Temporary upload and FFmpeg output directories are cleaned up after processing.
- Browser object URLs are revoked during application cleanup to reduce memory retention.

### Important production considerations

FormatShift is a file-processing application, so a public deployment should still be hardened for its expected traffic and threat model. Consider adding authentication or quotas, stronger request timeouts, reverse-proxy limits, structured logging, observability, stricter content validation, and isolated conversion workers before exposing a high-volume instance to untrusted users.

---

## ⚠️ Current Limitations

- Browser codec support varies by browser and operating system.
- Browser `canvas.toBlob()` encoders that are unavailable now surface a clear error (and the image may be retried on the server API) rather than silently returning a PNG.
- Large client-side media conversions can consume significant browser memory.
- Server-side FFmpeg conversions consume CPU and temporary disk space.
- The document pipeline is text-based, not a full office/PDF conversion engine; PDF is accepted as an input but never advertised as an output.
- Conversion options are category-specific and not every UI option applies to every output format.
- Code templates are illustrative snippets, not a guarantee that every generated snippet supports every FormatShift option.

---

## 🗺️ Suggested Roadmap

- [ ] Add a real PDF generation/rendering pipeline.
- [ ] Add richer document conversions such as DOCX/ODT.
- [ ] Add conversion job IDs and asynchronous server workers for large files.
- [ ] Add configurable server storage/cleanup policies.
- [ ] Add Playwright end-to-end browser tests.
- [ ] Add performance benchmarks for large media files.
- [ ] Add authentication, quotas, and per-user limits for public deployments.
- [ ] Add downloadable conversion reports/metadata.

---

## 📄 License

No license file is currently included in the repository. If you plan to distribute or accept external contributions, add an explicit open-source license before treating the project as licensed for reuse.

---

## 👤 Author

Built by **Nishanth Kkj9**.

Repository: https://github.com/nishanth-kkj9/format-shift
