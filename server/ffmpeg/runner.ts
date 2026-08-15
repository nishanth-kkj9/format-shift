import { spawn, ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

export interface FFmpegResult {
  /** path to the completed output file */
  outPath: string;
  /** size of the output file in bytes */
  size: number;
  /** remove the temp dir holding outPath */
  cleanup: () => void;
}

export interface FFmpegRunOptions {
  inputPath?: string;
  /** kill the child process if this signal aborts */
  signal?: AbortSignal;
}

/** Best-effort cleanup of the temp dir created for an output file. */
export function cleanupTempDir(outPath: string | null): void {
  if (!outPath) return;
  try {
    rmSync(join(outPath, ".."), { recursive: true, force: true });
  } catch {
    // best-effort; ignore
  }
}

/**
 * Run ffmpeg, always writing output to a temp file so large/seekable containers
 * (mp4, mov, mkv, avif, ico) are never buffered in RAM and can be streamed to
 * the HTTP response afterwards. Aborting the signal kills the child and cleans up.
 */
export function runFFmpeg(args: string[], opts: FFmpegRunOptions = {}): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg binary not available"));

    const tempDir = mkdtempSync(join(tmpdir(), "fs-"));
    const outPath = join(tempDir, "output.bin");
    const inputArgs = opts.inputPath ? ["-i", opts.inputPath] : ["-i", "pipe:0"];

    let proc: ChildProcess;
    const err: Buffer[] = [];
    let settled = false;

    const abort = () => {
      if (!settled && proc && proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
    };
    opts.signal?.addEventListener("abort", abort, { once: true });

    proc = spawn(ffmpegPath, ["-hide_banner", "-nostdin", ...inputArgs, ...args, outPath]);
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("error", (e) => {
      settled = true;
      opts.signal?.removeEventListener("abort", abort);
      cleanupTempDir(outPath);
      reject(new Error(e.message));
    });
    proc.on("close", (code) => {
      settled = true;
      opts.signal?.removeEventListener("abort", abort);
      if (opts.signal?.aborted) {
        cleanupTempDir(outPath);
        reject(new DOMException("Conversion aborted", "AbortError"));
        return;
      }
      if (code === 0) {
        let size = 0;
        try {
          size = statSync(outPath).size;
        } catch {
          // leave 0; route falls back to no Content-Length header
        }
        resolve({ outPath, size, cleanup: () => cleanupTempDir(outPath) });
      } else {
        cleanupTempDir(outPath);
        const stderr = Buffer.concat(err).toString("utf8");
        const lastErr = stderr.split("\n").filter(Boolean).slice(-3).join("\n");
        reject(new Error(`ffmpeg failed (${code}): ${lastErr}`));
      }
    });

    if (!opts.inputPath) {
      // input will be piped by the caller; nothing to write here
    }
  });
}
