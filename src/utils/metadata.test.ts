// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { formatDuration, extractFileMetadata } from "./metadata";

describe("formatDuration", () => {
  it("formats zero as 0:00", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("formats NaN as 0:00", () => {
    expect(formatDuration(NaN)).toBe("0:00");
  });

  it("formats seconds under a minute", () => {
    expect(formatDuration(45)).toBe("0:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2:05");
  });

  it("pads seconds with leading zero", () => {
    expect(formatDuration(61)).toBe("1:01");
  });
});

describe("extractFileMetadata", () => {
  function fakeFile(name: string, type: string, size = 100): File {
    return { name, type, size, text: () => Promise.resolve("a\nb\nc\n") } as unknown as File;
  }

  it("captures image dimensions on load", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 800;
      naturalHeight = 600;
      set src(_: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("URL", { createObjectURL: () => "blob:mock", revokeObjectURL: () => {} });

    const meta = await extractFileMetadata(fakeFile("photo.png", "image/png"));
    expect(meta.previewUrl).toBeTruthy();
    expect(meta.dimensions).toEqual({ width: 800, height: 600 });
    vi.unstubAllGlobals();
  });

  it("revokes the preview URL when the image fails to load", async () => {
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal("Image", MockImage);
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:mock", revokeObjectURL: revoke });

    const meta = await extractFileMetadata(fakeFile("broken.png", "image/png"));
    expect(meta.previewUrl).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith("blob:mock");
    vi.unstubAllGlobals();
  });

  it("reads video metadata via a media element", async () => {
    const video: Record<string, unknown> = {};
    vi.stubGlobal("URL", { createObjectURL: () => "blob:vid", revokeObjectURL: () => {} });
    vi.stubGlobal("document", {
      createElement: (tag: string) => {
        if (tag !== "video") throw new Error("unexpected element " + tag);
        const el = video as { onloadedmetadata?: () => void; onerror?: () => void };
        Object.assign(el, {
          preload: "",
          src: "",
          duration: 12,
          videoWidth: 320,
          videoHeight: 240,
        });
        setTimeout(() => el.onloadedmetadata?.(), 0);
        return el;
      },
    } as unknown as Document);

    const meta = await extractFileMetadata(fakeFile("clip.mp4", "video/mp4"));
    expect(meta.duration).toBe(12);
    expect(meta.dimensions).toEqual({ width: 320, height: 240 });
    vi.unstubAllGlobals();
  });

  it("counts lines for text files under the size cap", async () => {
    const meta = await extractFileMetadata(fakeFile("data.csv", "text/csv", 100));
    expect(meta.lineCount).toBe(4);
  });

  it("skips line counting for large text files", async () => {
    const big = fakeFile("data.csv", "text/csv", 3 * 1024 * 1024);
    const meta = await extractFileMetadata(big);
    expect(meta.lineCount).toBeUndefined();
  });

  it("handles audio error by revoking the URL", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:aud", revokeObjectURL: revoke });
    vi.stubGlobal(
      "Audio",
      class {
        preload = "";
        onerror: (() => void) | null = null;
        set src(_: string) {
          setTimeout(() => this.onerror?.(), 0);
        }
      }
    );

    const meta = await extractFileMetadata(fakeFile("song.mp3", "audio/mpeg"));
    expect(meta.previewUrl).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith("blob:aud");
    vi.unstubAllGlobals();
  });

  it("returns mime type fallback for unknown files", async () => {
    const meta = await extractFileMetadata(fakeFile("blob.bin", ""));
    expect(meta.mimeType).toBe("application/octet-stream");
  });
});
