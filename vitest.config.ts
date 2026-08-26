import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // The checklist targets the pure-logic conversion/metadata modules, the
      // server critical path, and the largest UI components / client utility.
      include: [
        "src/utils/detect.ts",
        "src/utils/metadata.ts",
        "src/utils/serverConvert.ts",
        "src/utils/convertData.ts",
        "src/core/conversionRegistry.ts",
        "server/upload.ts",
        "server/convert.ts",
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
