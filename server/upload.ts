import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import Busboy from "busboy";
import { fileTypeFromBuffer } from "file-type";
import type { IncomingMessage } from "node:http";

export interface ParsedUpload {
  tempDir: string;
  filePath: string;
  originalFilename: string;
  size: number;
  mimetype: string;
  category: string;
  targetFormat: string;
  options: Record<string, unknown>;
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
  image: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/x-icon", "image/svg+xml", "image/avif"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/mp4", "audio/flac", "audio/x-wav"],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"],
  document: ["application/pdf", "text/plain", "text/markdown", "text/html"],
  data: ["application/json", "text/csv", "application/xml", "text/xml", "text/yaml", "text/tab-separated-values"],
};

const MAX_SIZES: Record<string, number> = {
  image: 50 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  document: 10 * 1024 * 1024,
  data: 10 * 1024 * 1024,
};

// Stream a multipart upload to a temp file on disk instead of buffering the whole
// file in RAM (multer memoryStorage). O(N*chunk) memory instead of O(N*file).
export async function parseUploadStream(req: IncomingMessage): Promise<ParsedUpload> {
  const fields: Record<string, string> = {};
  const tempDir = mkdtempSync(join(tmpdir(), "fs-up-"));
  let filePath: string | null = null;
  let originalFilename = "";
  let size = 0;
  let mimetype = "";
  let head: Buffer[] = [];
  let headBytes = 0;

  try {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 200 * 1024 * 1024 } });
    let abortError: UploadError | null = null;

    busboy.on("file", (_name, stream, info) => {
      mimetype = info.mimeType;
      originalFilename = info.filename || "upload.bin";
      // Never trust the client filename as a path component — write to a random
      // name inside the request-scoped temp dir to prevent path traversal.
      filePath = join(tempDir, `input-${randomBytes(8).toString("hex")}.bin`);
      const writeStream = createWriteStream(filePath);

      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        // keep the first 8KB for magic-byte sniffing
        if (headBytes < 8192) {
          const take = Math.min(8192 - headBytes, chunk.length);
          head.push(chunk.subarray(0, take));
          headBytes += take;
        }
        const cat = (fields.category || "").toLowerCase();
        const max = MAX_SIZES[cat];
        if (max && size > max && !abortError) {
          abortError = new UploadError(`File too large for ${cat} category (max ${max / 1024 / 1024}MB)`, 413);
          stream.destroy();
          writeStream.destroy();
        }
      });
      stream.on("error", () => {});
      writeStream.on("error", () => {});
      stream.pipe(writeStream);
    });

    busboy.on("field", (name, val) => {
      fields[name] = val;
    });

    req.pipe(busboy);
    await once(busboy, "close");
    if (abortError) throw abortError;

    const category = (fields.category || "").toLowerCase();
    if (!filePath) throw new UploadError("No file uploaded");

    const cat = category as keyof typeof ALLOWED_MIME;

    // Magic-byte sniffing: reject files whose actual signature isn't in the category allowlist.
    if (ALLOWED_MIME[cat]) {
      const detected = await fileTypeFromBuffer(Buffer.concat(head));
      if (detected && !ALLOWED_MIME[cat].includes(detected.mime)) {
        throw new UploadError(`File content (${detected.mime}) does not match category ${category}`);
      }
      // No detectable signature (text/plain etc.) — trust the declared MIME instead.
      if (
        !detected &&
        mimetype !== "application/octet-stream" &&
        !ALLOWED_MIME[cat].includes(mimetype)
      ) {
        throw new UploadError(`File type ${mimetype} not allowed for category ${category}`);
      }
    }

    let options = {};
    try {
      options = JSON.parse(fields.options || "{}");
    } catch {
      // ignore malformed options
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
