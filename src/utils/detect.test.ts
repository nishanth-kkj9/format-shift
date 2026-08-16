import { describe, it, expect } from "vitest";
import { detectCategoryAndFormats, SOCIAL_PRESETS } from "./detect";

function fakeFile(name: string, type: string): File {
  return { name, type } as File;
}

describe("detectCategoryAndFormats", () => {
  it("detects images by mime type", () => {
    const r = detectCategoryAndFormats(fakeFile("photo.png", "image/png"));
    expect(r.category).toBe("image");
    expect(r.sourceFormat).toBe("png");
  });

  it("detects images by extension when mime is generic", () => {
    const r = detectCategoryAndFormats(fakeFile("photo.jpg", "application/octet-stream"));
    expect(r.category).toBe("image");
    expect(r.sourceFormat).toBe("jpg");
  });

  it("detects audio by mime type", () => {
    const r = detectCategoryAndFormats(fakeFile("song.mp3", "audio/mpeg"));
    expect(r.category).toBe("audio");
  });

  it("detects video by mime type", () => {
    const r = detectCategoryAndFormats(fakeFile("clip.mp4", "video/mp4"));
    expect(r.category).toBe("video");
  });

  it("detects data by mime type", () => {
    const r = detectCategoryAndFormats(fakeFile("data.json", "application/json"));
    expect(r.category).toBe("data");
  });

  it("falls back to document for unknown types", () => {
    const r = detectCategoryAndFormats(fakeFile("notes.txt", "text/plain"));
    expect(r.category).toBe("document");
  });

  it("returns available targets for each category", () => {
    const r = detectCategoryAndFormats(fakeFile("photo.png", "image/png"));
    expect(r.availableTargets.length).toBeGreaterThan(0);
    expect(r.availableTargets).toContain(r.defaultTargetFormat);
  });

  it("throws for PDF files (no PDF parser is integrated)", () => {
    expect(() => detectCategoryAndFormats(fakeFile("doc.pdf", "application/pdf"))).toThrow(/PDF/);
  });
});

describe("SOCIAL_PRESETS", () => {
  it("defines preset dimensions", () => {
    expect(SOCIAL_PRESETS["instagram-square"]).toEqual({ w: 1080, h: 1080, label: expect.any(String) });
    expect(SOCIAL_PRESETS.favicon).toEqual({ w: 32, h: 32, label: expect.any(String) });
  });
});
