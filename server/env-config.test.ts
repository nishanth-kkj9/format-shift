import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "node:http";

// Runtime env knobs are validated once at import time (server/config.ts) and
// read from that validated object (server/ffmpeg/runner.ts). These tests need
// a fresh module graph with the env set BEFORE the app boots, so they cannot
// live in integration.test.ts (which imports the app statically).

// 1x1 transparent PNG — has real PNG magic bytes (\x89PNG\r\n\x1a\n)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let server: Server;
let base: string;

beforeAll(async () => {
  process.env.FFMPEG_MAX_OUTPUT_BYTES = "1";
  process.env.FFMPEG_MIN_FEATURE_VERSION = "999.0.0";
  vi.resetModules();
  const { app } = await import("./app");
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
  delete process.env.FFMPEG_MAX_OUTPUT_BYTES;
  delete process.env.FFMPEG_MIN_FEATURE_VERSION;
});

describe("Import-time env config is actually enforced", () => {
  it("reports ffmpegFeatureCompatible: false when FFMPEG_MIN_FEATURE_VERSION exceeds the installed ffmpeg", async () => {
    const res = await fetch(`${base}/api/ready`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ffmpegFeatureCompatible).toBe(false);
  });

  it("returns 413 when ffmpeg output exceeds the configured cap", async () => {
    const form = new FormData();
    form.append("file", new File([TINY_PNG], "cap.png", { type: "image/png" }));
    form.append("category", "image");
    form.append("targetFormat", "webp");
    form.append("options", "{}");
    const res = await fetch(`${base}/api/convert`, { method: "POST", body: form });
    expect(res.status).toBe(413);
  }, 30000);
});