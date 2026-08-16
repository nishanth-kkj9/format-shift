import express from "express";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import ffmpegPath from "ffmpeg-static";
import { convertRouter } from "./server/routes/convert";
import { templatesRouter } from "./server/routes/templates";
import { getFFmpegConcurrency } from "./server/ffmpeg/runner";

const app = express();
const PORT = Number(process.env.PORT || 4000);

// Trust proxy configuration: only trust the first proxy if explicitly enabled via env.
// This prevents IP spoofing when behind a reverse proxy.
// Set TRUST_PROXY=1 in production behind a trusted proxy (nginx, Cloudflare, etc.).
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

// HSTS should only be sent when the site is actually served over HTTPS (usually
// behind a TLS-terminating proxy). Enable explicitly with ENABLE_HSTS=1.
if (process.env.ENABLE_HSTS === "1") {
  app.use((_req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    next();
  });
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Security headers middleware (minimal, no external dependency)
app.use((_req, res, next) => {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Enable XSS protection (legacy but harmless)
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Referrer policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Permissions policy (restrict dangerous browser features)
  res.setHeader(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()"
  );
  next();
});

// Rate limit the conversion endpoint to prevent abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/convert", apiLimiter);

// Second, aggregate backstop across all IPs so a distributed burst can't tie up
// every ffmpeg slot even when each individual IP stays under its own limit.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute across ALL clients
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (_req) => "global",
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/convert", globalLimiter);

// Simple request logger (no external dependency)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// API endpoints
app.get("/api/health", (req, res) => {
  const concurrency = getFFmpegConcurrency();
  res.json({
    status: "ok",
    app: "FormatShift Universal Converter",
    timestamp: new Date().toISOString(),
    ffmpeg: ffmpegPath ? "available" : "missing",
    ffmpegConcurrency: {
      max: concurrency.max,
      active: concurrency.active,
      queued: concurrency.queued,
    },
  });
});

app.use("/api/convert", convertRouter);
app.use("/api/code-template", templatesRouter);

// Serve built frontend (production). No-op in dev — dist/ may not exist yet.
const distDir = path.resolve("dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

export { app };

const isMain = (() => {
  try {
    if (typeof require !== "undefined" && require.main === module) return true;
  } catch {
    // ESM/tsx — require unavailable
  }
  return process.argv[1] && !!import.meta.url && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
})();

if (isMain) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
}
