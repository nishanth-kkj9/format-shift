// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FormatGuide } from "./FormatGuide";
import { CONVERSION_REGISTRY } from "../core/conversionRegistry";
import type { FileCategory } from "../core/conversionRegistry";

afterEach(cleanup);

/**
 * Visible guide text with a space injected at every element boundary: a format
 * token that ends an element (".PNG") would otherwise be glued to the next
 * paragraph in `textContent`, and "AVI" must not be matched inside "AVIF".
 */
function guideText(): string {
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) throw new Error("FormatGuide dialog was not rendered");
  const clone = dialog.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("*").forEach((element) => element.append(" "));
  return (clone.textContent ?? "").toUpperCase();
}

// The cheat sheet is the only place the UI explains the format space, so it must
// cover every category the registry converts — a new category or target without
// a matching section is a documentation defect, not a cosmetic one.
describe("FormatGuide registry coverage", () => {
  const categories: FileCategory[] = ["image", "audio", "video", "data", "document"];
  const headingByCategory: Record<FileCategory, RegExp> = {
    image: /image formats/i,
    audio: /audio formats/i,
    video: /video formats/i,
    data: /data/i,
    document: /document formats/i,
  };

  it("has a section for every conversion category", () => {
    render(<FormatGuide isOpen onClose={() => {}} />);
    for (const category of categories) {
      expect(screen.getByRole("heading", { name: headingByCategory[category] })).toBeInTheDocument();
    }
  });

  it("covers every category the registry exposes (no category left undocumented)", () => {
    expect(Object.keys(CONVERSION_REGISTRY).sort()).toEqual(categories.slice().sort());
  });

  it("names every format the registry can produce or accept", () => {
    render(<FormatGuide isOpen onClose={() => {}} />);
    const text = guideText();
    const mentioned = new Set<string>();
    for (const category of categories) {
      const spec = CONVERSION_REGISTRY[category];
      for (const source of spec.sourceFormats) mentioned.add(source.toUpperCase());
      for (const target of Object.keys(spec.targets)) mentioned.add(target.toUpperCase());
    }
    // Aliases: WEBA is the audio-only WebM source and HTM is HTML — the guide
    // only has to name the canonical family.
    const aliases: Record<string, string> = { WEBA: "WEBM", HTM: "HTML" };
    const missing = [...mentioned]
      .map((format) => aliases[format] ?? format)
      .filter((format) => !new RegExp(`(^|[^A-Z0-9])${format}([^A-Z0-9]|$)`).test(text));
    expect(missing).toEqual([]);
  });
});
