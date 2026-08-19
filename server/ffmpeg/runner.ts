import { spawn, ChildProcess, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { env } from "../config";

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

/**
 * Oldest FFmpeg release the app relies on: 4.2 introduced the ico muxer used by
 * the image pipeline; every audio/video target needs far less. Local dev
 * falls back to ffmpeg-static 5.3.0 (ships FFmpeg 6.1.1); Docker installs the
 * distro package and points FFMPEG_PATH at it. The resolved binary's version is
 * observed at runtime and reported on /api/health — nothing fails hard here so
 * CI/dev environments without a binary keep working. Overridable via
 * FFMPEG_MIN_FEATURE_VERSION (validated in config.ts).
 */
export const FFMPEG_MIN_FEATURE_VERSION = env.FFMPEG_MIN_FEATURE_VERSION || "4.2.0";

/**
 * Oldest FFmpeg release that still receives security backports (FFmpeg LTS /
 * current distro baseline). Defaults to 5.1.0: Debian bookworm (the node:20-slim
 * Docker base) ships a security-patched 5.1.4, so a higher default would make
 * the health/ready gates always fail for the shipped image. Overridable via
 * FFMPEG_MIN_SECURITY_VERSION (validated in config.ts) for stricter policies.
 */
export const FFMPEG_MIN_SECURITY_VERSION = env.FFMPEG_MIN_SECURITY_VERSION || "5.1.0";

/** Parse `ffmpeg -version` output into "major.minor.patch", or null. */
export function parseFfmpegVersion(output: string): string | null {
  const m = /ffmpeg version (?:n)?(\d+)\.(\d+)\.(\d+)/.exec(output);
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True when `version` parses and is >= `min`. */
export function isFfmpegAtLeast(version: string | null, min: string): boolean {
  return version !== null && compareVersions(version, min) >= 0;
}

let cachedVersion: string | null | undefined;

/** Version of the resolved ffmpeg binary, or null when it can't be determined. Cached. */
export function getFFmpegVersion(): string | null {
  if (cachedVersion !== undefined) return cachedVersion;
  try {
    cachedVersion = parseFfmpegVersion(execFileSync(FFMPEG_BIN, ["-version"], { encoding: "utf8" }));
  } catch {
    cachedVersion = null;
  }
  return cachedVersion;
}

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
 * server's CPU/RAM. Defaults to 2; override with FFMPEG_MAX_CONCURRENCY
 * (validated in config.ts).
 */
const MAX_CONCURRENT_FFMPEG = env.FFMPEG_MAX_CONCURRENCY;

/** Max jobs parked in the queue before new conversions are rejected (503). */
const MAX_QUEUE = Math.max(1, MAX_CONCURRENT_FFMPEG * 5);

/** Default cap on ffmpeg output size (bytes). Override via FFMPEG_MAX_OUTPUT_BYTES. */
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024 * 1024;

function maxOutputBytes(): number {
  return env.FFMPEG_MAX_OUTPUT_BYTES ?? DEFAULT_MAX_OUTPUT_BYTES;
}

/** Thrown when the ffmpeg queue is full; the route maps it to HTTP 503. */
export class ServerBusyError extends Error {
  constructor() {
    super("Server is busy, please retry shortly");
    this.name = "ServerBusyError";
  }
}

/** Thrown when ffmpeg writes past FFMPEG_MAX_OUTPUT_BYTES; the route maps it to HTTP 413. */
export class OutputLimitError extends Error {
  constructor() {
    super("Converted output exceeds the server output size limit");
    this.name = "OutputLimitError";
  }
}

/** Thrown when an ffmpeg run exceeds its timeout; the route maps it to HTTP 504. */
export class FFmpegTimeoutError extends Error {
  constructor() {
    super("FFmpeg conversion timed out");
    this.name = "FFmpegTimeoutError";
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
 * unbounded. If `signal` aborts while a job is still parked, the job is removed
 * from the queue and rejected, so cancelled requests never get a slot later.
 * Exported for unit testing.
 */
export function acquireFFmpegSlot(signal?: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Conversion aborted", "AbortError"));
  }
  if (activeCount < MAX_CONCURRENT_FFMPEG) {
    activeCount++;
    return Promise.resolve();
  }
  if (waiters.length >= MAX_QUEUE) {
    return Promise.reject(new ServerBusyError());
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      const idx = waiters.indexOf(waiter);
      if (idx !== -1) {
        waiters.splice(idx, 1);
        reject(new DOMException("Conversion aborted", "AbortError"));
      }
    };
    const waiter = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    waiters.push(waiter);
  }).then(() => {
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
  await acquireFFmpegSlot(opts.signal);
  try {
    return await runFFmpegInner(args, opts);
  } finally {
    releaseFFmpegSlot();
  }
}

function runFFmpegInner(args: string[], opts: FFmpegRunOptions): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_BIN) return reject(new Error("ffmpeg binary not available"));
    // Aborted between acquiring the slot and spawning (e.g. while queued).
    if (opts.signal?.aborted) return reject(new DOMException("Conversion aborted", "AbortError"));

    const tempDir = mkdtempSync(join(tmpdir(), "fs-"));
    const outPath = join(tempDir, "output.bin");
    const inputArgs = opts.inputPath ? ["-i", opts.inputPath] : ["-i", "pipe:0"];

    let proc: ChildProcess;
    const err: Buffer[] = [];
    let settled = false;
    let outputLimitExceeded = false;
    let timedOut = false;

    const abort = () => {
      if (!settled && proc && proc.exitCode === null) {
        proc.kill("SIGKILL");
      }
    };
    opts.signal?.addEventListener("abort", abort, { once: true });

    // Kill the child if it exceeds the timeout (validated in config.ts).
    const timeoutMs = opts.timeoutMs ?? env.FFMPEG_TIMEOUT_MS;
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        if (!settled) {
          timedOut = true;
          abort();
          // The "close" handler performs cleanup and rejects.
        }
      }, timeoutMs);
    }

    proc = spawn(FFMPEG_BIN, ["-hide_banner", "-nostdin", ...inputArgs, ...args, outPath]);
    proc.stderr?.on("data", (c: Buffer) => err.push(c));

    // Kill a runaway encoder whose output file outgrows the cap before it fills
    // the disk. The close handler's final size check is the authoritative
    // backstop (deterministic even when the child finishes between polls).
    const poll = setInterval(() => {
      try {
        if (statSync(outPath).size > maxOutputBytes()) {
          outputLimitExceeded = true;
          abort();
        }
      } catch {
        // output file not created yet
      }
    }, 250);

    proc.on("error", (e) => {
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      clearInterval(poll);
      opts.signal?.removeEventListener("abort", abort);
      cleanupTempDir(outPath);
      reject(new Error(e.message));
    });
    proc.on("close", (code) => {
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      clearInterval(poll);
      opts.signal?.removeEventListener("abort", abort);
      if (opts.signal?.aborted) {
        cleanupTempDir(outPath);
        reject(new DOMException("Conversion aborted", "AbortError"));
        return;
      }
      // The timeout kills the child with SIGKILL, so close() carries a null
      // exit code here. Decide on the timeout flag BEFORE the exit code,
      // otherwise a timeout kill is misreported as a generic ffmpeg failure.
      if (timedOut) {
        cleanupTempDir(outPath);
        reject(new FFmpegTimeoutError());
        return;
      }
      // The output-limit guard kills the child with SIGKILL, so close() carries
      // a null exit code here. Decide on the limit flag BEFORE the exit code,
      // otherwise a limit kill is misreported as a generic ffmpeg failure.
      if (outputLimitExceeded) {
        cleanupTempDir(outPath);
        reject(new OutputLimitError());
        return;
      }
      if (code === 0) {
        let size = 0;
        try {
          size = statSync(outPath).size;
        } catch {
          // leave 0; route falls back to no Content-Length header
        }
        if (size > maxOutputBytes()) {
          cleanupTempDir(outPath);
          reject(new OutputLimitError());
          return;
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
