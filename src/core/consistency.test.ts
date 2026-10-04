import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CONVERSION_REGISTRY,
  getAvailableTargets,
  getAvailableTargetsForSource,
  getMimeForTarget,
  needsServerEngine,
  planConversion,
  SERVER_OPTION_KEYS,
} from "./conversionRegistry";
import type { FileCategory } from "./conversionRegistry";
import { ACCEPTED_EXTENSIONS, OPTIONS_SCHEMA } from "../../server/convert";
import { AUDIO_CODECS } from "../../server/ffmpeg/audio";
import { VIDEO_CODECS } from "../../server/ffmpeg/video";
import { imageArgs } from "../../server/ffmpeg/filters";
import { resolveSourceFormat } from "../../server/upload";
import { detectCategoryAndFormats } from "../utils/detect";
import { FORMAT_META } from "../components/formatMeta";
import { optionVisibility } from "../components/optionGating";
import { convertImage } from "../utils/convertImage";
import { convertAudio } from "../utils/convertAudio";
import type { TargetFormat, ImageConversionOptions, AudioConversionOptions } from "../types";

// Drift guard for every hand-maintained surface that has to agree with the
// registry: the upload MIME map, the source detector, the server codec/extension
// tables, the format metadata, the client engine routing, the option gating and
// the source exclusions. Every assertion is derived from CONVERSION_REGISTRY, so
// the registry can be edited freely — silently letting a surface fall behind it
// is what fails here.

const CATEGORIES: FileCategory[] = ["image", "audio", "video", "data", "document"];

// What a browser sends as the MIME type for each source format. server/upload.ts
// keeps this list (ALLOWED_MIME + MIME_SOURCE_FALLBACK) private, so it is pinned
// here by behaviour: the resolver below must turn each MIME back into a source
// format the category accepts, without any help from the filename.
const SOURCE_CLIENT_MIME: Record<FileCategory, Record<string, string>> = {
  image: {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    ico: "image/x-icon",
    svg: "image/svg+xml",
    avif: "image/avif",
  },
  audio: {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    aac: "audio/aac",
    m4a: "audio/mp4",
    flac: "audio/flac",
    weba: "audio/webm",
  },
  video: {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    flv: "video/x-flv",
  },
  data: { json: "application/json", csv: "text/csv", tsv: "text/tab-separated-values" },
  document: { txt: "text/plain", md: "text/markdown", html: "text/html", htm: "text/html" },
};

const IMAGE_OPTIONS: ImageConversionOptions = {
  quality: 85,
  maintainAspectRatio: true,
  bgColor: "#0f172a",
  grayscale: false,
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  socialPreset: "custom",
};

const AUDIO_OPTIONS: AudioConversionOptions = {
  bitrate: "192k",
  sampleRate: 44100,
  channels: 2,
  volume: 100,
};

/** Every advertised source -> target pair, exactly as the app derives it. */
function matrixPairs(): Array<{ category: FileCategory; source: string; target: string }> {
  const pairs: Array<{ category: FileCategory; source: string; target: string }> = [];
  for (const category of CATEGORIES) {
    for (const source of CONVERSION_REGISTRY[category].sourceFormats) {
      for (const target of getAvailableTargetsForSource(category, source)) {
        pairs.push({ category, source, target });
      }
    }
  }
  return pairs;
}

describe("source format resolution (upload.ts contract)", () => {
  it("covers exactly the registry's source formats", () => {
    for (const category of CATEGORIES) {
      expect(Object.keys(SOURCE_CLIENT_MIME[category]).sort(), category).toEqual(
        [...CONVERSION_REGISTRY[category].sourceFormats].sort()
      );
    }
  });

  it("resolves every source format from its MIME type alone (no filename hint)", () => {
    for (const category of CATEGORIES) {
      for (const source of CONVERSION_REGISTRY[category].sourceFormats) {
        const resolved = resolveSourceFormat(
          null,
          SOURCE_CLIENT_MIME[category][source],
          "upload.bin",
          category
        );
        expect(CONVERSION_REGISTRY[category].sourceFormats, `${category}/${source}`).toContain(resolved);
      }
    }
  });

  it("keeps the registry MIME for sources that are also targets", () => {
    for (const category of CATEGORIES) {
      const spec = CONVERSION_REGISTRY[category];
      for (const [source, mime] of Object.entries(SOURCE_CLIENT_MIME[category])) {
        if (!spec.targets[source]) continue;
        expect(getMimeForTarget(category, source), `${category}/${source}`).toBe(mime);
      }
    }
  });

  it("routes every source format to its own category in the client detector", () => {
    for (const category of CATEGORIES) {
      for (const source of CONVERSION_REGISTRY[category].sourceFormats) {
        const file = new File([""], `sample.${source}`, { type: SOURCE_CLIENT_MIME[category][source] });
        expect(detectCategoryAndFormats(file).category, `${category}/${source}`).toBe(category);
      }
    }
  });

  it("maps a detected WebM container to the audio category's canonical weba source", () => {
    expect(resolveSourceFormat({ ext: "webm" }, "audio/webm", "clip.webm", "audio")).toBe("weba");
    expect(resolveSourceFormat({ ext: "webm" }, "video/webm", "clip.webm", "video")).toBe("webm");
  });
});

