import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { imageArgs, imageFilters } from "./ffmpeg/filters";
import { videoArgs } from "./ffmpeg/video";
import { runFFmpeg } from "./ffmpeg/runner";
import { validateOptions, InvalidOptionError, OPTIONS_SCHEMA } from "./convert";
import { SERVER_OPTION_KEYS } from "../src/core/conversionRegistry";
import {
  acquireFFmpegSlot,
  releaseFFmpegSlot,
  ServerBusyError,
  sanitizeFfmpegStderr,
  getFFmpegConcurrency,
} from "./ffmpeg/runner";

describe("imageFilters", () => {
  it("returns empty args for default options", () => {
    expect(imageFilters({ targetFormat: "png", category: "image" })).toEqual([]);
  });

  it("adds grayscale filter", () => {
    const result = imageFilters({ targetFormat: "png", category: "image", grayscale: true });
    expect(result).toContain("-vf");
    expect(result.join(" ")).toContain("format=gray");
  });

  it("maps rotation to the correct transpose/flip filters", () => {
    // Client canvas rotates clockwise, so the server must match: 90°=CW
    // (transpose=1), 270°=90° CCW (transpose=2), 180°=two axis flips.
    // transpose=0 (90° CCW + vertical flip) is NOT a valid mapping: it would
    // turn a 270° request into a 90° CW rotation.
    const vf90 = imageFilters({ targetFormat: "png", category: "image", rotation: 90 }).join(" ");
    const vf180 = imageFilters({ targetFormat: "png", category: "image", rotation: 180 }).join(" ");
    const vf270 = imageFilters({ targetFormat: "png", category: "image", rotation: 270 }).join(" ");
    expect(vf90).toContain("transpose=1");
    expect(vf180).toContain("hflip");
    expect(vf180).toContain("vflip");
    expect(vf270).toContain("transpose=2");
    expect(vf90).not.toContain("transpose=0");
  });

  it("applies no rotation filter for rotation 0", () => {
    expect(imageFilters({ targetFormat: "png", category: "image", rotation: 0 })).toEqual([]);
  });

  it("adds scale filter for maxWidth", () => {
    const result = imageFilters({ targetFormat: "png", category: "image", maxWidth: 1920 });
    expect(result.join(" ")).toContain("scale=1920:-2");
  });

  it("adds quality args for jpg", () => {
    const result = imageFilters({ targetFormat: "jpg", category: "image", quality: 90 });
    expect(result).toContain("-q:v");
  });

  it("adds quality args for webp", () => {
    const result = imageFilters({ targetFormat: "webp", category: "image", quality: 85 });
    expect(result).toContain("-quality");
    expect(result).toContain("85");
  });

  it("adds crf for avif", () => {
    const result = imageFilters({ targetFormat: "avif", category: "image", quality: 90 });
    expect(result).toContain("-crf");
  });

  it("adds ico scale", () => {
    const result = imageFilters({ targetFormat: "ico", category: "image" });
    expect(result.join(" ")).toContain("scale=32:32");
  });

  it("adds single-pass palette chain for gif", () => {
    const result = imageFilters({ targetFormat: "gif", category: "image" });
    const vf = result.join(" ");
    expect(vf).toContain("-vf");
    expect(vf).toContain("split[s0][s1]");
    expect(vf).toContain("palettegen");
    expect(vf).toContain("paletteuse");
  });
});

describe("videoArgs", () => {
  it("uses the target muxer without a duplicate gif -f", () => {
    const args = videoArgs({ targetFormat: "gif", category: "video" });
    const fIdx = args.lastIndexOf("-f");
    expect(fIdx).toBeGreaterThan(-1);
    expect(args[fIdx + 1]).toBe("gif");
    expect(args.filter((a) => a === "-f")).toHaveLength(1);
  });

  it("adds a single-pass palette chain for gif", () => {
    const vf = videoArgs({ targetFormat: "gif", category: "video" }).join(" ");
    expect(vf).toContain("split[s0][s1]");
    expect(vf).toContain("palettegen=stats_mode=diff");
    expect(vf).toContain("paletteuse");
  });

  it("does not add palette filters for non-gif targets", () => {
    const args = videoArgs({ targetFormat: "mp4", category: "video" });
    expect(args).not.toContain("-vf");
    expect(args).not.toContain("palettegen");
  });
});

