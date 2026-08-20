import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "./app";
import type { Server } from "node:http";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  FFMPEG_BIN,
  acquireFFmpegSlot,
  releaseFFmpegSlot,
  getFFmpegConcurrency,
  getFFmpegVersion,
} from "./ffmpeg/runner";

// 1x1 transparent PNG — has real PNG magic bytes (\x89PNG\r\n\x1a\n)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// Minimal ELF header — a detectable binary that is NOT a PNG
const ELF_BYTES = Buffer.from("7f454c4602010100000000000000000002003e0001000000", "hex");

// 64x64 red JPEG with embedded EXIF (Make/Model/Software, Pillow-generated).
// Contains a real APP1 (0xFFE1) EXIF segment carrying "TestCam".
const EXIF_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/4QBeRXhpZgAATU0AKgAAAAgAAwEPAAIAAAAIAAAAMgEQAAIAAAALAAAAOgExAAIAAAAQAAAARgAAAABUZXN0Q2FtAEZpeHR1cmVDYW0AAHN0cmlwLWV4aWYtdGVzdAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDz+iiivlD+gAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==",
  "base64"
);

let server: Server;
let base: string;

beforeAll(async () => {
  // Warm the ffmpeg version cache (probed async since the runner change) so
  // /api/ready reports a real version string instead of null.
  await getFFmpegVersion();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      base = `http://127.0.0.1:${(addr as { port: number }).port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

function postConvert(body: Blob, filename: string, category = "image", target = "webp") {
  const form = new FormData();
  form.append("file", new File([body], filename, { type: "image/png" }));
  form.append("category", category);
  form.append("targetFormat", target);
  form.append("options", "{}");
  return fetch(`${base}/api/convert`, {
    method: "POST",
    body: form,
    headers: { "x-category": category },
  });
}

function postConvertOrdered(body: Blob, filename: string, fields: Record<string, string | Blob>) {
  const form = new FormData();
  const category = (fields.category as string) || "image";
  // Append fields in the exact order provided to test multipart ordering.
  for (const [key, value] of Object.entries(fields)) {
    if (key === "file") {
      form.append("file", new File([body], filename, { type: "image/png" }));
    } else {
      form.append(key, value as string);
    }
  }
  return fetch(`${base}/api/convert`, {
    method: "POST",
    body: form,
    headers: { "x-category": category },
  });
}

describe("POST /api/convert (streaming upload)", () => {
  it("converts a real PNG via streamed upload", async () => {
    const res = await postConvert(new Blob([TINY_PNG]), "test.png");
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
  }, 30000);

  it("returns real output magic bytes matching the requested target", async () => {
    const res = await postConvert(new Blob([TINY_PNG]), "test.png", "image", "webp");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/webp");
    const buf = Buffer.from(await res.arrayBuffer());
    // RIFF....WEBP
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WEBP");
  }, 30000);

  it("rejects a binary whose magic bytes don't match the declared category", async () => {
    const res = await postConvert(new Blob([ELF_BYTES]), "evil.png");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not match category/);
  }, 30000);

  it("rejects an unknown file type for a strict category", async () => {
    const res = await postConvert(new Blob(["hello world"]), "fake.png");
    // file-type can't sniff text; declared image/png is in allowlist, so it passes
    // upload validation and ffmpeg rejects it as invalid image data.
    expect(res.status).not.toBe(200);
  }, 30000);

  it("rejects oversized files (per-category cap)", async () => {
    const big = new Blob([Buffer.alloc(51 * 1024 * 1024, 0x89)]);
    const form = new FormData();
    form.append("file", new File([big], "big.png", { type: "image/png" }));
    form.append("category", "image");
    form.append("targetFormat", "png");
    form.append("options", "{}");
    const res = await fetch(`${base}/api/convert`, { method: "POST", body: form });
    expect(res.status).toBe(413);
  }, 30000);

  it("cleans up temp files after conversion", async () => {
    const before = new Set(readdirSync(tmpdir()));
    await postConvert(new Blob([TINY_PNG]), "cleanup.png");
    const after = new Set(readdirSync(tmpdir()));
    // no new fs-up-* temp dirs left behind
    const leftover = [...after].filter((f) => f.startsWith("fs-up-") && !before.has(f));
    expect(leftover).toEqual([]);
  }, 30000);
});

describe("POST /api/convert (error paths + requestId)", () => {
  it("rejects an unsupported target with 400 and a requestId", async () => {
    const res = await postConvert(new Blob([TINY_PNG]), "test.png", "image", "pdf");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Conversion not supported/);
    expect(typeof body.requestId).toBe("string");
  }, 30000);

  it("rejects a source format the category does not accept (yaml -> data)", async () => {
    const form = new FormData();
    // text/yaml has no magic bytes; sourceFormat resolves to "yaml", which the
    // data category registry does not list as a source.
    form.append("file", new File([Buffer.from("a: 1\nb: 2\n")], "data.yaml", { type: "text/yaml" }));
    form.append("category", "data");
    form.append("targetFormat", "json");
    form.append("options", "{}");
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "data" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.requestId).toBe("string");
  }, 30000);

  it("rejects HTML -> Markdown even though the target exists in the registry (source exclusion)", async () => {
    const form = new FormData();
    form.append("file", new File([Buffer.from("<h1>Hi</h1>")], "page.html", { type: "text/html" }));
    form.append("category", "document");
    form.append("targetFormat", "md");
    form.append("options", "{}");
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "document" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Conversion not supported/);
    expect(typeof body.requestId).toBe("string");
  }, 30000);

  it("rejects unknown option keys with 400 (no ffmpeg arg smuggling)", async () => {
    const form = new FormData();
    form.append("file", new File([TINY_PNG], "img.png", { type: "image/png" }));
    form.append("category", "image");
    form.append("targetFormat", "png");
    form.append("options", JSON.stringify({ "-map": "evil" }));
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "image" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid option/);
    expect(typeof body.requestId).toBe("string");
  }, 30000);

  it("returns 503 with a requestId when the ffmpeg queue is saturated", async () => {
    const { max } = getFFmpegConcurrency();
    const queueCap = max * 5;
    for (let i = 0; i < max; i++) await acquireFFmpegSlot();
    for (let i = 0; i < queueCap; i++) void acquireFFmpegSlot();
    try {
      const res = await postConvert(new Blob([TINY_PNG]), "busy.png");
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toMatch(/busy/i);
      expect(typeof body.requestId).toBe("string");
    } finally {
      for (let i = 0; i < max + queueCap; i++) releaseFFmpegSlot();
    }
  }, 30000);
});

describe("Upload size limit enforcement (multipart field order)", () => {
  const TEN_MB = 10 * 1024 * 1024;
  const ELEVEN_MB = 11 * 1024 * 1024;
  const smallPng = new Blob([TINY_PNG]);

  it("enforces 10MB document limit when category comes BEFORE file", async () => {
    const big = new Blob([Buffer.alloc(ELEVEN_MB, 0x89)]);
    const res = await postConvertOrdered(big, "big.txt", {
      category: "document",
      file: big,
      targetFormat: "txt",
      options: "{}",
    });
    // Size limit enforced - accept 400 or 413 as valid client error
    expect([400, 413]).toContain(res.status);
  }, 30000);

  it("enforces 10MB document limit when file comes BEFORE category (order-independent)", async () => {
    const big = new Blob([Buffer.alloc(ELEVEN_MB, 0x89)]);
    const res = await postConvertOrdered(big, "big.txt", {
      file: big,
      category: "document",
      targetFormat: "txt",
      options: "{}",
    });
    expect([400, 413]).toContain(res.status);
  }, 30000);

  it("enforces 50MB image limit regardless of field order", async () => {
    // Use 52MB to ensure it exceeds 50MB limit even after Busboy truncation
    const big = new Blob([Buffer.alloc(52 * 1024 * 1024, 0x89)]);
    const res1 = await postConvertOrdered(big, "big.png", {
      category: "image",
      file: big,
      targetFormat: "png",
      options: "{}",
    });
    expect([400, 413]).toContain(res1.status);
    const res2 = await postConvertOrdered(big, "big.png", {
      file: big,
      category: "image",
      targetFormat: "png",
      options: "{}",
    });
    expect([400, 413]).toContain(res2.status);
  }, 30000);

  it("enforces 10MB data limit regardless of field order", async () => {
    const big = new Blob([Buffer.alloc(ELEVEN_MB, 0x89)]);
    const res1 = await postConvertOrdered(big, "big.json", {
      category: "data",
      file: big,
      targetFormat: "json",
      options: "{}",
    });
    expect([400, 413]).toContain(res1.status);
    const res2 = await postConvertOrdered(big, "big.json", {
      file: big,
      category: "data",
      targetFormat: "json",
      options: "{}",
    });
    expect([400, 413]).toContain(res2.status);
  }, 30000);

  it("enforces 100MB audio limit regardless of field order", async () => {
    const big = new Blob([Buffer.alloc(101 * 1024 * 1024, 0x89)]);
    const res1 = await postConvertOrdered(big, "big.mp3", {
      category: "audio",
      file: big,
      targetFormat: "mp3",
      options: "{}",
    });
    expect([400, 413]).toContain(res1.status);
    const res2 = await postConvertOrdered(big, "big.mp3", {
      file: big,
      category: "audio",
      targetFormat: "mp3",
      options: "{}",
    });
    expect([400, 413]).toContain(res2.status);
  }, 30000);

  it("rejects unknown category with 400", async () => {
    const res = await postConvertOrdered(smallPng, "test.png", {
      category: "unknown-category",
      file: smallPng,
      targetFormat: "png",
      options: "{}",
    });
    expect(res.status).toBe(400);
  }, 30000);

  it("accepts file at exact category limit (10MB for document)", async () => {
    const exact = new Blob([Buffer.alloc(TEN_MB, 0x89)]);
    const res = await postConvertOrdered(exact, "exact.txt", {
      category: "document",
      file: exact,
      targetFormat: "txt",
      options: "{}",
    });
    // Should not be 413 (may be 400 for other reasons like invalid PNG magic bytes)
    expect(res.status).not.toBe(413);
  }, 30000);
});

describe("Multipart structural limits", () => {
  function buildForm(parts: Record<string, string | Blob>): FormData {
    const form = new FormData();
    for (const [key, value] of Object.entries(parts)) {
      if (value instanceof Blob) {
        form.append(key, new File([value], key === "file" ? "a.png" : `${key}.bin`, { type: "image/png" }));
      } else {
        form.append(key, value);
      }
    }
    return form;
  }

  it("rejects a request with multiple file parts", async () => {
    const form = buildForm({
      file: new Blob([TINY_PNG]),
      second: new Blob([TINY_PNG]),
      category: "image",
      targetFormat: "png",
      options: "{}",
    });
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "image" },
    });
    expect(res.status).toBe(413);
  }, 30000);

  it("rejects excessive multipart fields", async () => {
    const form = buildForm({ file: new Blob([TINY_PNG]), category: "image", targetFormat: "png" });
    for (let i = 0; i < 20; i++) form.append(`extra${i}`, "x");
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "image" },
    });
    expect(res.status).toBe(413);
  }, 30000);

  it("rejects excessive multipart parts", async () => {
    const form = buildForm({ file: new Blob([TINY_PNG]), category: "image", targetFormat: "png" });
    for (let i = 0; i < 20; i++) form.append(`part${i}`, "x");
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "image" },
    });
    expect(res.status).toBe(413);
  }, 30000);

  it("cleans up temp files after a structural rejection", async () => {
    const before = new Set(readdirSync(tmpdir()));
    const form = buildForm({
      file: new Blob([TINY_PNG]),
      second: new Blob([TINY_PNG]),
      category: "image",
      targetFormat: "png",
      options: "{}",
    });
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "image" },
    });
    expect(res.status).toBe(413);
    const after = new Set(readdirSync(tmpdir()));
    const leftover = [...after].filter((f) => f.startsWith("fs-up-") && !before.has(f));
    expect(leftover).toEqual([]);
  }, 30000);
});

describe("POST /api/code-template (scoped small body limit)", () => {
  it("rejects an oversized JSON body before the handler runs", async () => {
    const res = await fetch(`${base}/api/code-template`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // only category/sourceFormat/targetFormat are consumed; way beyond the 10kb cap
      body: JSON.stringify({ category: "image", padding: "x".repeat(64 * 1024) }),
    });
    expect(res.status).toBe(413);
  }, 30000);

  it("serves a normal code-template request", async () => {
    const res = await fetch(`${base}/api/code-template`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "image", sourceFormat: "png", targetFormat: "jpg" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.engine).toBe("browser");
    expect(body.code.python).toContain("PIL");
    expect(body.code.node).toContain("sharp");
  }, 30000);

  it("still rejects unsupported sources", async () => {
    const res = await fetch(`${base}/api/code-template`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "image", sourceFormat: "pdf", targetFormat: "jpg" }),
    });
    expect(res.status).toBe(400);
  }, 30000);

  it("rejects HTML -> Markdown as an unsupported source/target pair", async () => {
    const res = await fetch(`${base}/api/code-template`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "document", sourceFormat: "html", targetFormat: "md" }),
    });
    expect(res.status).toBe(400);
  }, 30000);

  it("rejects YAML as a data source (no parser is integrated)", async () => {
    const res = await fetch(`${base}/api/code-template`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: "data", sourceFormat: "yaml", targetFormat: "json" }),
    });
    expect(res.status).toBe(400);
  }, 30000);
});

describe("No global urlencoded body parser", () => {
  it("does not buffer or reject a >50mb urlencoded request before routing", async () => {
    const big = new Blob([Buffer.alloc(51 * 1024 * 1024, 0x61)]);
    const res = await fetch(`${base}/api/health`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: big,
    });
    // No global urlencoded parser is mounted, so Express must not buffer or
    // reject this request with 413. The GET-only /api/health route falls
    // through to Express's default 404.
    expect(res.status).toBe(404);
  }, 60000);
});

describe("Health endpoint", () => {
  it("returns concurrency metrics", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.ffmpegConcurrency).toBeDefined();
    expect(typeof body.ffmpegConcurrency.max).toBe("number");
    expect(typeof body.ffmpegConcurrency.active).toBe("number");
    expect(typeof body.ffmpegConcurrency.queued).toBe("number");
  });
});

describe("Ready endpoint", () => {
  it("reports ready only when ffmpeg meets both baselines", async () => {
    const res = await fetch(`${base}/api/ready`);
    expect([200, 503]).toContain(res.status);
    const body = await res.json();
    expect(body.ready).toBe(res.status === 200);
    expect(typeof body.ffmpegAvailable).toBe("boolean");
    expect(typeof body.ffmpegVersion).toBe("string");
    expect(typeof body.ffmpegFeatureCompatible).toBe("boolean");
    expect(typeof body.ffmpegSecurityBaselineOk).toBe("boolean");
  });
});

describe("Security headers", () => {
  it("includes X-Frame-Options DENY", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
  it("includes X-Content-Type-Options nosniff", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("includes Referrer-Policy", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
  it("includes Permissions-Policy", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.headers.get("Permissions-Policy")).toBeDefined();
  });
});

describe("Server-side source conversions (source-format validation)", () => {
  let fixtureDir: string;
  let toneMp3: Buffer;
  let toneWav: Buffer;
  let toneMp4: Buffer;
  let toneWebm: Buffer;

  beforeAll(() => {
    fixtureDir = mkdtempSync(join(tmpdir(), "fs-fix-"));
    const run = (args: string[]) => execFileSync(FFMPEG_BIN, ["-loglevel", "error", "-y", ...args]);
    run([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.2",
      "-c:a",
      "libmp3lame",
      join(fixtureDir, "tone.mp3"),
    ]);
    run([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.2",
      "-c:a",
      "pcm_s16le",
      join(fixtureDir, "tone.wav"),
    ]);
    run([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.2",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=64x64",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      join(fixtureDir, "tone.mp4"),
    ]);
    run([
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.2",
      "-c:a",
      "libopus",
      join(fixtureDir, "tone.webm"),
    ]);
    toneMp3 = readFileSync(join(fixtureDir, "tone.mp3"));
    toneWav = readFileSync(join(fixtureDir, "tone.wav"));
    toneMp4 = readFileSync(join(fixtureDir, "tone.mp4"));
    toneWebm = readFileSync(join(fixtureDir, "tone.webm"));
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  function postAudio(body: Buffer, filename: string, type: string, target: string) {
    const form = new FormData();
    form.append("file", new File([body], filename, { type }));
    form.append("category", "audio");
    form.append("targetFormat", target);
    form.append("options", "{}");
    return fetch(`${base}/api/convert`, { method: "POST", body: form, headers: { "x-category": "audio" } });
  }

  it("converts mp3 -> wav (audio/mpeg not blocked by source-format validation)", async () => {
    const res = await postAudio(toneMp3, "tone.mp3", "audio/mpeg", "wav");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("audio/wav");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WAVE");
  }, 30000);

  it("converts wav -> mp3 (audio/wav reverse-mime resolution)", async () => {
    const res = await postAudio(toneWav, "tone.wav", "audio/wav", "mp3");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("audio/mpeg");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  }, 30000);

  it("converts audio-only webm -> wav (webm source normalized to weba)", async () => {
    const res = await postAudio(toneWebm, "tone.webm", "audio/webm", "wav");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("audio/wav");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(buf.subarray(8, 12).toString("ascii")).toBe("WAVE");
  }, 30000);

  it("rejects audio -> mp4/webm (visualizer targets run client-side)", async () => {
    for (const target of ["mp4", "webm"]) {
      const res = await postAudio(toneMp3, "tone.mp3", "audio/mpeg", target);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/client-side/i);
      expect(typeof body.requestId).toBe("string");
    }
  }, 30000);

  it("converts mp4 -> mov (video source format accepted)", async () => {
    const form = new FormData();
    form.append("file", new File([toneMp4], "tone.mp4", { type: "video/mp4" }));
    form.append("category", "video");
    form.append("targetFormat", "mov");
    form.append("options", JSON.stringify({ resolution: "original" }));
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "video" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("video/quicktime");
  }, 30000);

  it("converts mp4 -> gif with the single-pass palette chain", async () => {
    const form = new FormData();
    form.append("file", new File([toneMp4], "tone.mp4", { type: "video/mp4" }));
    form.append("category", "video");
    form.append("targetFormat", "gif");
    form.append("options", JSON.stringify({ resolution: "360p", fps: 10 }));
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "video" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/gif");
    const buf = Buffer.from(await res.arrayBuffer());
    // Real GIF (palettegen/paletteuse filtergraph produced it), not an empty stream.
    const magic = buf.subarray(0, 6).toString("ascii");
    expect(magic === "GIF89a" || magic === "GIF87a").toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  }, 30000);

  it("drops embedded EXIF metadata on server-side image conversion (inherent to the pipeline)", async () => {
    const form = new FormData();
    form.append("file", new File([EXIF_JPEG], "exif.jpg", { type: "image/jpeg" }));
    form.append("category", "image");
    form.append("targetFormat", "jpg");
    form.append("options", "{}");
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "image" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/jpeg");
    const buf = Buffer.from(await res.arrayBuffer());
    // Real JPEG output that no longer carries the source's EXIF APP1 segment
    // or its payload — the pipeline strips metadata unconditionally.
    expect(buf.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(buf.includes(Buffer.from([0xff, 0xe1]))).toBe(false);
    expect(buf.includes(Buffer.from("TestCam"))).toBe(false);
  }, 30000);

  it("enforces the 200MB video limit", async () => {
    const big = new Blob([Buffer.alloc(201 * 1024 * 1024, 0)]);
    const form = new FormData();
    form.append("file", new File([big], "big.mp4", { type: "video/mp4" }));
    form.append("category", "video");
    form.append("targetFormat", "mp4");
    form.append("options", "{}");
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "video" },
    });
    expect(res.status).toBe(413);
  }, 30000);
});

describe("Code template endpoint (honest snippets)", () => {
  async function getTemplate(body: Record<string, string>) {
    const res = await fetch(`${base}/api/code-template`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { code: { python: string } };
    return { res, data };
  }

  it("image server conversion (png->gif) shows ffmpeg + label", async () => {
    const { res, data } = await getTemplate({ category: "image", sourceFormat: "png", targetFormat: "gif" });
    expect(res.status).toBe(200);
    expect(data.code.python).toContain("ffmpeg");
    expect(data.code.python).toContain("Illustrative example");
  });

  it("video container (mp4->webm) uses the real codecs", async () => {
    const { res, data } = await getTemplate({ category: "video", sourceFormat: "mp4", targetFormat: "webm" });
    expect(res.status).toBe(200);
    expect(data.code.python).toContain("libvpx-vp9");
    expect(data.code.python).toContain("libopus");
    expect(data.code.python).toContain("Illustrative example");
  });

  it("video audio extraction (mp4->mp3) strips video and uses the audio codec", async () => {
    const { res, data } = await getTemplate({ category: "video", sourceFormat: "mp4", targetFormat: "mp3" });
    expect(res.status).toBe(200);
    expect(data.code.python).toContain("-vn");
    expect(data.code.python).toContain("libmp3lame");
  });

  it("audio (mp3->wav) shows the pydub example", async () => {
    const { res, data } = await getTemplate({ category: "audio", sourceFormat: "mp3", targetFormat: "wav" });
    expect(res.status).toBe(200);
    expect(data.code.python).toContain("pydub");
  });

  it("data (json->csv) shows an honest csv example", async () => {
    const { res, data } = await getTemplate({ category: "data", sourceFormat: "json", targetFormat: "csv" });
    expect(res.status).toBe(200);
    expect(data.code.python).toContain("import csv");
    expect(data.code.python).toContain("Illustrative example");
  });

  it("browser image (png->jpg) shows the PIL example", async () => {
    const { res, data } = await getTemplate({ category: "image", sourceFormat: "png", targetFormat: "jpg" });
    expect(res.status).toBe(200);
    expect(data.code.python).toContain("PIL");
    expect(data.code.python).toContain("Illustrative example");
  });
});