describe("advertised matrix size", () => {
  it("offers exactly the audited pair count per engine", () => {
    const pairs = matrixPairs();
    const server = pairs.filter((p) => needsServerEngine(p.category, p.target));
    const browser = pairs.filter((p) => !needsServerEngine(p.category, p.target));
    // Audited totals: 216 honest pairs after the svg -> server-target exclusion
    // (the ffmpeg builds in dev, CI and the Docker image have no SVG decoder).
    expect(pairs.length).toBe(216);
    expect(server.length).toBe(139);
    expect(browser.length).toBe(77);
    expect(server.length + browser.length).toBe(pairs.length);
  });

  it("resolves every advertised pair through planConversion", () => {
    for (const { category, source, target } of matrixPairs()) {
      const plan = planConversion(category, target, source);
      expect(plan.supported, `${category}/${source}->${target}`).toBe(true);
      if (plan.supported) {
        expect(plan.target.format, `${category}/${source}->${target}`).toBe(target);
        expect(plan.target.engine, `${category}/${source}->${target}`).toBe(
          needsServerEngine(category, target) ? "server" : "browser"
        );
      }
    }
  });
});

describe("server surfaces (convert.ts / codec maps)", () => {
  it("has a runnable encoder for every server-engine target", () => {
    for (const category of CATEGORIES) {
      for (const target of getAvailableTargets(category)) {
        if (!needsServerEngine(category, target)) continue;
        const label = `${category}->${target}`;
        if (category === "audio") {
          expect(AUDIO_CODECS[target], label).toBeTruthy();
        } else if (category === "video") {
          // Video containers have their own arg group; audio-extraction targets
          // reuse the audio codec table.
          expect(AUDIO_CODECS[target] ?? VIDEO_CODECS[target], label).toBeTruthy();
        } else {
          // Image: the runner always writes to an extension-less output.bin, so
          // the arg builder must pin both an encoder and a muxer.
          const args = imageArgs({ category, targetFormat: target });
          expect(args, label).toContain("-f");
          expect(args.join(" "), label).toMatch(/-f (gif|ico|mjpeg|image2)/);
          if (["jpg", "jpeg", "png", "webp", "bmp", "avif", "ico"].includes(target)) {
            expect(args, label).toContain("-c:v");
          }
        }
      }
    }
  });

  it("accepts every registry target except the one ffmpeg cannot write", () => {
    const targets = new Set(CATEGORIES.flatMap((category) => getAvailableTargets(category)));
    const writable = [...targets].filter((target) => target !== "svg").sort();
    expect([...new Set(ACCEPTED_EXTENSIONS)].sort()).toEqual(writable);
    expect(ACCEPTED_EXTENSIONS).not.toContain("svg");
  });
});

describe("format metadata (formatMeta.ts)", () => {
  it("has a curated entry for every registry target", () => {
    for (const category of CATEGORIES) {
      const missing = getAvailableTargets(category).filter((target) => !FORMAT_META[category]?.[target]);
      expect(missing, `${category} targets with no FORMAT_META entry`).toEqual([]);
    }
  });

  it("advertises no format the registry does not offer", () => {
    for (const category of CATEGORIES) {
      const extra = Object.keys(FORMAT_META[category] ?? {}).filter(
        (format) => !getAvailableTargets(category).includes(format)
      );
      expect(extra, `${category} FORMAT_META entries with no registry target`).toEqual([]);
    }
  });
});
/** Message of the rejection a client pipeline raises, or "" when it resolves. */
async function rejectionOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const pngFile = () => new File([new Uint8Array([1])], "photo.png", { type: "image/png" });
const wavFile = () => new File([new Uint8Array([1])], "tone.wav", { type: "audio/wav" });

