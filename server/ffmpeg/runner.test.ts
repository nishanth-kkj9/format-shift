import { describe, it, expect, beforeAll, vi } from "vitest";
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

  it.skipIf(!binaryAvailable)("reports the active binary version and it meets the minimum", async () => {
    const version = await getFFmpegVersion();
    expect(version).toBeTruthy();
    expect(isFfmpegAtLeast(version, FFMPEG_MIN_FEATURE_VERSION)).toBe(true);
  });
});

describe("output size limit", () => {
  // The cap is read from the env validated at import time (server/config.ts),
  // so each scenario loads a fresh module graph with the cap set beforehand.
  async function loadRunnerWithCap(max: string) {
    const prev = process.env.FFMPEG_MAX_OUTPUT_BYTES;
    process.env.FFMPEG_MAX_OUTPUT_BYTES = max;
    vi.resetModules();
    try {
      return await import("./runner");
    } finally {
      if (prev === undefined) delete process.env.FFMPEG_MAX_OUTPUT_BYTES;
      else process.env.FFMPEG_MAX_OUTPUT_BYTES = prev;
    }
  }

  it("rejects output that exceeds FFMPEG_MAX_OUTPUT_BYTES and cleans up", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fs-r1-"));
    const input = join(dir, "in.png");
    writeFileSync(input, TINY_PNG);
    try {
      const { runFFmpeg, OutputLimitError, getFFmpegConcurrency } = await loadRunnerWithCap("10");
      await expect(runFFmpeg(["-f", "image2", "-c:v", "png"], { inputPath: input })).rejects.toBeInstanceOf(
        OutputLimitError
      );
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
      const { runFFmpeg } = await loadRunnerWithCap(String(1024 * 1024));
      const res = await runFFmpeg(["-f", "image2", "-c:v", "png"], { inputPath: input });
      expect(res.size).toBeGreaterThan(0);
      res.cleanup();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("kills a still-running ffmpeg that outgrows the cap (kill path) and reports OutputLimitError", async () => {
    // Point the runner's temp dir at a private dir so the leak check below can't
    // race with temp dirs created by concurrently running test files.
    const sandbox = mkdtempSync(join(tmpdir(), "fs-killpath-"));
    const prevTmp = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR };
    process.env.TEMP = process.env.TMP = process.env.TMPDIR = sandbox;
    const input = join(sandbox, "in.png");
    writeFileSync(input, TINY_PNG);
    try {
      const { runFFmpeg, OutputLimitError, getFFmpegConcurrency } = await loadRunnerWithCap("1024");
      // The endless lavfi sine keeps the child alive, so the 250ms poll
      // observes the cap being exceeded while the process is still running and
      // kills it (SIGKILL -> close with a null exit code). Only the fix that
      // checks outputLimitExceeded before the exit code turns this into an
      // OutputLimitError instead of a generic "ffmpeg failed (null)".
      const started = Date.now();
      await expect(
        runFFmpeg(
          [
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440",
            "-map",
            "1:a",
            "-c:a",
            "pcm_s16le",
            "-f",
            "wav",
            "-flush_packets",
            "1",
          ],
          { inputPath: input }
        )
      ).rejects.toBeInstanceOf(OutputLimitError);
      // The infinite source can never finish on its own: a fast rejection
      // proves the process was terminated by the limit guard, not normal exit.
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(getFFmpegConcurrency().active).toBe(0);
      // Output temp dir must have been cleaned up (only the input fixture remains).
      expect(readdirSync(sandbox)).toEqual(["in.png"]);
    } finally {
      if (prevTmp.TEMP === undefined) delete process.env.TEMP;
      else process.env.TEMP = prevTmp.TEMP;
      if (prevTmp.TMP === undefined) delete process.env.TMP;
      else process.env.TMP = prevTmp.TMP;
      if (prevTmp.TMPDIR === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = prevTmp.TMPDIR;
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 15_000);
});
