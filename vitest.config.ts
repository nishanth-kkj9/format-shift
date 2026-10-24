import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // The checklist targets the pure-logic conversion/metadata modules, the
      // server critical path, and the largest UI components / client utility.
      // Test-only helpers (server/testFixtures.ts) are deliberately excluded:
      // they are a lookup table of fixtures and output probes whose entries are
      // consumed only by the engine that handles that pair, so a correct table
      // can never be fully exercised. Their completeness is enforced by the
      // registry-driven assertions in server/matrix.test.ts (a real fixture for
      // every source format, a probe for every target) — not by line coverage.
      include: [
        "src/utils/detect.ts",
        "src/utils/metadata.ts",
        "src/utils/serverConvert.ts",
        "src/utils/convertData.ts",
        "src/utils/snippetFallback.ts",
        "src/core/conversionRegistry.ts",
        "server/upload.ts",
        "server/convert.ts",
        "server/testFixtures.ts",
        "server/ffmpeg/runner.ts",
        "server/routes/convert.ts",
        "src/components/FileList.tsx",
        "src/components/ConversionOptionsModal.tsx",
      ],
      thresholds: {
        perFile: true,
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80,
      },
    },
  },
});
