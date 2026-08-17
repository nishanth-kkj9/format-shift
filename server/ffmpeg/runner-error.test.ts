import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
}));

import { spawn } from "node:child_process";
import { runFFmpeg } from "./runner";

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

beforeEach(() => mockSpawn.mockReset());

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
});
