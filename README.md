<div align="center">

# FormatShift

Universal High-Performance Media & Data Engine

Instant conversion for images, audio, video, documents, and data files — client-side in the browser, with a server-side ffmpeg fallback for formats the browser can't handle.

</div>

## Features

- **Batch conversion** — convert multiple files at once, apply a global target format
- **In-browser conversion** — HTML5 Canvas, Web Audio API, and Web Media Encoders for common formats (PNG, JPG, WEBP, GIF, WAV, MP3, JSON, CSV, and more). Zero upload, private by default.
- **Server-side fallback** — ffmpeg-powered conversion for AVIF, ICO, BMP, FLAC, OGG, M4A, MP4, MOV, MKV, AVI, and video-to-audio extraction
- **Options per file** — quality, social-media presets, EXIF removal, resize, rotate, grayscale
- **Live previews** — preview converted images, audio, and video before download
- **Code snippets** — ready-to-run Python, Node.js, and HTML5 conversion code
- **History** — conversion history drawer with re-download
- **Save all as ZIP** — batch-download every converted file

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4
- **Backend:** Express, tsx, ffmpeg-static, multer, JSZip
- **Conversion:** browser-native codecs + server ffmpeg

## Getting Started

**Prerequisites:** Node.js 20+ and [ffmpeg](https://ffmpeg.org/download.html) (or let ffmpeg-static bundle it).

```bash
npm install
npm run dev:all
```

- Frontend: http://localhost:5173
- API: http://localhost:4000 (`/api/health`, `/api/convert`)

## Scripts

| Command          | Description                                        |
| ---------------- | -------------------------------------------------- |
| `npm run dev:all`| Run API server + Vite dev server together          |
| `npm run dev`    | Vite dev server only                               |
| `npm run server` | Express API server only (`tsx server.ts`)          |
| `npm run build`  | Build frontend + bundle API into `dist/`           |
| `npm start`      | Serve the production build (`dist/server.cjs`)     |
| `npm run lint`   | Typecheck (`tsc --noEmit`)                         |

## API

### `POST /api/convert`

Multipart form: `file`, `category`, `sourceFormat`, `targetFormat`, `options` (JSON string).

Returns the converted file. Unsupported targets return `400`.

### `GET /api/code-template?category=...&target=...`

Returns a code snippet (Python/Node.js/HTML) for converting the given format pair.

## Deployment

`npm run build` produces `dist/` containing the static frontend and a single bundled `server.cjs`. Serve with `npm start`, or deploy `dist/` to any Node/Cloud Run/static+server platform.
