import { describe, it, expect, vi } from "vitest";

// Covers the two import-time fallback branches in runner.ts that cannot be
// reached under normal vitest conditions (real ESM always has a working
// import.meta.url, and ffmpeg-static is installed as a devDependency):
//   1. createRequire(import.meta.url) throwing -> cwd-based require fallback
//   2. require("ffmpeg-static") throwing -> "ffmpeg" on PATH
// The first createRequire call (the import.meta.url form) throws; the
// cwd-based fallback succeeds but its returned require cannot resolve
// ffmpeg-static, exercising both catch blocks in one module load.

const { createRequire } = vi.hoisted(() => {
  let firstCall = true;
  return {
    createRequire: vi.fn((_url?: string) => {
      if (firstCall) {
        firstCall = false;
        throw new Error("import.meta.url unavailable in this module shape");
      }
      return () => {
        throw new Error("Cannot find module 'ffmpeg-static'");
      };
    }),
  };
});

vi.mock("node:module", () => ({ createRequire }));

describe("runner binary-resolution fallbacks", () => {
  it("falls back to the PATH binary when neither import.meta.url nor ffmpeg-static resolve", async () => {
    const prevFFmpegPath = process.env.FFMPEG_PATH;
    delete process.env.FFMPEG_PATH;
    try {
      vi.resetModules();
      const runner = await import("./runner");
      expect(runner.FFMPEG_BIN).toBe("ffmpeg");
    } finally {
      if (prevFFmpegPath !== undefined) process.env.FFMPEG_PATH = prevFFmpegPath;
    }
  });
});
