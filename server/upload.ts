import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import Busboy from "busboy";
import { fileTypeFromBuffer } from "file-type";
import type { IncomingMessage } from "node:http";
import { CONVERSION_REGISTRY } from "../src/core/conversionRegistry";

export interface ParsedUpload {
  tempDir: string;
  filePath: string;
  originalFilename: string;
  size: number;
  mimetype: string;
  category: string;
  targetFormat: string;
  options: Record<string, unknown>;
  /** Source format resolved from file magic bytes / mime / filename (may be ""). */
  sourceFormat: string;
}

export class UploadError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

const ALLOWED_MIME: Record<string, string[]> = {
  image: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/x-icon",
    "image/svg+xml",
    "image/avif",
  ],
  audio: [
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/aac",
    "audio/mp4",
    "audio/flac",
    "audio/x-wav",
    "audio/x-m4a",
    "audio/webm",
  ],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska", "video/x-flv"],
  document: ["text/plain", "text/markdown", "text/html"],
  data: [
    "application/json",
    "text/csv",
    "application/xml",
    "text/xml",
    "text/yaml",
    "text/tab-separated-values",
  ],
};

const MAX_SIZES: Record<string, number> = {
  image: 50 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  document: 10 * 1024 * 1024,
  data: 10 * 1024 * 1024,
};

const GLOBAL_MAX_SIZE = 200 * 1024 * 1024; // hard cap regardless of category

// Client MIME types that don't appear in the registry's target table but are
// legitimate sources (x-* audio/video variants).
const MIME_SOURCE_FALLBACK: Record<string, string> = {
  "audio/x-wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/webm": "weba",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
  "video/x-flv": "flv",
};

/**
 * Resolve the source format from trusted evidence, in priority order:
 * 1. magic-byte detection (only reliable for binary formats)
 * 2. registry reverse-mime lookup (target mime == client mime)
 * 3. known source-only mime fallbacks
 * 4. filename extension (weakest hint)
 * Text formats without magic bytes fall through to the mime/filename hints.
 */
export function resolveSourceFormat(
  detected: { ext: string } | null,
  mimetype: string,
  originalFilename: string,
  category: string
): string {
  if (detected) return detected.ext.toLowerCase();
  const spec = CONVERSION_REGISTRY[category as keyof typeof CONVERSION_REGISTRY];
  if (spec) {
    const mime = mimetype.toLowerCase();
    for (const [fmt, t] of Object.entries(spec.targets)) {
      if (t.mime === mime) return fmt;
    }
  }
  const fallback = MIME_SOURCE_FALLBACK[mimetype.toLowerCase()];
  if (fallback) return fallback;
  return originalFilename.split(".").pop()?.toLowerCase() || "";
}

