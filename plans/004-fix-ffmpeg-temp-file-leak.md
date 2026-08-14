# Plan 004: Fix ffmpeg temp file leak on error

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e56a9be..HEAD -- server/convert.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e56a9be`, 2026-08-14
- **Issue**: (none)

## Why this matters

`runFFmpeg` in `server/convert.ts` creates a temp directory with `mkdtempSync` for formats that need seekable output (AVIF, ICO, M4A, MP4, MOV, MKV). The temp directory is only cleaned up on success (line 87). When ffmpeg exits with a non-zero code (e.g. invalid input, unsupported codec), the temp directory and its contents are left on disk forever. On a long-running server, repeated failed conversions accumulate orphaned temp files, consuming disk space. This plan ensures the temp directory is always cleaned up, success or failure.

## Current state

The relevant file and its role:

- `server/convert.ts` — contains `runFFmpeg`, the function that spawns ffmpeg and manages temp files

Current code excerpt:

```ts
// server/convert.ts:69-104
function runFFmpeg(args: string[], input: Buffer, seekableSuffix = ""): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("ffmpeg binary not available"));
    const outArgs = [...args, "pipe:1"];
    const tmpFile = seekableSuffix ? join(mkdtempSync(join(tmpdir(), "fs-")), `out.${seekableSuffix}`) : null;
    const finalArgs = tmpFile ? [...args, tmpFile] : outArgs;

    const proc = spawn(ffmpegPath, ["-hide_banner", "-i", "pipe:0", ...finalArgs]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (c: Buffer) => out.push(c));
    proc.stderr.on("data", (c: Buffer) => err.push(c));
    proc.on("error", (e) => reject(new Error(e.message)));
    proc.on("close", (code) => {
      if (code === 0) {
        try {
          if (tmpFile) {
            const b = readFileSync(tmpFile);
            rmSync(join(tmpFile, ".."), { recursive: true, force: true });
            resolve(b);
          } else {
            resolve(Buffer.concat(out));
          }
        } catch (e) {
          reject(new Error(e instanceof Error ? e.message : "output read failed"));
        }
      } else {
        const stderr = Buffer.concat(err).toString("utf8");
        const lastErr = stderr.split("\n").filter(Boolean).slice(-3).join("\n");
        reject(new Error(`ffmpeg failed (${code}): ${lastErr}`));
      }
    });
    proc.stdin.write(input);
    proc.stdin.end();
  });
}
```

**Repo conventions**:
- TypeScript with Node.js
- Code style: 2-space indent, double quotes for strings in this file, semicolons

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npm run lint`           | exit 0, no errors   |
| Build     | `npm run build`          | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `server/convert.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/utils/converter.ts` — client-side conversion, unrelated
- `server.ts` — Express server setup, unrelated
- Any test files — plan 001 covers testing; this plan is a focused bug fix

## Git workflow

- Branch: `advisor/004-ffmpeg-temp-leak`
- Commit message style: `fix: clean up ffmpeg temp files on error` (conventional commits)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract temp dir cleanup into a helper

Add a small helper function that removes the temp directory if it exists:

```ts
// server/convert.ts (add near the top, after imports)
function cleanupTempDir(tmpFile: string | null): void {
  if (tmpFile) {
    try {
      rmSync(join(tmpFile, ".."), { recursive: true, force: true });
    } catch {
      // best-effort cleanup; ignore errors
    }
  }
}
```

**Verify**: `npm run lint` → exit 0

### Step 2: Use the helper in the success path

Replace the inline `rmSync` call in the success path with the helper:

```ts
// server/convert.ts:82-94 (in the close handler, code === 0 branch)
if (code === 0) {
  try {
    if (tmpFile) {
      const b = readFileSync(tmpFile);
      cleanupTempDir(tmpFile);
      resolve(b);
    } else {
      resolve(Buffer.concat(out));
    }
  } catch (e) {
    cleanupTempDir(tmpFile);
    reject(new Error(e instanceof Error ? e.message : "output read failed"));
  }
}
```

**Verify**: `npm run lint` → exit 0

### Step 3: Clean up on error path

In the `else` branch (non-zero exit code), call `cleanupTempDir(tmpFile)` before rejecting:

```ts
// server/convert.ts:95-99 (in the close handler, else branch)
} else {
  cleanupTempDir(tmpFile);
  const stderr = Buffer.concat(err).toString("utf8");
  const lastErr = stderr.split("\n").filter(Boolean).slice(-3).join("\n");
  reject(new Error(`ffmpeg failed (${code}): ${lastErr}`));
}
```

**Verify**: `npm run lint` → exit 0

### Step 4: Clean up on spawn error

In the `proc.on("error")` handler, also clean up:

```ts
// server/convert.ts:81
proc.on("error", (e) => {
  cleanupTempDir(tmpFile);
  reject(new Error(e.message));
});
```

**Verify**: `npm run lint` → exit 0

### Step 5: Run full verification

**Verify**:
1. `npm run lint` → exit 0, no errors
2. `npm run build` → exit 0

## Test plan

No new automated tests for this plan — the change is in a function that spawns a subprocess (ffmpeg), which is hard to unit test without mocking. Manual verification:

1. Start the server (`npm run server`).
2. Send a request to `/api/convert` with an invalid file (e.g. a text file as an image) targeting a seekable format like AVIF.
3. Verify the request fails with a 500 error.
4. Check the temp directory (`os.tmpdir()`) — no `fs-*` directories should remain.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] `grep -rn "cleanupTempDir" server/convert.ts` returns at least 4 matches (definition + 3 call sites)
- [ ] `grep -rn "rmSync(join(tmpFile" server/convert.ts` returns NO matches (replaced by helper)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- You discover that `rmSync` with `recursive: true` on the parent directory of `tmpFile` is unsafe in some way (e.g. the temp dir path structure changed).

## Maintenance notes

- The temp directory naming pattern is `fs-` prefix via `mkdtempSync(join(tmpdir(), "fs-"))`. If this prefix changes, the cleanup logic still works since it derives the parent from `tmpFile`.
- If ffmpeg is ever replaced with a different binary, the temp file management should be revisited.
- The `cleanupTempDir` helper is best-effort — it swallows errors. This is intentional: cleanup failures shouldn't mask the original conversion error.