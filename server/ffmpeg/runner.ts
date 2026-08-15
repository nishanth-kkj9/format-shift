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
  /** kill the child process if it runs longer than this (ms) */
  timeoutMs?: number;
}

/**
 * Cap concurrent ffmpeg processes so a burst of conversions can't exhaust the
 * server's CPU/RAM. Defaults to 2; override with FFMPEG_MAX_CONCURRENCY.
 */
const MAX_CONCURRENT_FFMPEG = Math.max(1, Number(process.env.FFMPEG_MAX_CONCURRENCY) || 2);

let activeCount = 0;
const waiters: (() => void)[] = [];

function acquire(): Promise<void> {
  if (activeCount < MAX_CONCURRENT_FFMPEG) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiters.push(resolve)).then(() => {
    activeCount++;
  });
}

function release(): void {
  activeCount--;
  const next = waiters.shift();
  if (next) next();
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
 * A concurrency semaphore caps the number of simultaneous ffmpeg processes.
 */
export async function runFFmpeg(args: string[], opts: FFmpegRunOptions = {}): Promise<FFmpegResult> {
  await acquire();
  try {
    return await runFFmpegInner(args, opts);
  } finally {
    release();
  }
}

function runFFmpegInner(args: string[], opts: FFmpegRunOptions): Promise<FFmpegResult> {
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

    // Kill the child if it exceeds the timeout. Default: 10 minutes.
    const timeoutMs = opts.timeoutMs ?? (Number(process.env.FFMPEG_TIMEOUT_MS) || 10 * 60 * 1000);
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        if (!settled) {
          abort();
          // The "close" handler performs cleanup and rejects.
        }
      }, timeoutMs);
    }

    proc = spawn(ffmpegPath, ["-hide_banner", "-nostdin", ...inputArgs, ...args, outPath]);
    proc.stderr?.on("data", (c: Buffer) => err.push(c));
    proc.on("error", (e) => {
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      opts.signal?.removeEventListener("abort", abort);
      cleanupTempDir(outPath);
      reject(new Error(e.message));
    });
    proc.on("close", (code) => {
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
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
  });
}
