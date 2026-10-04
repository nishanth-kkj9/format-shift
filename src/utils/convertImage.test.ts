import { describe, it, expect, vi, afterEach } from "vitest";
import { convertImage } from "./convertImage";
import {
  CONVERSION_REGISTRY,
  getAvailableTargetsForSource,
  getMimeForTarget,
  needsServerEngine,
} from "../core/conversionRegistry";
import type { TargetFormat } from "../types";

/**
 * Minimal DOM shim: the vitest env is `node`, so there is no canvas. The stubs
 * fake the FileReader -> Image -> canvas pipeline and let the test fire the
 * load callbacks manually, then assert the transform calls on the 2d context.
 */
function stubDom() {
  const ctx = {
    fillStyle: "",
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: (b: Blob | null) => void, mime?: string) =>
      cb(new Blob([new Uint8Array(64)], { type: mime || "image/png" }))
    ),
    toDataURL: vi.fn(() => "data:image/png;base64,"),
  };

  let reader: FakeReader | null = null;
  let image: FakeImage | null = null;

  class FakeReader {
    static last: FakeReader | null = null;
    onerror: ((e?: unknown) => void) | null = null;
    onload: ((e?: unknown) => void) | null = null;
    result: unknown = null;
    readAsDataURL = vi.fn();
    constructor() {
      FakeReader.last = this;
      reader = FakeReader.last;
    }
  }
  class FakeImage {
    static last: FakeImage | null = null;
    width = 0;
    height = 0;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;
    constructor() {
      FakeImage.last = this;
      image = FakeImage.last;
    }
    set src(_v: unknown) {
      // Tests fire `onload` manually after setting width/height.
    }
  }

  vi.stubGlobal("FileReader", FakeReader);
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });

  return {
    ctx,
    canvas,
    reader: () => reader as FakeReader,
    image: () => image as FakeImage,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("convertImage social preset transforms", () => {
  it("applies rotation and flip when a social preset is active", async () => {
    const dom = stubDom();
    const promise = convertImage(
      {} as File,
      "png",
      {
        quality: 90,
        maintainAspectRatio: true,
        bgColor: "#ffffff",
        grayscale: false,
        rotation: 90,
        flipHorizontal: true,
        flipVertical: false,
        socialPreset: "instagram-square",
      },
      () => {}
    );

    dom.reader().result = "data:image/png;base64,AAA=";
    dom.reader().onload!();
    dom.image().width = 200;
    dom.image().height = 100;
    dom.image().onload!();

    const res = await promise;
    expect(dom.canvas.width).toBe(1080);
    expect(dom.canvas.height).toBe(1080);
    expect(dom.ctx.rotate).toHaveBeenCalledWith((90 * Math.PI) / 180);
    expect(dom.ctx.scale).toHaveBeenCalledWith(-1, 1);
    expect(dom.ctx.translate).toHaveBeenCalledWith(540, 540);
    expect(dom.ctx.drawImage).toHaveBeenCalled();
    expect(res.dimensions).toEqual({ width: 1080, height: 1080 });
  });

  it("keeps the centered aspect-fit draw when no rotation is requested", async () => {
    const dom = stubDom();
    const promise = convertImage(
      {} as File,
      "png",
      {
        quality: 90,
        maintainAspectRatio: true,
        bgColor: "#ffffff",
        grayscale: false,
        rotation: 0,
        flipHorizontal: false,
        flipVertical: false,
        socialPreset: "instagram-square",
      },
      () => {}
    );

    dom.reader().result = "data:image/png;base64,AAA=";
    dom.reader().onload!();
    dom.image().width = 200;
    dom.image().height = 100;
    dom.image().onload!();

    await promise;
    expect(dom.ctx.scale).toHaveBeenCalledWith(1, 1);
    expect(dom.ctx.translate).toHaveBeenCalledWith(540, 540);
    // aspect-fit of a 200x100 image into 1080x1080: scale 5.4, draw 1080x540
    expect(dom.ctx.drawImage).toHaveBeenCalledWith(expect.anything(), -540, -270, 1080, 540);
  });
});

const BASE_IMAGE_OPTIONS = {
  quality: 90,
  maintainAspectRatio: true,
  bgColor: "#ffffff",
  grayscale: false,
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  socialPreset: "custom" as const,
};

// Every advertised image pair whose engine is the browser canvas. The pair list
// comes from the registry, so a new browser target or source is covered (or, if
// it is unroutable, the pair-count assertion below fails) without editing tests.
const BROWSER_IMAGE_CASES: Array<[string, string]> = [];
for (const source of CONVERSION_REGISTRY.image.sourceFormats) {
  for (const target of getAvailableTargetsForSource("image", source)) {
    if (!needsServerEngine("image", target)) BROWSER_IMAGE_CASES.push([source, target]);
  }
}

describe("browser image pairs (canvas pipeline)", () => {
  it("covers every browser-engine image pair", () => {
    expect(BROWSER_IMAGE_CASES.length).toBe(45);
  });

  it.each(BROWSER_IMAGE_CASES)("%s -> %s yields a blob with the target MIME", async (source, target) => {
    const dom = stubDom();
    const promise = convertImage(
      new File([new Uint8Array([1])], `photo.${source}`, { type: "image/png" }),
      target as TargetFormat,
      BASE_IMAGE_OPTIONS,
      () => {}
    );

    dom.reader().result = "data:image/png;base64,AAA=";
    dom.reader().onload!();
    dom.image().width = 32;
    dom.image().height = 16;
    dom.image().onload!();

    const { blob, dimensions } = await promise;
    expect(blob.type).toBe(getMimeForTarget("image", target));
    expect(blob.size).toBeGreaterThan(0);
    expect(dimensions).toEqual({ width: 32, height: 16 });

    if (target === "svg") {
      // The SVG target is a raster wrapper (formatMeta + the cheat sheet say so):
      // the canvas PNG is embedded, never vectorized.
      const text = await blob.text();
      expect(text).toContain("<svg");
      expect(text).toContain("data:image/png");
    }
  });
});
