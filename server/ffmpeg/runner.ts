import { spawn, ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// createRequire works under both tsx (ESM) and the esbuild CJS bundle.
let nodeRequire: NodeRequire;
try {
  nodeRequire = createRequire(import.meta.url);
} catch {
  nodeRequire = createRequire(join(process.cwd(), "package.json"));
}

/**
 * Resolve the ffmpeg binary in priority order:
 * 1. FFMPEG_PATH env (Docker installs system ffmpeg at /usr/bin/ffmpeg)
 * 2. bundled ffmpeg-static binary (local dev fallback, devDependency)
 * 3. "ffmpeg" on PATH (system install)
 */
function resolveFfmpegBinary(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return nodeRequire("ffmpeg-static") as string;
  } catch {
    return "ffmpeg";
  }
}

export const FFMPEG_BIN: string = resolveFfmpegBinary();

export interface FFmpegResult {
  /** path to the completed output file */
  outPath: string;
  /** size of the output file in bytes */
  size: number;
  /** the temp dir that holds outPath (exposed so callers can inspect/stream) */
  tempDir: string;
  /** remove the temp dir holding outPath */
  cleanup: () => void;
}

export interface FFmpegRunOptions {
  inputPath?: string | undefined;
  /** kill the child process if this signal aborts */
  signal?: AbortSignal | undefined;
  /** kill the child process if it runs longer than this (ms) */
  timeoutMs?: number | undefined;
}

/**
 * Cap concurrent ffmpeg processes so a burst of conversions can't exhaust the
 * server's CPU/RAM. Defaults to 2; override with FFMPEG_MAX_CONCURRENCY.
 */
const MAX_CONCURRENT_FFMPEG = Math.max(1, Number(process.env.FFMPEG_MAX_CONCURRENCY) || 2);

/** Max jobs parked in the queue before new conversions are rejected (503). */
const MAX_QUEUE = Math.max(1, MAX_CONCURRENT_FFMPEG * 5);

/** Default ffmpeg timeout (ms). Override via FFMPEG_TIMEOUT_MS. */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Thrown when the ffmpeg queue is full; the route maps it to HTTP 503. */
export class ServerBusyError extends Error {
  constructor() {
    super("Server is busy, please retry shortly");
    this.name = "ServerBusyError";
  }
}

let activeCount = 0;
const waiters: (() => void)[] = [];

/** Get current FFmpeg concurrency metrics. */
export function getFFmpegConcurrency(): { max: number; active: number; queued: number } {
  return { max: MAX_CONCURRENT_FFMPEG, active: activeCount, queued: waiters.length };
}

/**
 * Acquire an ffmpeg slot, or park in the bounded queue. When the queue is full
 * (an abuse or overload signal) the request is rejected instead of growing
 * unbounded. Exported for unit testing.
 */
export function acquireFFmpegSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT_FFMPEG) {
    activeCount++;
    return Promise.resolve();
  }
  if (waiters.length >= MAX_QUEUE) {
    return Promise.reject(new ServerBusyError());
  }
  return new Promise<void>((resolve) => waiters.push(resolve)).then(() => {
    activeCount++;
  });
}

/** Release an acquired ffmpeg slot and wake the next queued waiter. */
export function releaseFFmpegSlot(): void {
  activeCount--;
  const next = waiters.shift();
  if (next) next();
}

/**
 * Keep ffmpeg's stderr out of error responses except for the human-readable
 * part: strip pointer addresses and absolute temp paths (server-side paths
 * aren't a leak by themselves, but codec internals + paths are noise and
 * slightly useful to an attacker probing the ffmpeg build).
 */
export function sanitizeFfmpegStderr(stderr: string): string {
  return stderr
    .replace(/\s*@\s*0x[0-9a-f]+/gi, "")
    .replace(/(?:[A-Za-z]:)?[\\/][^\\/\s]*[\\/][^\\/\s]*/g, "…")
    .split("\n")
    .filter(Boolean)
    .slice(-3)
    .join(" | ");
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
  await acquireFFmpegSlot();
  try {
    return await runFFmpegInner(args, opts);
  } finally {
    releaseFFmpegSlot();
  }
}

function runFFmpegInner(args: string[], opts: FFmpegRunOptions): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_BIN) return reject(new Error("ffmpeg binary not available"));

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

    // Kill the child if it exceeds the timeout.
    const timeoutMs = opts.timeoutMs ?? (Number(process.env.FFMPEG_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        if (!settled) {
          abort();
          // The "close" handler performs cleanup and rejects.
        }
      }, timeoutMs);
    }

    proc = spawn(FFMPEG_BIN, ["-hide_banner", "-nostdin", ...inputArgs, ...args, outPath]);
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
        resolve({ outPath, tempDir, size, cleanup: () => cleanupTempDir(outPath) });
      } else {
        cleanupTempDir(outPath);
        reject(
          new Error(`ffmpeg failed (${code}): ${sanitizeFfmpegStderr(Buffer.concat(err).toString("utf8"))}`)
        );
      }
    });
  });
}