export async function parseUploadStream(req: IncomingMessage): Promise<ParsedUpload> {
  const fields: Record<string, string> = {};
  const tempDir = mkdtempSync(join(tmpdir(), "fs-up-"));
  let filePath: string | null = null;
  let originalFilename = "";
  let size = 0;
  let mimetype = "";
  let head: Buffer[] = [];
  let headBytes = 0;
  let abortError: UploadError | null = null;
  const writePipelines: Promise<void>[] = [];

  try {
    // Read category from headers/query FIRST so we can enforce category-specific
    // limits during streaming. The multipart `category` field may arrive after
    // the file bytes, so it is never used for the streaming cap — only as a
    // fallback for the post-parse size check.
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const headerCategory = (req.headers["x-category"] as string) || "";
    const queryCategory = url.searchParams.get("category") || "";
    const categoryFromMeta = (headerCategory || queryCategory || "").toLowerCase();
    const categoryMaxSize =
      categoryFromMeta && MAX_SIZES[categoryFromMeta as keyof typeof MAX_SIZES]
        ? MAX_SIZES[categoryFromMeta as keyof typeof MAX_SIZES]
        : GLOBAL_MAX_SIZE;

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        // +1 so a file exactly at the category cap is fully written and accepted;
        // anything over it trips the limit and is rejected by the post-parse check.
        fileSize: categoryMaxSize + 1,
        // Structural caps: bounded multipart surface so a malformed/abusive body
        // cannot spawn unbounded parts/fields/file writes. The frontend sends
        // file + category + targetFormat + options (4 parts, 4 fields).
        parts: 16,
        fields: 16,
        files: 1,
        headerPairs: 64,
      },
    });

    busboy.on("file", (_name: string, stream: Readable, info: { mimeType: string; filename: string }) => {
      // A previous part already tripped a limit: drain remaining parts without
      // touching the disk so an abusive body can't cause repeated large writes.
      if (abortError) {
        stream.resume();
        return;
      }
      mimetype = info.mimeType;
      originalFilename = info.filename || "upload.bin";
      filePath = join(tempDir, `input-${randomBytes(8).toString("hex")}.bin`);
      const writeStream = createWriteStream(filePath);

      // Track total size + keep the first 8KB for magic-byte sniffing.
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > GLOBAL_MAX_SIZE && !abortError) {
          abortError = new UploadError(
            `Upload exceeds the global limit of ${GLOBAL_MAX_SIZE / 1024 / 1024}MB`,
            413
          );
          // Stop writing and parsing immediately; the catch/cleanup path removes
          // the partially written file and temp dir.
          stream.destroy();
          writeStream.destroy();
          busboy.destroy();
          return;
        }
        if (headBytes < 8192) {
          const take = Math.min(8192 - headBytes, chunk.length);
          head.push(chunk.subarray(0, take));
          headBytes += take;
        }
      });

      // Busboy fires this when the file stream is truncated at the size cap.
      stream.on("limit", () => {
        if (!abortError) {
          abortError = new UploadError(
            `File too large for ${categoryFromMeta || "upload"} category (max ${categoryMaxSize / 1024 / 1024}MB)`,
            413
          );
        }
      });

      // pipeline() keeps memory O(chunk) and only resolves after every byte has
      // been flushed to the write stream — parseUploadStream never returns while
      // the file is still being written. Errors are captured into abortError.
      const writeDone = pipeline(stream, writeStream).catch((err: Error) => {
        if (!abortError) {
          abortError = new UploadError(`Failed to write upload to disk: ${err.message}`, 500);
        }
      });
      writePipelines.push(writeDone);
    });

    busboy.on("field", (name: string, val: string) => {
      fields[name] = val;
    });

    busboy.on("error", (err: Error) => {
      if (!abortError) {
        const isSizeLimit = /file size|size limit|limit exceeded/i.test(err.message);
        abortError = new UploadError(err.message, isSizeLimit ? 413 : 400);
      }
    });

    for (const [event, msg] of [
      ["partsLimit", "Upload has too many parts"],
      ["fieldsLimit", "Upload has too many fields"],
      ["filesLimit", "Upload has too many files"],
    ] as const) {
      busboy.on(event, () => {
        if (!abortError) abortError = new UploadError(msg, 413);
      });
    }

    req.pipe(busboy);
    // once() rejects if busboy emits 'error' before 'close'; swallow it here and
    // rely on the abortError captured above so malformed bodies stay 400/413.
    await once(busboy, "close").catch(() => {});
    // Wait until every uploaded file is fully flushed to disk before returning.
    await Promise.all(writePipelines);

    if (abortError) throw abortError;

    // Category can come from header/query (preferred) or form field (fallback).
    const fieldCategory = (fields.category || "").toLowerCase();
    const category = categoryFromMeta || fieldCategory;
    if (!filePath) throw new UploadError("No file uploaded");

    // Enforce category-specific size limit now that the category is known.
    const cat = category as keyof typeof MAX_SIZES;
    const max = MAX_SIZES[cat];
    if (max && size > max) {
      throw new UploadError(`File too large for ${category} category (max ${max / 1024 / 1024}MB)`, 413);
    }

    // Magic-byte sniffing: reject files whose actual signature isn't in the
    // category allowlist. Text formats without magic bytes are allowed through
    // when their declared MIME is in the allowlist.
    let detected: { ext: string; mime: string } | null = null;
    // fileTypeFromBuffer returns FileTypeResult | undefined; normalize to our type
    if (ALLOWED_MIME[cat]) {
      const ft = await fileTypeFromBuffer(Buffer.concat(head));
      detected = ft ? { ext: ft.ext, mime: ft.mime } : null;
      if (detected && !ALLOWED_MIME[cat].includes(detected.mime)) {
        throw new UploadError(`File content (${detected.mime}) does not match category ${category}`);
      }
      if (!detected && mimetype !== "application/octet-stream" && !ALLOWED_MIME[cat].includes(mimetype)) {
        throw new UploadError(`File type ${mimetype} not allowed for category ${category}`);
      }
    }

    let options = {};
    try {
      options = JSON.parse(fields.options || "{}");
    } catch {
      // ignore malformed options; the route validates what it uses
    }

    return {
      tempDir,
      filePath,
      originalFilename,
      size,
      mimetype,
      category,
      targetFormat: fields.targetFormat || "",
      options,
      sourceFormat: resolveSourceFormat(detected, mimetype, originalFilename, category),
    };
  } catch (err) {
    cleanup(tempDir, filePath);
    if (err instanceof UploadError) throw err;
    throw err;
  }
}

export function cleanup(tempDir: string, filePath: string | null): void {
  try {
    if (filePath) rmSync(filePath, { force: true });
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
