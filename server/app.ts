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
import {
  getFFmpegConcurrency,
  getFFmpegVersionSync,
  isFfmpegAtLeast,
  FFMPEG_MIN_FEATURE_VERSION,
  FFMPEG_MIN_SECURITY_VERSION,
  FFMPEG_BIN,
} from "./ffmpeg/runner";
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

// JSON body parsing is scoped per-route: /api/code-template mounts its own
// small-limit parser, and /api/convert is multipart (busboy). No route consumes
// application/x-www-form-urlencoded bodies either (verified across the repo:
// the only req.body consumer is /api/code-template, which is JSON-only), so
// there is no global body parser and no 50mb body-buffering surface.

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
    // Cross-origin isolation is only enabled in production: dev/test rely on the
    // Vite proxy and same-origin tooling that COEP's CORP enforcement can break.
    crossOriginEmbedderPolicy: process.env.NODE_ENV === "production",
    crossOriginOpenerPolicy: process.env.NODE_ENV === "production",
    // HSTS is managed by the ENABLE_HSTS-gated middleware above so it is only
    // ever sent over real HTTPS deployments, never plain HTTP.
    hsts: false,
  })
);

// Rate limit the conversion endpoint to prevent abuse. Both limiters use the
// built-in in-process memory store: their quotas are per server process, not
// cluster-wide. The shipped deployment is a single container (one process), so
// the limits below hold exactly as documented; if the app is ever scaled to
// multiple replicas, these quotas multiply by replica count and the aggregate
// limiter should move to a shared store (e.g. Redis) instead.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP (per process)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Second, aggregate backstop across all IPs so a distributed burst can't tie up
// every ffmpeg slot even when each individual IP stays under its own limit.
// Per-process ceiling: 60 requests/min across ALL clients in this process.
// ponytail: in-process store; swap to a shared store if multi-replica
// deployment becomes the contract.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute across ALL clients (per process)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (_req) => "global",
  message: { error: "Too many requests, please try again later." },
});

// Third limiter for /api/code-template: the endpoint is cheap (no ffmpeg, a
// registry lookup and string building), so its per-IP ceiling is far more
// generous than /api/convert's, but it still gets defense-in-depth parity —
// an unauthenticated JSON endpoint should never be unmetered. The default is
// well above normal UI usage (the code-snippet modal makes at most one call
// per open); tests override CODE_TEMPLATE_RATE_LIMIT_MAX to exercise the 429
// path without flooding.
const templatesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.CODE_TEMPLATE_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Integration tests hit /api/convert ~30+ times per suite run (per-IP cap is
// 30), so the limiters would 429 legitimate test traffic. They guard real
// deployments, not the test harness. The templates limiter stays mounted in
// test mode because its ceiling is env-configurable (see above).
if (process.env.NODE_ENV !== "test") {
  app.use("/api/convert", apiLimiter);
  app.use("/api/convert", globalLimiter);
}
app.use("/api/code-template", templatesLimiter);

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
  // Version info is exposed only on /api/ready (internal Docker probes).
  // /api/health is public — omitting version strings reduces attack surface.
  res.json({
    status: "ok",
    app: "FormatShift Universal Converter",
    timestamp: new Date().toISOString(),
    ffmpegAvailable: Boolean(FFMPEG_BIN),
    ffmpegConcurrency: {
      max: concurrency.max,
      active: concurrency.active,
      queued: concurrency.queued,
    },
  });
});

// Liveness + readiness for Docker/K8s probes: 200 only when the server can
// actually convert (ffmpeg present and meeting both version baselines).
app.get("/api/ready", (_req, res) => {
  const ffmpegVersion = getFFmpegVersionSync();
  const ffmpegAvailable = Boolean(FFMPEG_BIN);
  const ffmpegFeatureCompatible = isFfmpegAtLeast(ffmpegVersion, FFMPEG_MIN_FEATURE_VERSION);
  const ffmpegSecurityBaselineOk = isFfmpegAtLeast(ffmpegVersion, FFMPEG_MIN_SECURITY_VERSION);
  const ready = ffmpegAvailable && ffmpegFeatureCompatible && ffmpegSecurityBaselineOk;
  res.status(ready ? 200 : 503).json({
    ready,
    ffmpegAvailable,
    ffmpegVersion,
    ffmpegFeatureCompatible,
    ffmpegSecurityBaselineOk,
  });
});

app.use("/api/convert", convertRouter);
app.use("/api/code-template", templatesRouter);

// Serve built frontend (production). No-op in dev — dist/ may not exist yet.
const distDir = path.resolve("dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

export { app };
