import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { app } from "../server";
import type { Server } from "node:http";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";

// 1x1 transparent PNG — has real PNG magic bytes (\x89PNG\r\n\x1a\n)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

// Minimal ELF header — a detectable binary that is NOT a PNG
const ELF_BYTES = Buffer.from("7f454c4602010100000000000000000002003e0001000000", "hex");

let server: Server;
let base: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      base = `http://127.0.0.1:${(addr as { port: number }).port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

function postConvert(body: Blob, filename: string, category = "image", target = "webp") {
  const form = new FormData();
  form.append("file", new File([body], filename, { type: "image/png" }));
  form.append("category", category);
  form.append("targetFormat", target);
  form.append("options", "{}");
  return fetch(`${base}/api/convert`, { method: "POST", body: form });
}

describe("POST /api/convert (streaming upload)", () => {
  it("converts a real PNG via streamed upload", async () => {
    const res = await postConvert(new Blob([TINY_PNG]), "test.png");
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
  }, 30000);

  it("rejects a binary whose magic bytes don't match the declared category", async () => {
    const res = await postConvert(new Blob([ELF_BYTES]), "evil.png");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not match category/);
  }, 30000);

  it("rejects an unknown file type for a strict category", async () => {
    const res = await postConvert(new Blob(["hello world"]), "fake.png");
    // file-type can't sniff text; declared image/png is in allowlist, so it passes
    // upload validation and ffmpeg rejects it as invalid image data.
    expect(res.status).not.toBe(200);
  }, 30000);

  it("rejects oversized files (per-category cap)", async () => {
    const big = new Blob([Buffer.alloc(51 * 1024 * 1024, 0x89)]);
    const form = new FormData();
    form.append("file", new File([big], "big.png", { type: "image/png" }));
    form.append("category", "image");
    form.append("targetFormat", "png");
    form.append("options", "{}");
    const res = await fetch(`${base}/api/convert`, { method: "POST", body: form });
    expect(res.status).toBe(413);
  }, 30000);

  it("cleans up temp files after conversion", async () => {
    const before = new Set(readdirSync(tmpdir()));
    await postConvert(new Blob([TINY_PNG]), "cleanup.png");
    const after = new Set(readdirSync(tmpdir()));
    // no new fs-up-* temp dirs left behind
    const leftover = [...after].filter((f) => f.startsWith("fs-up-") && !before.has(f));
    expect(leftover).toEqual([]);
  }, 30000);
});
