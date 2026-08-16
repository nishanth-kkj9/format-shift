import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseFfmpegVersion,
  isFfmpegAtLeast,
  getFFmpegVersion,
  FFMPEG_MIN_FEATURE_VERSION,
  FFMPEG_BIN,
  runFFmpeg,
  OutputLimitError,
  getFFmpegConcurrency,
} from "./runner";

// 1x1 transparent PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("parseFfmpegVersion", () => {
  it("parses the version from real -version output shapes", () => {
    expect(parseFfmpegVersion("ffmpeg version 6.1.1-full_build-www.gyan.dev Copyright (c) 2000-2023")).toBe(
      "6.1.1"
    );
    expect(parseFfmpegVersion("ffmpeg version n6.1.1 Copyright (c) 2000-2023")).toBe("6.1.1");
    expect(parseFfmpegVersion("ffmpeg version 5.1.1-tessus Copyright (c) 2000-2022")).toBe("5.1.1");
  });

  it("returns null for unparseable output", () => {
    expect(parseFfmpegVersion("ffmpeg not found")).toBeNull();
    expect(parseFfmpegVersion("")).toBeNull();
  });
});

describe("isFfmpegAtLeast", () => {
  it("accepts equal and newer versions", () => {
    expect(isFfmpegAtLeast("4.2.0", FFMPEG_MIN_FEATURE_VERSION)).toBe(true);
    expect(isFfmpegAtLeast("6.1.1", FFMPEG_MIN_FEATURE_VERSION)).toBe(true);
    expect(isFfmpegAtLeast("5.1.1", "4.2.0")).toBe(true);
  });

  it("rejects older versions and null", () => {
    expect(isFfmpegAtLeast("4.1.0", FFMPEG_MIN_FEATURE_VERSION)).toBe(false);
    expect(isFfmpegAtLeast("4.2", "4.2.1")).toBe(false);
    expect(isFfmpegAtLeast(null, FFMPEG_MIN_FEATURE_VERSION)).toBe(false);
  });
});

describe("resolved ffmpeg binary version", () => {
  let binaryAvailable = true;

  beforeAll(() => {
    try {
      execFileSync(FFMPEG_BIN, ["-version"], { stdio: "ignore" });
    } catch {
      binaryAvailable = false;
    }
  });

  it.skipIf(!binaryAvailable)("reports the active binary version and it meets the minimum", () => {
    const version = getFFmpegVersion();
    expect(version).toBeTruthy();
    expect(isFfmpegAtLeast(version, FFMPEG_MIN_FEATURE_VERSION)).toBe(true);
  });
});

describe("output size limit", () => {
  function withOutputLimit(max: string, fn: () => Promise<void>) {
    const prev = process.env.FFMPEG_MAX_OUTPUT_BYTES;
    process.env.FFMPEG_MAX_OUTPUT_BYTES = max;
    return fn().finally(() => {
      if (prev === undefined) delete process.env.FFMPEG_MAX_OUTPUT_BYTES;
      else process.env.FFMPEG_MAX_OUTPUT_BYTES = prev;
    });
  }

  it("rejects output that exceeds FFMPEG_MAX_OUTPUT_BYTES and cleans up", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fs-r1-"));
    const input = join(dir, "in.png");
    writeFileSync(input, TINY_PNG);
    try {
      await withOutputLimit("10", async () => {
        await expect(runFFmpeg(["-f", "image2", "-c:v", "png"], { inputPath: input })).rejects.toBeInstanceOf(
          OutputLimitError
        );
      });
      expect(getFFmpegConcurrency().active).toBe(0);
      expect(readdirSync(dir)).toEqual(["in.png"]); // output temp dir removed
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts output under the limit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fs-r1-"));
    const input = join(dir, "in.png");
    writeFileSync(input, TINY_PNG);
    try {
      await withOutputLimit(String(1024 * 1024), async () => {
        const res = await runFFmpeg(["-f", "image2", "-c:v", "png"], { inputPath: input });
        expect(res.size).toBeGreaterThan(0);
        res.cleanup();
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
