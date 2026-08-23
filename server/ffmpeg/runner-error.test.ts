import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
  execFile: vi.fn(),
}));

import { spawn, execFile } from "node:child_process";
import { runFFmpeg, FFmpegTimeoutError, getFFmpegVersion, getFFmpegVersionSync } from "./runner";

const mockSpawn = vi.mocked(spawn);

function fakeChild(): EventEmitter & {
  stderr: PassThrough;
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as EventEmitter & {
    stderr: PassThrough;
    exitCode: number | null;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.kill = vi.fn();
  return child;
}

beforeEach(() => {
  mockSpawn.mockReset();
  vi.mocked(execFile).mockReset();
});

describe("runFFmpeg child-process failures", () => {
  it("rejects with the spawn error when the binary cannot start", async () => {
    mockSpawn.mockReturnValue(fakeChild() as never);
    const pending = runFFmpeg(["-i", "pipe:0", "-f", "null", "-"]).catch((e: Error) => e);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    const child = mockSpawn.mock.results[0].value;
    child.emit("error", new Error("ENOENT"));
    const err = await pending;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("ENOENT");
    // slot was released even though the process never spawned
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("rejects with AbortError when the signal aborts after spawn", async () => {
    mockSpawn.mockReturnValue(fakeChild() as never);
    const controller = new AbortController();
    const pending = runFFmpeg(["-f", "lavfi", "-i", "sine=440", "-t", "10", "-"], {
      signal: controller.signal,
    }).catch((e: Error) => e);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    const child = mockSpawn.mock.results[0].value;
    controller.abort();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null);
    const err = await pending;
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
  });

  it("rejects with FFmpegTimeoutError when the timeout fires", async () => {
    mockSpawn.mockReturnValue(fakeChild() as never);
    const pending = runFFmpeg(["-t", "60", "-"], { timeoutMs: 25 }).catch((e: Error) => e);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    const child = mockSpawn.mock.results[0].value;
    await vi.waitFor(() => expect(child.kill).toHaveBeenCalled());
    child.emit("close", null);
    const err = await pending;
    expect(err).toBeInstanceOf(FFmpegTimeoutError);
    expect((err as Error).message).toMatch(/timed out/i);
  });

  it("does not turn a timeout into a generic ffmpeg failure", async () => {
    mockSpawn.mockReturnValue(fakeChild() as never);
    const pending = runFFmpeg(["-t", "60", "-"], { timeoutMs: 25 }).catch((e: Error) => e);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    const child = mockSpawn.mock.results[0].value;
    await vi.waitFor(() => expect(child.kill).toHaveBeenCalled());
    child.emit("close", 1);
    const err = await pending;
    expect(err).toBeInstanceOf(FFmpegTimeoutError);
  });

  it("clears the timeout timer when the process finishes first", async () => {
    mockSpawn.mockReturnValue(fakeChild() as never);
    const pending = runFFmpeg(["-t", "60", "-"], { timeoutMs: 250 });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    const child = mockSpawn.mock.results[0].value;
    child.emit("close", 0);
    await expect(pending).resolves.toBeTruthy();
    expect(child.kill).not.toHaveBeenCalled();
  });
});

describe("getFFmpegVersion probe failures", () => {
  it("caches null when the ffmpeg -version probe errors", async () => {
    // Simulate the binary being unresolvable/unrunnable: execFile invokes its
    // callback with an error. The runner must surface null (both async and
    // sync readers) rather than throwing or reporting a bogus version.
    vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
      const cb = args[3] as (err: Error | null, stdout: string) => void;
      cb(new Error("spawn ffmpeg ENOENT"), "");
    }) as never);

    await expect(getFFmpegVersion()).resolves.toBeNull();
    expect(getFFmpegVersionSync()).toBeNull();
  });
});
