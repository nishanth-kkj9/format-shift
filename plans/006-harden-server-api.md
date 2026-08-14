# Plan 006: Harden the server API against abuse

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e56a9be..HEAD -- server.ts server/convert.ts package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `e56a9be`, 2026-08-14
- **Issue**: (none)

## Why this matters

The `/api/convert` endpoint accepts up to 200MB uploads with no rate limiting, no authentication, and no file-type validation. If this server is deployed publicly (the README suggests Cloud Run), anyone can:
1. Upload unlimited 200MB files, exhausting memory and disk (DoS).
2. Send arbitrary binary data as "images" or "audio", causing ffmpeg to consume CPU on malformed input.
3. Use the server as a free conversion proxy.

This plan adds basic hardening: file-type validation, upload size limits per category, and a simple in-memory rate limiter. It does NOT add full authentication — that's a product decision for the maintainer.

## Current state

The relevant files and their roles:

- `server.ts` — Express server; defines the `/api/convert` and `/api/code-template` endpoints
- `server/convert.ts` — conversion logic; `convertFile` validates target format but not source file type
- `package.json` — dependencies; no rate-limiting library installed

Current code excerpts:

```ts
// server.ts:11-14
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB cap
});
```

```ts
// server.ts:22-55
app.post("/api/convert", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const { category, sourceFormat, targetFormat } = req.body;
    let options = {};
    try {
      options = JSON.parse(req.body.options || "{}");
    } catch {
      // ignore malformed options
    }

    const { data, mime } = await convertFile(file.buffer, {
      category,
      targetFormat,
      ...options,
    });

    res.setHeader("Content-Type", mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="converted.${targetFormat}"`
    );
    res.send(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Conversion failed";
    const isClientError =
      message.startsWith("Unsupported target format") ||
      message.startsWith("Conversion not supported") ||
      message.startsWith("Source has no audio stream");
    res.status(isClientError ? 400 : 500).json({ error: message });
  }
});
```

```ts
// server/convert.ts:140-147
export async function convertFile(
  input: Buffer,
  opts: ConvertOptions
): Promise<{ data: Buffer; mime: string }> {
  const tgt = opts.targetFormat.toLowerCase();
  const cat = opts.category?.toLowerCase();
  const mime = MIME[tgt];
  if (!mime) throw new Error(`Unsupported target format: ${tgt}`);
```

**Repo conventions**:
- Express 4 with TypeScript
- Code style: 2-space indent, double quotes in server files, semicolons
- No existing middleware for security

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `npm install`            | exit 0              |
| Typecheck | `npm run lint`           | exit 0, no errors   |
| Build     | `npm run build`          | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `server.ts`
- `package.json` (add `express-rate-limit` dependency)

**Out of scope** (do NOT touch, even though they look related):
- `server/convert.ts` — the conversion logic itself; validation happens at the Express layer
- `src/` — frontend code, unrelated
- Adding authentication/API keys — that's a product decision, not a bug fix

## Git workflow

- Branch: `advisor/006-server-hardening`
- Commit message style: `security: add rate limiting and file validation to API` (conventional commits)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install express-rate-limit

```bash
npm install express-rate-limit
```

**Verify**: `npm ls express-rate-limit` → shows the package installed

### Step 2: Add rate limiting middleware

Add rate limiting to `server.ts`:

```ts
// server.ts (add import at top)
import rateLimit from "express-rate-limit";

// After app.use(express.urlencoded(...)) — add:
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Apply to the convert endpoint only (not health check)
app.use("/api/convert", apiLimiter);
```

**Verify**: `npm run lint` → exit 0

### Step 3: Add file-type validation

Add a MIME-type allowlist check in the `/api/convert` handler. The `category` field from the client should match the file's MIME type:

```ts
// server.ts (inside the /api/convert handler, after the file check)
const file = req.file;
if (!file) return res.status(400).json({ error: "No file uploaded" });

// Validate file type against category
const category = (req.body.category || "").toLowerCase();
const ALLOWED_MIME: Record<string, string[]> = {
  image: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/x-icon", "image/svg+xml", "image/avif"],
  audio: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/aac", "audio/mp4", "audio/flac", "audio/x-wav"],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"],
  document: ["application/pdf", "text/plain", "text/markdown", "text/html"],
  data: ["application/json", "text/csv", "application/xml", "text/xml", "text/yaml", "text/tab-separated-values"],
};

if (ALLOWED_MIME[category] && !ALLOWED_MIME[category].includes(file.mimetype)) {
  return res.status(400).json({ error: `File type ${file.mimetype} not allowed for category ${category}` });
}
```

Note: The `category` variable is already destructured at line 27 — reuse it. The check should be lenient: if the category is unknown or the MIME type is `application/octet-stream` (common for some file types), allow it through to avoid breaking legitimate conversions.

**Verify**: `npm run lint` → exit 0

### Step 4: Add per-category upload size limits

The current 200MB cap is generous. Add a smaller cap for data/document files (which are text-based and should be small) while keeping the larger cap for media:

```ts
// server.ts (replace the multer config)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB cap for media
});

// In the /api/convert handler, after category validation:
const MAX_SIZES: Record<string, number> = {
  image: 50 * 1024 * 1024,   // 50MB
  audio: 100 * 1024 * 1024,  // 100MB
  video: 200 * 1024 * 1024,  // 200MB
  document: 10 * 1024 * 1024, // 10MB
  data: 10 * 1024 * 1024,     // 10MB
};

const maxSize = MAX_SIZES[category];
if (maxSize && file.size > maxSize) {
  return res.status(413).json({ error: `File too large for ${category} category (max ${maxSize / 1024 / 1024}MB)` });
}
```

**Verify**: `npm run lint` → exit 0

### Step 5: Run full verification

**Verify**:
1. `npm run lint` → exit 0, no errors
2. `npm run build` → exit 0

## Test plan

No new automated tests for this plan — the changes are Express middleware and request handling, which would need supertest or similar. Manual verification:

1. Start the server (`npm run server`).
2. Send a request to `/api/convert` with a text file but `category: "image"` — should get a 400 error.
3. Send 31 requests in quick succession to `/api/convert` — the 31st should get a 429 rate-limit error.
4. Send a large data file (e.g. 20MB JSON) — should get a 413 error.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] `grep -rn "express-rate-limit" package.json` returns a match
- [ ] `grep -rn "apiLimiter" server.ts` returns at least 2 matches (definition + usage)
- [ ] `grep -rn "ALLOWED_MIME" server.ts` returns at least 2 matches (definition + usage)
- [ ] `grep -rn "MAX_SIZES" server.ts` returns at least 2 matches (definition + usage)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- The MIME-type validation breaks a legitimate conversion (e.g. a browser sends `application/octet-stream` for a valid file) — in that case, loosen the check to allow `application/octet-stream` through.

## Maintenance notes

- The rate limit (30 req/min/IP) is a starting point. If the app gets real traffic, this should be tuned or moved to a distributed store (e.g. Redis) for multi-instance deployments.
- The MIME allowlist is permissive — it allows `application/octet-stream` through (via the lenient check). This is intentional to avoid breaking legitimate conversions where the browser doesn't set a specific MIME type.
- If authentication is added later, the rate limiter should be keyed by user ID instead of IP.
- The `express-rate-limit` package is in-memory by default — it resets on server restart. For production, consider a store.