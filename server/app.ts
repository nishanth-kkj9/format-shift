// Load .env before anything reads process.env (runner resolves FFMPEG_PATH at
// import time, config validates the rest at boot).
import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { convertRouter } from "./routes/convert";
import { templatesRouter } from "./routes/templates";
import { getFFmpegConcurrency, FFMPEG_BIN } from "./ffmpeg/runner";
import { env } from "./config";

const app = express();

// Trust proxy configuration: only trust the first proxy if explicitly enabled via env.
// This prevents IP spoofing when behind a reverse proxy.
// Set TRUST_PROXY=1 in production behind a trusted proxy (nginx, Cloudflare, etc.).
if (env.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

// HSTS should only be sent when the site is actually served over HTTPS (usually
// behind a TLS-terminating proxy). Enable explicitly with ENABLE_HSTS=1.
if (env.ENABLE_HSTS) {
  app.use((_req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    next();
  });
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Standard hardening headers via helmet. CSP must allow the dev server's Vite
// scripts (served same-origin via proxy) and inline styles used by Tailwind.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "blob:", "data:"],
        mediaSrc: ["'self'", "blob:"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    // Keep the previous hand-rolled values: DENY (stricter than helmet's
    // SAMEORIGIN) and the common strict-origin-when-cross-origin referrer policy.
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
    // HSTS is managed by the ENABLE_HSTS-gated middleware above so it is only
    // ever sent over real HTTPS deployments, never plain HTTP.
    hsts: false,
  })
);

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
app.get("/api/health", (_req, res) => {
  const concurrency = getFFmpegConcurrency();
  res.json({
    status: "ok",
    app: "FormatShift Universal Converter",
    timestamp: new Date().toISOString(),
    ffmpeg: FFMPEG_BIN ? "available" : "missing",
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
