import { describe, it, expect } from "vitest";
import {
  CONVERSION_REGISTRY,
  planConversion,
  getAvailableTargets,
  getAvailableTargetsForSource,
  getMimeForTarget,
  needsServerEngine,
  extensionForMime,
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
    // svg (canvas wrap), wav (web audio), text/doc (string ops)
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
      audio: ["wav"],
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

  it("XML/YAML are not advertised as data sources (no parser is integrated)", () => {
    expect(CONVERSION_REGISTRY.data.sourceFormats).not.toContain("xml");
    expect(CONVERSION_REGISTRY.data.sourceFormats).not.toContain("yaml");
    expect(CONVERSION_REGISTRY.data.sourceFormats).not.toContain("yml");
  });

  it("XML/YAML remain honest targets (generated from parsed JSON/CSV/TSV)", () => {
    expect(planConversion("data", "xml").supported).toBe(true);
    expect(planConversion("data", "yaml").supported).toBe(true);
    expect(planConversion("data", "csv").supported).toBe(true);
    expect(planConversion("data", "tsv").supported).toBe(true);
  });

  it("HTML -> Markdown is not selectable for HTML sources, but stays for text sources", () => {
    expect(getAvailableTargetsForSource("document", "html")).not.toContain("md");
    expect(getAvailableTargetsForSource("document", "htm")).not.toContain("md");
    expect(getAvailableTargetsForSource("document", "txt")).toContain("md");
    expect(getAvailableTargetsForSource("document", "md")).toContain("md");
  });

  it("planConversion enforces excludedTargetsBySource when a source format is given", () => {
    // HTML -> Markdown is excluded for HTML sources even though the target exists.
    expect(planConversion("document", "md", "html").supported).toBe(false);
    expect(planConversion("document", "md", "htm").supported).toBe(false);
    // The same target stays supported for non-excluded sources (and without a source).
    expect(planConversion("document", "md", "txt").supported).toBe(true);
    expect(planConversion("document", "md", "md").supported).toBe(true);
    expect(planConversion("document", "md").supported).toBe(true);
    // Non-excluded targets are unaffected by the source.
    expect(planConversion("document", "txt", "html").supported).toBe(true);
    expect(planConversion("document", "html", "html").supported).toBe(true);
    // No exclusions exist outside document: source never blocks a registered target.
    expect(planConversion("image", "png", "gif").supported).toBe(true);
    expect(planConversion("data", "json", "csv").supported).toBe(true);
  });

  it("HTML sources default to an honest target (plain text), not Markdown", () => {
    expect(CONVERSION_REGISTRY.document.defaultTarget("html")).toBe("txt");
    expect(CONVERSION_REGISTRY.document.defaultTarget("htm")).toBe("txt");
  });

  it("extensionForMime resolves canonical extensions from MIME types", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/png")).toBe("png");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("image/gif")).toBe("gif");
    expect(extensionForMime("image/avif")).toBe("avif");
    expect(extensionForMime("audio/mp4")).toBe("m4a");
    expect(extensionForMime("video/mp4")).toBe("mp4");
    expect(extensionForMime("video/webm")).toBe("webm");
    expect(extensionForMime("video/quicktime")).toBe("mov");
  });

  it("extensionForMime returns null for unknown MIME types", () => {
    expect(extensionForMime("application/octet-stream")).toBeNull();
    expect(extensionForMime("")).toBeNull();
  });
});
