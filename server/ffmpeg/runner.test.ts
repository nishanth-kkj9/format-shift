import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import {
  parseFfmpegVersion,
  isFfmpegAtLeast,
  getFFmpegVersion,
  MIN_FFMPEG_VERSION,
  FFMPEG_BIN,
} from "./runner";

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
    expect(isFfmpegAtLeast("4.2.0", MIN_FFMPEG_VERSION)).toBe(true);
    expect(isFfmpegAtLeast("6.1.1", MIN_FFMPEG_VERSION)).toBe(true);
    expect(isFfmpegAtLeast("5.1.1", "4.2.0")).toBe(true);
  });

  it("rejects older versions and null", () => {
    expect(isFfmpegAtLeast("4.1.0", MIN_FFMPEG_VERSION)).toBe(false);
    expect(isFfmpegAtLeast("4.2", "4.2.1")).toBe(false);
    expect(isFfmpegAtLeast(null, MIN_FFMPEG_VERSION)).toBe(false);
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
    expect(isFfmpegAtLeast(version, MIN_FFMPEG_VERSION)).toBe(true);
  });
});
