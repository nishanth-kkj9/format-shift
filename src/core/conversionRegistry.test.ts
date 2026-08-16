import { describe, it, expect } from "vitest";
import {
  CONVERSION_REGISTRY,
  planConversion,
  getAvailableTargets,
  getMimeForTarget,
  needsServerEngine,
} from "./conversionRegistry";
import type { FileCategory } from "./conversionRegistry";

// The registry is the single source of truth. These tests pin its shape so any
// drift between UI (FormatDropdown), detection (detect.ts), the server endpoint,
// and code templates is caught by one matrix test.

describe("conversion registry consistency", () => {
  const categories: FileCategory[] = ["image", "audio", "video", "document", "data"];

  it("has exactly the expected category set", () => {
    expect(Object.keys(CONVERSION_REGISTRY).sort()).toEqual(categories.slice().sort());
  });

  it("every target has a format name, mime, and a valid engine", () => {
    for (const spec of Object.values(CONVERSION_REGISTRY)) {
      for (const [fmt, target] of Object.entries(spec.targets)) {
        expect(target.format).toBe(fmt);
        expect(target.mime).toMatch(/^[a-z-]+\/[a-z0-9.+_-]+$/);
        expect(["browser", "server"]).toContain(target.engine);
      }
    }
  });

  it("planConversion resolves every registered target as supported", () => {
    for (const spec of Object.values(CONVERSION_REGISTRY)) {
      for (const fmt of Object.keys(spec.targets)) {
        expect(planConversion(spec.category, fmt).supported).toBe(true);
      }
    }
  });

  it("planConversion rejects unregistered targets with a reason", () => {
    expect(planConversion("image", "pdf").supported).toBe(false);
    expect(planConversion("document", "pdf").supported).toBe(false);
    expect(planConversion("document", "png").supported).toBe(false);
    expect(planConversion("video", "docx").supported).toBe(false);
    const plan = planConversion("image", "pdf");
    if (plan.supported === false) expect(plan.reason).toMatch(/No pdf conversion/);
  });

  it("getAvailableTargets matches registry keys in order", () => {
    for (const spec of Object.values(CONVERSION_REGISTRY)) {
      expect(getAvailableTargets(spec.category)).toEqual(Object.keys(spec.targets));
    }
  });

  it("getMimeForTarget returns the registered mime (or null)", () => {
    expect(getMimeForTarget("image", "webp")).toBe("image/webp");
    expect(getMimeForTarget("video", "mkv")).toBe("video/x-matroska");
    expect(getMimeForTarget("image", "nope")).toBeNull();
  });

  it("browser-engine targets are the ones browsers can genuinely do", () => {
    // Deliberate contract: no fake conversions. Every browser-engine target must
    // have a working client implementation (canvas / web audio / text transforms).
    const browserTargets = categories.flatMap((c) =>
      getAvailableTargets(c).filter((t) => !needsServerEngine(c, t))
    );
    // svg (canvas wrap), wav + spectrum video (web audio), text/doc (string ops)
    expect(browserTargets).toContain("svg");
    expect(browserTargets).toContain("wav");
    expect(browserTargets).toContain("csv");
    expect(browserTargets).toContain("txt");
    // The fake ones must NOT be browser-engine:
    expect(browserTargets).not.toContain("pdf");
  });

  it("every browser-engine target has a working client implementation", () => {
    const clientFns = {
      image: ["jpg", "jpeg", "png", "webp", "svg"],
      audio: ["wav", "mp4", "webm"], // mp4/webm = spectrum visualizer
      video: [],
      document: ["txt", "md", "html"],
      data: ["csv", "json", "xml", "yaml", "tsv"],
    } as Record<FileCategory, string[]>;
    for (const spec of Object.values(CONVERSION_REGISTRY)) {
      const browserTargets = Object.entries(spec.targets)
        .filter(([, t]) => t.engine === "browser")
        .map(([f]) => f);
      expect(browserTargets.sort()).toEqual(clientFns[spec.category].sort());
    }
  });

  it("defaultTarget always returns a supported target", () => {
    for (const spec of Object.values(CONVERSION_REGISTRY)) {
      for (const source of spec.sourceFormats) {
        const def = spec.defaultTarget(source);
        expect(planConversion(spec.category, def).supported).toBe(true);
      }
    }
  });

  it("no category is left without targets or sources", () => {
    for (const spec of Object.values(CONVERSION_REGISTRY)) {
      expect(spec.sourceFormats.length).toBeGreaterThan(0);
      expect(Object.keys(spec.targets).length).toBeGreaterThan(0);
    }
  });

  it("PDF is not advertised as a document source", () => {
    expect(CONVERSION_REGISTRY.document.sourceFormats).not.toContain("pdf");
  });
});
