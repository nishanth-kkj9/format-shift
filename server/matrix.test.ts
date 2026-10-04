import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { app } from "./app";
import { resolveSourceFormat } from "./upload";
import {
  CONVERSION_REGISTRY,
  getAvailableTargetsForSource,
  getMimeForTarget,
  needsServerEngine,
  planConversion,
} from "../src/core/conversionRegistry";
import type { FileCategory } from "../src/core/conversionRegistry";
import { generateAllFixtures, releaseFixtures, outputProbe, headOf } from "./testFixtures";
import type { FixtureSet, MatrixPair } from "./testFixtures";

/**
 * The full advertised matrix, generated from the registry and pushed through the
 * real Express app with real ffmpeg. This is the audit's core deliverable: every
 * pair the UI can offer is either proven end-to-end here (server engine) or
 * proven in the browser-pair suites (canvas / Web Audio / text transforms), and
 * every pair the server must refuse is asserted to fail closed.
 *
 * Pair counts are pinned in src/core/consistency.test.ts; the fixtures and output
 * probes live in server/testFixtures.ts.
 */

const CATEGORIES: FileCategory[] = ["image", "audio", "video", "data", "document"];

/** Every advertised source -> target pair, exactly as the app derives it. */
function buildMatrixPairs(): MatrixPair[] {
  const pairs: MatrixPair[] = [];
  for (const category of CATEGORIES) {
    for (const source of CONVERSION_REGISTRY[category].sourceFormats) {
      for (const target of getAvailableTargetsForSource(category, source)) {
        pairs.push({
          category,
          source,
          target,
          engine: needsServerEngine(category, target) ? "server" : "browser",
          expectedMime: getMimeForTarget(category, target) ?? "",
        });
      }
    }
  }
  return pairs;
}

const PAIRS = buildMatrixPairs();
const SERVER_PAIRS = PAIRS.filter((pair) => pair.engine === "server");
const BROWSER_PAIRS = PAIRS.filter((pair) => pair.engine === "browser");
/** Browser pairs with no server pipeline at all: the API must refuse them. */
const SERVERLESS_PAIRS = BROWSER_PAIRS.filter(
  (pair) => pair.category === "data" || pair.category === "document" || pair.target === "svg"
);

let server: Server;
let base: string;
let fixtures: FixtureSet;

beforeAll(async () => {
  // Real source files for every registry source format (ffmpeg lavfi encodes).
  fixtures = generateAllFixtures();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      base = `http://127.0.0.1:${(address as { port: number }).port}`;
      resolve();
    });
  });
}, 120_000);

afterAll(() => {
  server.close();
  releaseFixtures();
});

function fixtureFor(category: FileCategory, source: string) {
  const fixture = fixtures.get(`${category}/${source}`);
  if (!fixture) throw new Error(`missing fixture for ${category}/${source}`);
  return fixture;
}

/** Same multipart shape the browser client sends (see src/utils/serverConvert.ts). */
async function postConvert(pair: MatrixPair, options: Record<string, unknown> = {}) {
  const fixture = fixtureFor(pair.category, pair.source);
  const form = new FormData();
  form.append("file", new File([fixture.bytes], fixture.filename, { type: fixture.mimetype }));
  form.append("category", pair.category);
  form.append("sourceFormat", pair.source);
  form.append("targetFormat", pair.target);
  form.append("options", JSON.stringify(options));
  const res = await fetch(`${base}/api/convert?category=${pair.category}`, {
    method: "POST",
    body: form,
    headers: { "x-category": pair.category },
  });
  const body = Buffer.from(await res.arrayBuffer());
  return { res, body, text: () => body.toString("utf8") };
}

describe("matrix generation", () => {
  it("covers every advertised pair with its declared engine", () => {
    expect(PAIRS.length).toBe(216);
    expect(SERVER_PAIRS.length).toBe(139);
    expect(BROWSER_PAIRS.length).toBe(77);
  });

  it("labels every pair with the registry MIME and a resolvable plan", () => {
    for (const pair of PAIRS) {
      const label = `${pair.category}/${pair.source}->${pair.target}`;
      expect(pair.expectedMime, label).toBe(getMimeForTarget(pair.category, pair.target));
      expect(planConversion(pair.category, pair.target, pair.source).supported, label).toBe(true);
    }
  });
});

