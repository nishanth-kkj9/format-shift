import { describe, it, expect } from "vitest";
import { parseUploadStream, cleanup } from "./upload";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";

const BOUNDARY = "----uploadtest";
const CT = `multipart/form-data; boundary=${BOUNDARY}`;

function multipartBody(
  parts: Array<{ name: string; value?: string; filename?: string; type?: string; data?: Buffer }>
): Buffer {
  const out: Buffer[] = [];
  for (const p of parts) {
    if (p.filename !== undefined) {
      out.push(
        Buffer.from(
          `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.type}\r\n\r\n`
        )
      );
      out.push(p.data!);
      out.push(Buffer.from("\r\n"));
    } else {
      out.push(
        Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`)
      );
    }
  }
  out.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(out);
}

function fakeReq(body: Buffer, headers: Record<string, string> = {}, url = "/api/convert"): IncomingMessage {
  const pt = new PassThrough();
  Object.assign(pt, {
    headers: { host: "localhost", "content-type": CT, ...headers },
    url,
  });
  pt.end(body);
  return pt as unknown as IncomingMessage;
}

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// Minimal valid WAV: RIFF/WAVE + PCM fmt chunk + 4 bytes of silent data.
const WAV_BYTES = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WAVEfmt "),
  Buffer.from([
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02,
    0x00, 0x10, 0x00,
  ]),
  Buffer.from("data"),
  Buffer.from([0x04, 0x00, 0x00, 0x00]),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
]);

// Minimal EBML header with DocType "webm" — file-type reports EVERY webm
// container (audio-only included) as ext "webm" / mime "video/webm".
const WEBM_BYTES = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0xa3, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42,
  0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, 0x42, 0x87, 0x81, 0x04,
]);

describe("parseUploadStream", () => {
  it("writes the file to disk byte-for-byte before resolving", async () => {
    const payload = multipartBody([
      { name: "category", value: "image" },
      { name: "targetFormat", value: "png" },
      { name: "options", value: "{}" },
      { name: "file", filename: "img.png", type: "image/png", data: PNG_BYTES },
    ]);
    const up = await parseUploadStream(fakeReq(payload, { "x-category": "image" }));
    try {
      const onDisk = readFileSync(up.filePath);
      expect(onDisk.equals(PNG_BYTES)).toBe(true);
      expect(up.size).toBe(PNG_BYTES.length);
      expect(up.category).toBe("image");
      expect(up.targetFormat).toBe("png");
      expect(up.sourceFormat).toBe("png");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  });

  it("parses when the file part comes before the category field", async () => {
    const payload = multipartBody([
      { name: "file", filename: "img.png", type: "image/png", data: PNG_BYTES },
      { name: "category", value: "image" },
      { name: "targetFormat", value: "webp" },
      { name: "options", value: "{}" },
    ]);
    const up = await parseUploadStream(fakeReq(payload));
    try {
      const onDisk = readFileSync(up.filePath);
      expect(onDisk.equals(PNG_BYTES)).toBe(true);
      expect(up.category).toBe("image");
      expect(up.targetFormat).toBe("webp");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  });

  it("rejects an oversized file with 413 based on the header category", async () => {
    const big = Buffer.alloc(51 * 1024 * 1024, 0x89);
    const payload = multipartBody([
      { name: "category", value: "image" },
      { name: "targetFormat", value: "png" },
      { name: "options", value: "{}" },
      { name: "file", filename: "big.png", type: "image/png", data: big },
    ]);
    await expect(parseUploadStream(fakeReq(payload, { "x-category": "image" }))).rejects.toMatchObject({
      status: 413,
    });
  }, 30000);

  it("accepts a file exactly at the category limit", async () => {
    const exact = Buffer.alloc(10 * 1024 * 1024, 0x89);
    const payload = multipartBody([
      { name: "category", value: "document" },
      { name: "targetFormat", value: "txt" },
      { name: "options", value: "{}" },
      { name: "file", filename: "exact.txt", type: "text/plain", data: exact },
    ]);
    const up = await parseUploadStream(fakeReq(payload, { "x-category": "document" }));
    try {
      expect(up.size).toBe(10 * 1024 * 1024);
      expect(up.sourceFormat).toBe("txt");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  }, 30000);

  it("resolves source format from magic bytes (wav)", async () => {
    const payload = multipartBody([
      { name: "category", value: "audio" },
      { name: "targetFormat", value: "mp3" },
      { name: "options", value: "{}" },
      { name: "file", filename: "sound.wav", type: "audio/wav", data: WAV_BYTES },
    ]);
    const up = await parseUploadStream(fakeReq(payload, { "x-category": "audio" }));
    try {
      expect(up.sourceFormat).toBe("wav");
      expect(up.mimetype).toBe("audio/wav");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  });

  it("resolves text sources from mime via the registry (txt)", async () => {
    const payload = multipartBody([
      { name: "category", value: "document" },
      { name: "targetFormat", value: "html" },
      { name: "options", value: "{}" },
      { name: "file", filename: "notes.txt", type: "text/plain", data: Buffer.from("hello world") },
    ]);
    const up = await parseUploadStream(fakeReq(payload, { "x-category": "document" }));
    try {
      expect(up.sourceFormat).toBe("txt");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  });

  it("resolves source-only mimes via fallback map (audio/x-m4a)", async () => {
    const payload = multipartBody([
      { name: "category", value: "audio" },
      { name: "targetFormat", value: "mp3" },
      { name: "options", value: "{}" },
      { name: "file", filename: "song.m4a", type: "audio/x-m4a", data: Buffer.from("hello") },
    ]);
    const up = await parseUploadStream(fakeReq(payload, { "x-category": "audio" }));
    try {
      expect(up.sourceFormat).toBe("m4a");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  });

  it("accepts audio-only webm and normalizes the source format to weba", async () => {
    // file-type detects every webm container (audio or video) as ext "webm" /
    // mime "video/webm", so an audio webm must be accepted via the weba source
    // alias instead of being rejected as a mismatched category.
    const payload = multipartBody([
      { name: "category", value: "audio" },
      { name: "targetFormat", value: "wav" },
      { name: "options", value: "{}" },
      { name: "file", filename: "clip.webm", type: "audio/webm", data: WEBM_BYTES },
    ]);
    const up = await parseUploadStream(fakeReq(payload, { "x-category": "audio" }));
    try {
      expect(up.sourceFormat).toBe("weba");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  });

  it("still rejects a genuinely mismatched binary in the audio category", async () => {
    const payload = multipartBody([
      { name: "category", value: "audio" },
      { name: "targetFormat", value: "wav" },
      { name: "options", value: "{}" },
      { name: "file", filename: "clip.png", type: "audio/webm", data: PNG_BYTES },
    ]);
    await expect(parseUploadStream(fakeReq(payload, { "x-category": "audio" }))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects PDF uploads for the document category", async () => {
    const payload = multipartBody([
      { name: "category", value: "document" },
      { name: "targetFormat", value: "txt" },
      { name: "options", value: "{}" },
      { name: "file", filename: "doc.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4 hello") },
    ]);
    await expect(parseUploadStream(fakeReq(payload, { "x-category": "document" }))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects application/octet-stream for binary categories (no magic bytes)", async () => {
    const payload = multipartBody([
      { name: "category", value: "image" },
      { name: "targetFormat", value: "png" },
      { name: "options", value: "{}" },
      { name: "file", filename: "mystery.png", type: "application/octet-stream", data: Buffer.from("hello") },
    ]);
    await expect(parseUploadStream(fakeReq(payload, { "x-category": "image" }))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects a PNG whose declared mime belongs to another binary category", async () => {
    const payload = multipartBody([
      { name: "category", value: "audio" },
      { name: "targetFormat", value: "mp3" },
      { name: "options", value: "{}" },
      { name: "file", filename: "audio.mp3", type: "audio/mpeg", data: PNG_BYTES },
    ]);
    await expect(parseUploadStream(fakeReq(payload, { "x-category": "audio" }))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("still tolerates application/octet-stream for text categories", async () => {
    const payload = multipartBody([
      { name: "category", value: "document" },
      { name: "targetFormat", value: "txt" },
      { name: "options", value: "{}" },
      { name: "file", filename: "notes.txt", type: "application/octet-stream", data: Buffer.from("hello") },
    ]);
    const up = await parseUploadStream(fakeReq(payload, { "x-category": "document" }));
    try {
      expect(up.sourceFormat).toBe("txt");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  });

  it("prefers header category over the form field", async () => {
    const payload = multipartBody([
      { name: "category", value: "document" },
      { name: "targetFormat", value: "png" },
      { name: "options", value: "{}" },
      { name: "file", filename: "img.png", type: "image/png", data: PNG_BYTES },
    ]);
    // Header says image; field says document. A PNG only passes the image
    // allowlist, so success proves the header won.
    const up = await parseUploadStream(fakeReq(payload, { "x-category": "image" }));
    try {
      expect(up.category).toBe("image");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  });

  it("falls back to the query-string category when no header is sent", async () => {
    const payload = multipartBody([
      { name: "category", value: "document" },
      { name: "targetFormat", value: "png" },
      { name: "options", value: "{}" },
      { name: "file", filename: "img.png", type: "image/png", data: PNG_BYTES },
    ]);
    // No header; query says image, field says document. Passing the image
    // allowlist proves the query category was used.
    const up = await parseUploadStream(fakeReq(payload, {}, "/api/convert?category=image"));
    try {
      expect(up.category).toBe("image");
    } finally {
      cleanup(up.tempDir, up.filePath);
    }
  });

  it("rejects a file over the global 200MB cap even with no category header", async () => {
    const big = Buffer.alloc(201 * 1024 * 1024, 0x61);
    const payload = multipartBody([
      { name: "targetFormat", value: "txt" },
      { name: "file", filename: "huge.bin", type: "application/octet-stream", data: big },
    ]);
    // Whether busboy's per-file 'limit' event or the streaming global check wins
    // the race depends on event ordering, so accept either message — both are 413.
    await expect(parseUploadStream(fakeReq(payload))).rejects.toMatchObject({
      status: 413,
      message: /global limit|File too large/,
    });
  }, 60000);

  it("rejects a multipart body with no file part", async () => {
    // A part with no Content-Disposition is skipped by busboy; with no file the
    // parser has nothing to convert and the request is a client error.
    const malformed = Buffer.from(
      `--${BOUNDARY}\r\nContent-Type: text/plain\r\n\r\nhi\r\n--${BOUNDARY}--\r\n`
    );
    const pt = new PassThrough();
    Object.assign(pt, {
      headers: { host: "localhost", "content-type": CT },
      url: "/api/convert",
    });
    pt.end(malformed);
    await expect(parseUploadStream(pt as unknown as IncomingMessage)).rejects.toMatchObject({
      status: 400,
    });
  });
});