describe("ico conversion output", () => {
  const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );

  it("uses the ico muxer so output bytes are a real ICO file", async () => {
    const args = imageArgs({ targetFormat: "ico", category: "image" });
    expect(args).toContain("-f");
    expect(args[args.indexOf("-f") + 1]).toBe("ico");

    const dir = mkdtempSync(join(tmpdir(), "fs-ico-test-"));
    try {
      const inputPath = join(dir, "in.png");
      writeFileSync(inputPath, TINY_PNG);
      const { outPath, cleanup } = await runFFmpeg(args, { inputPath });
      try {
        const { readFileSync } = await import("node:fs");
        const out = readFileSync(outPath);
        // ICO header: reserved=0x0000, type=0x0001 (icon)
        expect(out.subarray(0, 2).equals(Buffer.from([0x00, 0x00]))).toBe(true);
        expect(out.subarray(2, 4).equals(Buffer.from([0x01, 0x00]))).toBe(true);
      } finally {
        cleanup();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});

describe("validateOptions", () => {
  it("rejects unknown keys so ffmpeg args cannot be smuggled", () => {
    expect(() =>
      validateOptions({ targetFormat: "jpg", category: "image", "-map": "evil" } as never)
    ).toThrow(InvalidOptionError);
    expect(() =>
      validateOptions({ targetFormat: "jpg", category: "image", output: "/tmp/pwned" } as never)
    ).toThrow(InvalidOptionError);
  });

  it("passes valid options", () => {
    const opts = {
      targetFormat: "jpg",
      category: "image",
      quality: 85,
      rotation: 90,
      maxWidth: 1920,
      maxHeight: 1080,
    };
    expect(() => validateOptions(opts)).not.toThrow();
  });

  it("rejects quality out of range (0)", () => {
    expect(() => validateOptions({ targetFormat: "jpg", category: "image", quality: 0 })).toThrow(
      InvalidOptionError
    );
  });

  it("rejects quality out of range (101)", () => {
    expect(() => validateOptions({ targetFormat: "jpg", category: "image", quality: 101 })).toThrow(
      InvalidOptionError
    );
  });

  it("rejects invalid rotation", () => {
    expect(() => validateOptions({ targetFormat: "jpg", category: "image", rotation: 45 })).toThrow(
      InvalidOptionError
    );
  });

  it("accepts valid rotations (0, 90, 180, 270)", () => {
    for (const r of [0, 90, 180, 270]) {
      expect(() => validateOptions({ targetFormat: "jpg", category: "image", rotation: r })).not.toThrow();
    }
  });

  it("rejects invalid bitrate", () => {
    expect(() => validateOptions({ targetFormat: "mp3", category: "audio", bitrate: "500k" })).toThrow(
      InvalidOptionError
    );
  });

  it("accepts valid bitrates", () => {
    for (const b of ["128k", "192k", "256k", "320k"]) {
      expect(() => validateOptions({ targetFormat: "mp3", category: "audio", bitrate: b })).not.toThrow();
    }
  });

  it("rejects invalid sampleRate", () => {
    expect(() => validateOptions({ targetFormat: "mp3", category: "audio", sampleRate: 32000 })).toThrow(
      InvalidOptionError
    );
  });

  it("accepts valid sampleRates", () => {
    for (const sr of [8000, 11025, 22050, 44100, 48000, 96000]) {
      expect(() => validateOptions({ targetFormat: "mp3", category: "audio", sampleRate: sr })).not.toThrow();
    }
  });

  it("rejects invalid channels", () => {
    expect(() => validateOptions({ targetFormat: "mp3", category: "audio", channels: 3 })).toThrow(
      InvalidOptionError
    );
  });

  it("accepts valid channels (1, 2)", () => {
    expect(() => validateOptions({ targetFormat: "mp3", category: "audio", channels: 1 })).not.toThrow();
    expect(() => validateOptions({ targetFormat: "mp3", category: "audio", channels: 2 })).not.toThrow();
  });

  it("rejects volume out of range (negative)", () => {
    expect(() => validateOptions({ targetFormat: "mp3", category: "audio", volume: -10 })).toThrow(
      InvalidOptionError
    );
  });

  it("rejects volume out of range (>200)", () => {
    expect(() => validateOptions({ targetFormat: "mp3", category: "audio", volume: 201 })).toThrow(
      InvalidOptionError
    );
  });

  it("accepts valid volume (0-200)", () => {
    for (const v of [0, 50, 100, 150, 200]) {
      expect(() => validateOptions({ targetFormat: "mp3", category: "audio", volume: v })).not.toThrow();
    }
  });

  it("rejects negative trimStart", () => {
    expect(() => validateOptions({ targetFormat: "mp3", category: "audio", trimStart: -1 })).toThrow(
      InvalidOptionError
    );
  });

  it("rejects negative trimEnd", () => {
    expect(() => validateOptions({ targetFormat: "mp3", category: "audio", trimEnd: -1 })).toThrow(
      InvalidOptionError
    );
  });

  it("accepts valid trimStart/trimEnd", () => {
    expect(() =>
      validateOptions({ targetFormat: "mp3", category: "audio", trimStart: 0.5, trimEnd: 120 })
    ).not.toThrow();
  });

  it("rejects invalid resolution", () => {
    expect(() => validateOptions({ targetFormat: "mp4", category: "video", resolution: "2k" })).toThrow(
      InvalidOptionError
    );
  });

  it("accepts valid resolutions", () => {
    for (const r of ["original", "1080p", "720p", "480p", "360p"]) {
      expect(() => validateOptions({ targetFormat: "mp4", category: "video", resolution: r })).not.toThrow();
    }
  });

  it("rejects invalid fps", () => {
    expect(() => validateOptions({ targetFormat: "mp4", category: "video", fps: 0 })).toThrow(
      InvalidOptionError
    );
    expect(() => validateOptions({ targetFormat: "mp4", category: "video", fps: 121 })).toThrow(
      InvalidOptionError
    );
  });

  it("accepts valid fps (1-120)", () => {
    for (const f of [1, 24, 30, 60, 120]) {
      expect(() => validateOptions({ targetFormat: "mp4", category: "video", fps: f })).not.toThrow();
    }
  });

  it("rejects invalid maxWidth", () => {
    expect(() => validateOptions({ targetFormat: "jpg", category: "image", maxWidth: 0 })).toThrow(
      InvalidOptionError
    );
    expect(() => validateOptions({ targetFormat: "jpg", category: "image", maxWidth: 10001 })).toThrow(
      InvalidOptionError
    );
  });

  it("rejects invalid maxHeight", () => {
    expect(() => validateOptions({ targetFormat: "jpg", category: "image", maxHeight: 0 })).toThrow(
      InvalidOptionError
    );
    expect(() => validateOptions({ targetFormat: "jpg", category: "image", maxHeight: 10001 })).toThrow(
      InvalidOptionError
    );
  });

  it("stays in sync with the shared SERVER_OPTION_KEYS contract", () => {
    expect(Object.keys(OPTIONS_SCHEMA.shape).sort()).toEqual([...SERVER_OPTION_KEYS].sort());
  });
});

describe("ffmpeg concurrency queue", () => {
  it("rejects new jobs with ServerBusyError when the queue is full", async () => {
    const { max } = getFFmpegConcurrency();
    const queueCap = max * 5;
    for (let i = 0; i < max; i++) await acquireFFmpegSlot();
    for (let i = 0; i < queueCap; i++) {
      void acquireFFmpegSlot(); // parks in the queue; never awaited
    }
    try {
      await expect(acquireFFmpegSlot()).rejects.toBeInstanceOf(ServerBusyError);
    } finally {
      // one release per held job (max active + queueCap queued)
      for (let i = 0; i < max + queueCap; i++) releaseFFmpegSlot();
    }
  });

  it("queues a new job once a slot frees up", async () => {
    const { max } = getFFmpegConcurrency();
    for (let i = 0; i < max; i++) await acquireFFmpegSlot();
    try {
      const pending = acquireFFmpegSlot();
      releaseFFmpegSlot(); // free one slot -> queued job resolves
      await pending;
      releaseFFmpegSlot(); // release the queued job's slot
    } finally {
      for (let i = 0; i < max - 1; i++) releaseFFmpegSlot();
    }
  });

  it("increments active synchronously when a queued job is granted a slot", async () => {
    const { max } = getFFmpegConcurrency();
    for (let i = 0; i < max; i++) await acquireFFmpegSlot();
    const pending = acquireFFmpegSlot();
    try {
      releaseFFmpegSlot(); // grant the queued slot
      // Sync check before any microtask flush: the granted job must already be
      // counted as active (regression guard for the .then() increment).
      expect(getFFmpegConcurrency().active).toBe(max);
      await pending;
      releaseFFmpegSlot(); // release the granted job's slot
    } finally {
      for (let i = 0; i < max - 1; i++) releaseFFmpegSlot();
    }
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const { active, queued } = getFFmpegConcurrency();
    const controller = new AbortController();
    controller.abort();
    await expect(acquireFFmpegSlot(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    // no slot was consumed
    expect(getFFmpegConcurrency()).toEqual({ max: expect.any(Number), active, queued });
  });

  it("removes an aborted job from the queue", async () => {
    const { max } = getFFmpegConcurrency();
    for (let i = 0; i < max; i++) await acquireFFmpegSlot();
    try {
      const controller = new AbortController();
      const queued = acquireFFmpegSlot(controller.signal);
      expect(getFFmpegConcurrency().queued).toBe(1);
      controller.abort();
      await expect(queued).rejects.toMatchObject({ name: "AbortError" });
      expect(getFFmpegConcurrency().queued).toBe(0);
    } finally {
      for (let i = 0; i < max; i++) releaseFFmpegSlot();
    }
  });

  it("frees the slot for the next waiter after an abort", async () => {
    const { max } = getFFmpegConcurrency();
    for (let i = 0; i < max; i++) await acquireFFmpegSlot();
    try {
      const aborted = new AbortController();
      const doomed = acquireFFmpegSlot(aborted.signal);
      aborted.abort();
      await expect(doomed).rejects.toMatchObject({ name: "AbortError" });

      const survivor = acquireFFmpegSlot();
      releaseFFmpegSlot(); // frees the slot the aborted job would have taken
      await survivor; // the next queued job still gets a slot
      releaseFFmpegSlot();
    } finally {
      for (let i = 0; i < max - 1; i++) releaseFFmpegSlot();
    }
  });

  it("runFFmpeg rejects with AbortError when the signal aborts while queued", async () => {
    const { max } = getFFmpegConcurrency();
    for (let i = 0; i < max; i++) await acquireFFmpegSlot();
    try {
      const controller = new AbortController();
      const pending = runFFmpeg(["-version"], { signal: controller.signal });
      expect(getFFmpegConcurrency().queued).toBe(1);
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
      expect(getFFmpegConcurrency().queued).toBe(0);
    } finally {
      for (let i = 0; i < max; i++) releaseFFmpegSlot();
    }
  });
});

describe("sanitizeFfmpegStderr", () => {
  it("strips pointer addresses and absolute temp paths", () => {
    const raw = [
      "frame=  1 fps=0.0 q=-0.0 size=N/A time=00:00:00.00 bitrate=N/A speed=0x",
      "[libx264 @ 0x7f8a4c003a00] using cpu capabilities",
      "Error opening input file /tmp/fs-up-ab12cd34ef5678/input-1234567890ab.bin",
      "C:\\Users\\user\\AppData\\Local\\Temp\\fs-up-x\\input-y.bin: No such file",
    ].join("\n");
    const clean = sanitizeFfmpegStderr(raw);
    expect(clean).not.toContain("0x7f8a4c003a00");
    expect(clean).not.toContain("/tmp/fs-up-");
    expect(clean).not.toContain("AppData");
    expect(clean).not.toContain("@ 0x");
    expect(clean).not.toContain("\n");
  });

  it("keeps the human-readable error line", () => {
    const clean = sanitizeFfmpegStderr("Invalid data found when processing input\n[mov @ 0x1] bad box\n");
    expect(clean).toContain("Invalid data found when processing input");
  });
});