describe("fixture validity", () => {
  it("builds a real fixture for every registry source format", () => {
    for (const category of CATEGORIES) {
      for (const source of CONVERSION_REGISTRY[category].sourceFormats) {
        const fixture = fixtures.get(`${category}/${source}`);
        expect(fixture, `${category}/${source}`).toBeDefined();
        expect(fixture?.bytes.length ?? 0, `${category}/${source}`).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every generated fixture back to its own source format", () => {
    for (const category of CATEGORIES) {
      for (const source of CONVERSION_REGISTRY[category].sourceFormats) {
        const fixture = fixtureFor(category, source);
        const resolved = resolveSourceFormat(null, fixture.mimetype, fixture.filename, category);
        expect(CONVERSION_REGISTRY[category].sourceFormats, `${category}/${source}`).toContain(resolved);
      }
    }
  });

  it("has an output probe for every registry target", () => {
    for (const category of CATEGORIES) {
      for (const target of Object.keys(CONVERSION_REGISTRY[category].targets)) {
        expect(() => outputProbe(category, target), `${category}->${target}`).not.toThrow();
      }
    }
  });
});

/** A pair literal for the negative expectations below. */
function pairOf(category: FileCategory, source: string, target: string): MatrixPair {
  return {
    category,
    source,
    target,
    engine: needsServerEngine(category, target) ? "server" : "browser",
    expectedMime: getMimeForTarget(category, target) ?? "",
  };
}

const serverCases: Array<[string, MatrixPair]> = SERVER_PAIRS.map((pair) => [
  `${pair.category}: ${pair.source} -> ${pair.target}`,
  pair,
]);

describe("server-engine pairs (real ffmpeg through the API)", () => {
  it.each(serverCases)("%s", async (_label, pair) => {
    const { res, body, text } = await postConvert(pair);
    if (res.status !== 200) {
      // Surface the server's own error body: a bare "expected 200, got 400" hides
      // the ffmpeg stderr that explains why the arg builder is wrong.
      expect.fail(`HTTP ${res.status}: ${text().slice(0, 400)}`);
    }

    expect(res.headers.get("content-type")).toBe(pair.expectedMime);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");

    const probe = outputProbe(pair.category, pair.target);
    expect(body.length).toBeGreaterThanOrEqual(probe.minBytes);
    if (probe.magic) {
      expect(probe.magic(headOf(body)), `${pair.category}->${pair.target} magic bytes`).toBe(true);
    }
  });
}, 120_000);

describe("the engine split is enforced, not just advertised", () => {
  it("refuses html/htm -> md with the registry reason", async () => {
    for (const source of ["html", "htm"]) {
      const { res, text } = await postConvert(pairOf("document", source, "md"));
      expect(res.status, `document/${source} -> md`).toBe(400);
      expect(text(), `document/${source} -> md`).toMatch(/cannot be converted to md/);
    }
  });

  it("refuses every svg -> server-target pair (ffmpeg has no SVG decoder)", async () => {
    for (const target of ["gif", "bmp", "ico", "avif"]) {
      const { res, text } = await postConvert(pairOf("image", "svg", target));
      expect(res.status, `svg -> ${target}`).toBe(400);
      expect(text(), `svg -> ${target}`).toMatch(/svg files cannot be converted to/);
    }
  });

  it("refuses a target the registry does not offer at all", async () => {
    const { res, text } = await postConvert(pairOf("image", "png", "pdf"));
    expect(res.status).toBe(400);
    expect(text()).toMatch(/No pdf conversion is supported/);
  });

  it("never hands text or data work to ffmpeg", async () => {
    const failures: string[] = [];
    for (const pair of SERVERLESS_PAIRS) {
      const { res, text } = await postConvert(pair);
      const body = text();
      if (res.status !== 400 || !/^\{"error":/.test(body)) {
        failures.push(`${pair.category}/${pair.source}->${pair.target}: ${res.status} ${body.slice(0, 120)}`);
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);
});
