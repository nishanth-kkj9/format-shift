import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Writable } from "node:stream";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";

vi.mock("file-type", () => ({ fileTypeFromBuffer: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return { ...orig, createWriteStream: vi.fn() };
});

import { createWriteStream } from "node:fs";
import { fileTypeFromBuffer } from "file-type";
import { parseUploadStream } from "./upload";

const mockWriteStream = vi.mocked(createWriteStream);
const mockFileType = vi.mocked(fileTypeFromBuffer);

const BOUNDARY = "----uploaderr";
const CT = `multipart/form-data; boundary=${BOUNDARY}`;

function fakeReq(body: Buffer, headers: Record<string, string> = {}): IncomingMessage {
  const pt = new PassThrough();
  Object.assign(pt, {
    headers: { host: "localhost", "content-type": CT, ...headers },
    url: "/api/convert",
  });
  pt.end(body);
  return pt as unknown as IncomingMessage;
}

function bodyWithFile(data: Buffer): Buffer {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="category"\r\n\r\nimage\r\n` +
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="targetFormat"\r\n\r\npng\r\n` +
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="options"\r\n\r\n{}\r\n` +
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`
  );
  return Buffer.concat([head, data, Buffer.from(`\r\n--${BOUNDARY}--\r\n`)]);
}

afterEach(() => {
  vi.clearAllMocks();
});

beforeEach(() => {
  // createWriteStream must return a real sink by default so uploads flush;
  // each test overrides it only when it needs a failing destination.
  mockWriteStream.mockReset();
  mockWriteStream.mockReturnValue(new PassThrough() as never);
});

describe("parseUploadStream disk-write failures", () => {
  it("maps a write failure to a 500 UploadError and cleans up", async () => {
    const ws = new Writable({
      write: (_chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error) => void) =>
        cb(new Error("ENOSPC: no space")),
    });
    mockWriteStream.mockReturnValue(ws as never);
    const payload = bodyWithFile(Buffer.from("a"));
    await expect(parseUploadStream(fakeReq(payload, { "x-category": "image" }))).rejects.toMatchObject({
      status: 500,
      message: /ENOSPC/,
    });
  });
});

describe("parseUploadStream magic-byte sniffing failures", () => {
  it("rethrows non-UploadError failures from sniffing", async () => {
    mockFileType.mockReset();
    mockFileType.mockRejectedValue(new Error("sniff boom"));
    const payload = bodyWithFile(Buffer.from("a"));
    await expect(parseUploadStream(fakeReq(payload, { "x-category": "image" }))).rejects.toThrow(
      "sniff boom"
    );
  });
});
