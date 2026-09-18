import { describe, it, expect } from "vitest";
import { buildLocalFallback } from "./snippetFallback";
import { FileCategory } from "../types";

describe("buildLocalFallback (offline code-snippet starters)", () => {
  it("uses the image toolchain for images and for unknown categories", () => {
    const image = buildLocalFallback("image", "png", "webp");
    expect(image.python).toContain("PIL");
    expect(image.node).toContain("sharp");

    const unknown = buildLocalFallback("alien" as FileCategory, "png", "jpg");
    expect(unknown.node).toContain("sharp");
  });

  it("matches each category with a toolchain that can actually handle it", () => {
    const video = buildLocalFallback("video", "mp4", "mkv");
    expect(video.python).toContain("ffmpeg");
    expect(video.html).toContain("<video");

    const audio = buildLocalFallback("audio", "wav", "mp3");
    expect(audio.python).toContain("ffmpeg");
    expect(audio.html).toContain("<audio");

    const csvSource = buildLocalFallback("data", "csv", "json");
    expect(csvSource.python).toContain("csv.reader");

    const jsonSource = buildLocalFallback("data", "json", "csv");
    expect(jsonSource.python).toContain("json.load");

    const markdown = buildLocalFallback("document", "md", "html");
    expect(markdown.node).toContain("marked");

    const plainText = buildLocalFallback("document", "txt", "md");
    expect(plainText.node).toContain("node:fs");
  });

  it("interpolates the selected formats and frames every snippet as illustrative", () => {
    const code = buildLocalFallback("video", "mov", "webm");
    expect(code.python).toContain("input.mov");
    expect(code.python).toContain("output.webm");

    expect(code.python.startsWith("# Illustrative example")).toBe(true);
    expect(code.node.startsWith("// Illustrative example")).toBe(true);
    expect(code.html.startsWith("<!-- Illustrative example")).toBe(true);
  });

  it("falls back to placeholder paths when the formats are missing", () => {
    const code = buildLocalFallback("image", "", "");
    expect(code.node).toContain("input.input");
    expect(code.node).toContain("output.output");
  });

  it("emits snippets without stray carriage returns from template escaping", () => {
    const categories: FileCategory[] = ["image", "audio", "video", "data", "document"];
    for (const category of categories) {
      const code = buildLocalFallback(category, "json", "csv");
      for (const snippet of [code.python, code.node, code.html]) {
        expect(snippet).not.toContain("\r");
      }
    }
  });
});