describe("client engine routing (convertImage / convertAudio)", () => {
  it("fails closed for every image target the registry routes to the server", async () => {
    const serverTargets = getAvailableTargets("image").filter((target) => needsServerEngine("image", target));
    expect(serverTargets.sort()).toEqual(["avif", "bmp", "gif", "ico"]);
    for (const target of serverTargets) {
      const message = await rejectionOf(() => convertImage(pngFile(), target as TargetFormat, IMAGE_OPTIONS));
      expect(message, `image->${target}`).toMatch(/must run on the FFmpeg server/);
    }
  });

  it("leaves every browser image target to the canvas pipeline", async () => {
    const browserTargets = getAvailableTargets("image").filter(
      (target) => !needsServerEngine("image", target)
    );
    expect(browserTargets.sort()).toEqual(["jpeg", "jpg", "png", "svg", "webp"]);
    for (const target of browserTargets) {
      const message = await rejectionOf(() => convertImage(pngFile(), target as TargetFormat, IMAGE_OPTIONS));
      expect(message, `image->${target}`).not.toMatch(/FFmpeg server/);
    }
  });

  it("fails closed for every audio target the registry routes to the server", async () => {
    const serverTargets = getAvailableTargets("audio").filter((target) => needsServerEngine("audio", target));
    expect(serverTargets.sort()).toEqual(["aac", "flac", "m4a", "mp3", "ogg"]);
    for (const target of serverTargets) {
      const message = await rejectionOf(() => convertAudio(wavFile(), target as TargetFormat, AUDIO_OPTIONS));
      expect(message, `audio->${target}`).toMatch(/must run on the FFmpeg server/);
    }
  });

  it("keeps wav as the only browser audio target and does not reject it upfront", async () => {
    const browserTargets = getAvailableTargets("audio").filter(
      (target) => !needsServerEngine("audio", target)
    );
    expect(browserTargets).toEqual(["wav"]);
    // The routing guard must not fire; in this node environment the pipeline then
    // fails on the missing Web Audio API, which is not a routing error.
    const message = await rejectionOf(() => convertAudio(wavFile(), "wav", AUDIO_OPTIONS));
    expect(message).not.toMatch(/FFmpeg server/);
  });
});

describe("option surfaces", () => {
  it("keeps SERVER_OPTION_KEYS identical to the server's strict schema", () => {
    expect(Object.keys(OPTIONS_SCHEMA.shape).sort()).toEqual([...SERVER_OPTION_KEYS].sort());
  });

  it("gates quality/bitrate controls on the registry's quality capability", () => {
    for (const category of CATEGORIES) {
      for (const target of getAvailableTargets(category)) {
        const capabilities = CONVERSION_REGISTRY[category].targets[target].capabilities;
        expect(optionVisibility(category, target).quality, `${category}->${target}`).toBe(
          capabilities.quality === true
        );
      }
    }
    // Ground truth from the audit: these encoders ignore quality/bitrate.
    expect(optionVisibility("image", "svg").quality).toBe(false);
    expect(optionVisibility("image", "gif").quality).toBe(false);
    expect(optionVisibility("image", "jpg").quality).toBe(true);
    expect(optionVisibility("audio", "wav").quality).toBe(false);
    expect(optionVisibility("audio", "mp3").quality).toBe(true);
    expect(optionVisibility("video", "wav").quality).toBe(false);
    expect(optionVisibility("video", "mp3").quality).toBe(true);
  });

  it("gates video geometry controls on the absence of audio extraction", () => {
    for (const category of CATEGORIES) {
      for (const target of getAvailableTargets(category)) {
        const capabilities = CONVERSION_REGISTRY[category].targets[target].capabilities;
        const expected = category === "video" && capabilities.audioExtract !== true;
        expect(optionVisibility(category, target).videoShape, `${category}->${target}`).toBe(expected);
      }
    }
    expect(optionVisibility("video", "mp4").videoShape).toBe(true);
    expect(optionVisibility("video", "gif").videoShape).toBe(true);
    expect(optionVisibility("video", "flac").videoShape).toBe(false);
    expect(optionVisibility("image", "jpg").videoShape).toBe(false);
  });
});

