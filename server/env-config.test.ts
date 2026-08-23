import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "node:http";
import { envSchema } from "./config";

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
    const res = await fetch(`${base}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "image" },
    });
    expect(res.status).toBe(413);
  }, 30000);
});

describe("env schema semantic upper bounds", () => {
  it("accepts an empty env (all defaults)", () => {
    expect(envSchema.safeParse({}).success).toBe(true);
  });

  it("accepts boundary values", () => {
    expect(envSchema.safeParse({ PORT: "65535" }).success).toBe(true);
    expect(envSchema.safeParse({ FFMPEG_MAX_CONCURRENCY: "64" }).success).toBe(true);
    expect(envSchema.safeParse({ FFMPEG_TIMEOUT_MS: "1800000" }).success).toBe(true);
    expect(envSchema.safeParse({ FFMPEG_MAX_OUTPUT_BYTES: "4294967296" }).success).toBe(true);
  });

  it("rejects PORT above 65535", () => {
    expect(envSchema.safeParse({ PORT: "70000" }).success).toBe(false);
  });

  it("rejects absurdly high FFMPEG_MAX_CONCURRENCY", () => {
    expect(envSchema.safeParse({ FFMPEG_MAX_CONCURRENCY: "100" }).success).toBe(false);
  });

  it("rejects FFMPEG_TIMEOUT_MS above 30 minutes", () => {
    expect(envSchema.safeParse({ FFMPEG_TIMEOUT_MS: "3600000" }).success).toBe(false);
  });

  it("rejects FFMPEG_MAX_OUTPUT_BYTES above 4 GiB", () => {
    expect(envSchema.safeParse({ FFMPEG_MAX_OUTPUT_BYTES: "8589934592" }).success).toBe(false);
  });

  it("accepts a sane CODE_TEMPLATE_RATE_LIMIT_MAX and rejects absurd values", () => {
    expect(envSchema.safeParse({ CODE_TEMPLATE_RATE_LIMIT_MAX: "120" }).success).toBe(true);
    expect(envSchema.safeParse({ CODE_TEMPLATE_RATE_LIMIT_MAX: "10000" }).success).toBe(true);
    expect(envSchema.safeParse({ CODE_TEMPLATE_RATE_LIMIT_MAX: "10001" }).success).toBe(false);
    expect(envSchema.safeParse({ CODE_TEMPLATE_RATE_LIMIT_MAX: "0" }).success).toBe(false);
    expect(envSchema.safeParse({ CODE_TEMPLATE_RATE_LIMIT_MAX: "-5" }).success).toBe(false);
    expect(envSchema.safeParse({ CODE_TEMPLATE_RATE_LIMIT_MAX: "abc" }).success).toBe(false);
  });

  it("accepts well-formed version pins as major.minor.patch", () => {
    expect(envSchema.safeParse({ FFMPEG_MIN_SECURITY_VERSION: "5.1.9" }).success).toBe(true);
    expect(envSchema.safeParse({ FFMPEG_MIN_FEATURE_VERSION: "4.2.0" }).success).toBe(true);
  });

  it("rejects malformed FFMPEG_MIN_SECURITY_VERSION values", () => {
    expect(envSchema.safeParse({ FFMPEG_MIN_SECURITY_VERSION: "5.1" }).success).toBe(false);
    expect(envSchema.safeParse({ FFMPEG_MIN_SECURITY_VERSION: "5" }).success).toBe(false);
    expect(envSchema.safeParse({ FFMPEG_MIN_SECURITY_VERSION: "5.1.x" }).success).toBe(false);
    expect(envSchema.safeParse({ FFMPEG_MIN_SECURITY_VERSION: "v5.1.9" }).success).toBe(false);
  });

  it("rejects malformed FFMPEG_MIN_FEATURE_VERSION values", () => {
    expect(envSchema.safeParse({ FFMPEG_MIN_FEATURE_VERSION: "4.2" }).success).toBe(false);
    expect(envSchema.safeParse({ FFMPEG_MIN_FEATURE_VERSION: "4" }).success).toBe(false);
  });
});

describe("FFmpeg timeout is reported distinctly", () => {
  let server2: Server;
  let base2: string;

  beforeAll(async () => {
    process.env.FFMPEG_TIMEOUT_MS = "1";
    vi.resetModules();
    const { app } = await import("./app");
    await new Promise<void>((resolve) => {
      server2 = app.listen(0, "127.0.0.1", () => {
        const addr = server2.address();
        base2 = `http://127.0.0.1:${(addr as { port: number }).port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server2.close();
    delete process.env.FFMPEG_TIMEOUT_MS;
  });

  it("returns 504 when a conversion exceeds the timeout", async () => {
    const form = new FormData();
    form.append("file", new File([TINY_PNG], "cap.png", { type: "image/png" }));
    form.append("category", "image");
    form.append("targetFormat", "webp");
    form.append("options", "{}");
    const res = await fetch(`${base2}/api/convert`, {
      method: "POST",
      body: form,
      headers: { "x-category": "image" },
    });
    expect(res.status).toBe(504);
  }, 30000);
});
