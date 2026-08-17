import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4000",
    headless: true,
  },
  // Serves the built frontend + API (dist/server.cjs). Must run `npm run build`
  // first; the `test:e2e` script does that. FFmpeg resolves via the bundled
  // ffmpeg-static devDependency from the project root.
  webServer: {
    command: "node dist/server.cjs",
    url: "http://localhost:4000/api/health",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      PORT: "4000",
      FFMPEG_MAX_CONCURRENCY: "1",
    },
  },
});
