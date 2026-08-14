import express from "express";
import path from "path";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { convertRouter } from "./server/routes/convert";
import { templatesRouter } from "./server/routes/templates";

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Rate limit the conversion endpoint to prevent abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/convert", apiLimiter);

// API endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "FormatShift Universal Converter", timestamp: new Date().toISOString() });
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