describe("source exclusions", () => {
  it("only excludes real targets of the same category", () => {
    for (const category of CATEGORIES) {
      const spec = CONVERSION_REGISTRY[category];
      for (const [source, targets] of Object.entries(spec.excludedTargetsBySource ?? {})) {
        expect(spec.sourceFormats, `${category}/${source}`).toContain(source);
        for (const target of targets) {
          expect(getAvailableTargets(category), `${category}/${source}->${target}`).toContain(target);
        }
      }
    }
  });

  it("makes every excluded target unreachable for that source", () => {
    for (const category of CATEGORIES) {
      const spec = CONVERSION_REGISTRY[category];
      for (const [source, targets] of Object.entries(spec.excludedTargetsBySource ?? {})) {
        for (const target of targets) {
          expect(
            getAvailableTargetsForSource(category, source),
            `${category}/${source}->${target}`
          ).not.toContain(target);
          expect(planConversion(category, target, source).supported, `${category}/${source}->${target}`).toBe(
            false
          );
        }
      }
    }
  });

  it("excludes the server image targets ffmpeg cannot decode an svg into", () => {
    expect(getAvailableTargetsForSource("image", "svg").sort()).toEqual([
      "jpeg",
      "jpg",
      "png",
      "svg",
      "webp",
    ]);
    for (const target of ["gif", "bmp", "ico", "avif"]) {
      expect(planConversion("image", target, "svg").supported, `svg->${target}`).toBe(false);
    }
    // Every other image source keeps the full target set, server targets included.
    expect(getAvailableTargetsForSource("image", "png").sort()).toEqual([
      "avif",
      "bmp",
      "gif",
      "ico",
      "jpeg",
      "jpg",
      "png",
      "svg",
      "webp",
    ]);
  });

  it("keeps html -> md excluded while md -> html stays a real conversion", () => {
    expect(planConversion("document", "md", "html").supported).toBe(false);
    expect(planConversion("document", "md", "htm").supported).toBe(false);
    expect(planConversion("document", "html", "md").supported).toBe(true);
  });
});

// docs/format-matrix.md is generated from the registry by `npm run matrix:docs`
// (scripts/generate-format-matrix.mjs). These assertions re-derive the summary
// numbers from the registry and pin them to the doc, so the generated tables
// cannot silently rot: edit the registry without regenerating and this fails.
describe("generated docs/format-matrix.md matches the registry", () => {
  const doc = readFileSync(fileURLToPath(new URL("../../docs/format-matrix.md", import.meta.url)), "utf8");

  // prettier pads table pipes when it formats the generated doc; compare on
  // normalized cells so either the raw generator output or the formatted doc matches.
  const normalize = (text: string) =>
    text
      .split("\n")
      .map((line) => (line.includes("|") ? line.trim().replace(/\s*\|\s*/g, "|") : line))
      .join("\n");
  const docNorm = normalize(doc);

  const summaryStats = (category: FileCategory) => {
    const spec = CONVERSION_REGISTRY[category];
    let advertised = 0;
    let browser = 0;
    let excluded = 0;
    for (const source of spec.sourceFormats) {
      for (const target of getAvailableTargetsForSource(category, source)) {
        advertised += 1;
        if (spec.targets[target].engine === "browser") browser += 1;
      }
      const excludedTargets = (spec.excludedTargetsBySource?.[source] ?? []).filter((t) => spec.targets[t]);
      excluded += excludedTargets.length;
    }
    return {
      sources: spec.sourceFormats.length,
      advertised,
      browser,
      server: advertised - browser,
      excluded,
    };
  };

  it.each(CATEGORIES)("summary row for %s matches the registry", (category) => {
    const s = summaryStats(category);
    const expectedRow = `|${category}|${s.sources}|${s.advertised}|${s.browser}|${s.server}|${s.excluded}|`;
    expect(docNorm).toContain(expectedRow);
  });

  it("summary total row matches the registry", () => {
    const totals = CATEGORIES.reduce(
      (acc, c) => {
        const s = summaryStats(c);
        return {
          advertised: acc.advertised + s.advertised,
          browser: acc.browser + s.browser,
          server: acc.server + s.server,
          excluded: acc.excluded + s.excluded,
        };
      },
      { advertised: 0, browser: 0, server: 0, excluded: 0 }
    );
    expect(docNorm).toContain(
      `|**Total**|—|**${totals.advertised}**|**${totals.browser}**|**${totals.server}**|**${totals.excluded}**|`
    );
  });
});
