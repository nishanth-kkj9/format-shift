import "dotenv/config";
import { app } from "./app";
import { env } from "./config";
import { getFFmpegVersion } from "./ffmpeg/runner";

// Resolve the ffmpeg version before accepting traffic so the first /api/health
// / /api/ready probe reads a warm cache instead of triggering a synchronous
// spawn on the event loop.
getFFmpegVersion().then(() => {
  app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`API server running on http://localhost:${env.PORT}`);
  });
});
