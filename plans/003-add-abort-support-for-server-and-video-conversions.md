# Plan 003: Add abort support for server-side and video conversions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e56a9be..HEAD -- src/App.tsx src/utils/serverConvert.ts src/utils/converter.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e56a9be`, 2026-08-14
- **Issue**: (none)

## Why this matters

The app has an abort controller in `App.tsx` (`convertSingleFile`) that's only wired to audio conversion. When a user converts a file that routes to the server (`needsServerConversion`) or a video file, the abort controller is never passed down — so clicking "cancel" (if it existed) or navigating away mid-conversion can't stop the work. The server-side fetch continues, and the video MediaRecorder keeps recording. This plan wires the abort signal through the remaining conversion paths.

## Current state

The relevant files and their roles:

- `src/App.tsx` — creates `abortController` at line 181, passes `abortController.signal` only to `convertAudio` (line 234)
- `src/utils/serverConvert.ts` — `convertServerSide` uses `fetch` without an AbortSignal
- `src/utils/converter.ts` — `convertVideo` doesn't accept an abort signal; `convertImage` and `convertDataDocument` don't either

Current code excerpts:

```ts
// src/App.tsx:219-245
if (needsServerConversion(item.category, effectiveTarget)) {
  updateProgress(30);
  resultBlob = await convertServerSide(
    item.file,
    item.category,
    item.originalExtension,
    effectiveTarget,
    item.options
  );
  updateProgress(100);
} else if (item.category === 'image') {
  const res = await convertImage(item.file, item.targetFormat, item.options.image!, updateProgress);
  resultBlob = res.blob;
  dimensions = res.dimensions;
} else if (item.category === 'audio') {
  const res = await convertAudio(item.file, effectiveTarget, item.options.audio!, updateProgress, abortController.signal);
  resultBlob = res.blob;
  duration = res.duration;
} else if (item.category === 'video') {
  const res = await convertVideo(item.file, item.targetFormat, item.options.video!, updateProgress);
  resultBlob = res.blob;
  dimensions = res.dimensions;
  duration = res.duration;
} else {
  const res = await convertDataDocument(item.file, item.targetFormat, item.options.data, updateProgress);
  resultBlob = res.blob;
}
```

```ts
// src/utils/serverConvert.ts:20-39
export async function convertServerSide(
  file: File,
  category: string,
  sourceFormat: string,
  targetFormat: string,
  options: ConversionOptions
): Promise<Blob> {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  form.append('sourceFormat', sourceFormat);
  form.append('targetFormat', targetFormat);
  form.append('options', JSON.stringify(options[category] || {}));

  const res = await fetch('/api/convert', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `Server conversion failed (${res.status})`);
  }
  return res.blob();
}
```

```ts
// src/utils/converter.ts:505-510
export async function convertVideo(
  file: File,
  targetFormat: TargetFormat,
  options: VideoConversionOptions,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; dimensions?: { width: number; height: number }; duration?: number }> {
```

**Repo conventions**:
- React 19 with hooks
- TypeScript
- Code style: 2-space indent, single quotes, semicolons

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npm run lint`           | exit 0, no errors   |
| Build     | `npm run build`          | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/App.tsx`
- `src/utils/serverConvert.ts`
- `src/utils/converter.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/utils/audioVisualizer.ts` — already handles abort signals
- `server/convert.ts` — server-side ffmpeg doesn't need abort; the fetch abort handles it
- `src/utils/metadata.ts` — no conversion logic here

## Git workflow

- Branch: `advisor/003-abort-support`
- Commit message style: `feat: add abort support for server and video conversions` (conventional commits)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add abort signal to `convertServerSide`

Update `src/utils/serverConvert.ts` to accept an optional `AbortSignal` and pass it to `fetch`:

```ts
// src/utils/serverConvert.ts:20-39
export async function convertServerSide(
  file: File,
  category: string,
  sourceFormat: string,
  targetFormat: string,
  options: ConversionOptions,
  abortSignal?: AbortSignal
): Promise<Blob> {
  const form = new FormData();
  form.append('file', file);
  form.append('category', category);
  form.append('sourceFormat', sourceFormat);
  form.append('targetFormat', targetFormat);
  form.append('options', JSON.stringify(options[category] || {}));

  const res = await fetch('/api/convert', { method: 'POST', body: form, signal: abortSignal });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || `Server conversion failed (${res.status})`);
  }
  return res.blob();
}
```

**Verify**: `npm run lint` → exit 0

### Step 2: Add abort signal to `convertVideo`

Update `src/utils/converter.ts` to accept an optional `AbortSignal` in `convertVideo`:

```ts
// src/utils/converter.ts:505-510
export async function convertVideo(
  file: File,
  targetFormat: TargetFormat,
  options: VideoConversionOptions,
  onProgress?: (pct: number) => void,
  abortSignal?: AbortSignal
): Promise<{ blob: Blob; dimensions?: { width: number; height: number }; duration?: number }> {
```

Then, inside the `video.onloadedmetadata` callback, check for abort before starting the MediaRecorder:

```ts
// src/utils/converter.ts:528-530 (inside onloadedmetadata)
video.onloadedmetadata = () => {
  onProgress?.(30);
  // Check for abort before starting
  if (abortSignal?.aborted) {
    URL.revokeObjectURL(videoUrl);
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }
  // ... rest of existing code
```

Also add an abort listener that stops the MediaRecorder:

```ts
// src/utils/converter.ts:582-583 (after mediaRecorder.start())
mediaRecorder.start();
video.play();

// Listen for abort to stop recording
const handleAbort = () => {
  if (mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  URL.revokeObjectURL(videoUrl);
};
abortSignal?.addEventListener('abort', handleAbort, { once: true });
```

And clean up the listener in `mediaRecorder.onstop`:

```ts
// src/utils/converter.ts:571-580 (in onstop)
mediaRecorder.onstop = () => {
  onProgress?.(100);
  abortSignal?.removeEventListener('abort', handleAbort);
  URL.revokeObjectURL(videoUrl);
  const finalBlob = new Blob(chunks, { type: mimeType });
  resolve({
    blob: finalBlob,
    dimensions: { width: targetWidth, height: targetHeight },
    duration: video.duration,
  });
};
```

**Verify**: `npm run lint` → exit 0

### Step 3: Wire abort signal through `App.tsx`

Update `App.tsx` to pass `abortController.signal` to `convertServerSide` and `convertVideo`:

```ts
// src/App.tsx:219-245
if (needsServerConversion(item.category, effectiveTarget)) {
  updateProgress(30);
  resultBlob = await convertServerSide(
    item.file,
    item.category,
    item.originalExtension,
    effectiveTarget,
    item.options,
    abortController.signal
  );
  updateProgress(100);
} else if (item.category === 'image') {
  const res = await convertImage(item.file, item.targetFormat, item.options.image!, updateProgress);
  resultBlob = res.blob;
  dimensions = res.dimensions;
} else if (item.category === 'audio') {
  const res = await convertAudio(item.file, effectiveTarget, item.options.audio!, updateProgress, abortController.signal);
  resultBlob = res.blob;
  duration = res.duration;
} else if (item.category === 'video') {
  const res = await convertVideo(item.file, item.targetFormat, item.options.video!, updateProgress, abortController.signal);
  resultBlob = res.blob;
  dimensions = res.dimensions;
  duration = res.duration;
} else {
  const res = await convertDataDocument(item.file, item.targetFormat, item.options.data, updateProgress);
  resultBlob = res.blob;
}
```

**Verify**: `npm run lint` → exit 0

### Step 4: Run full verification

**Verify**:
1. `npm run lint` → exit 0, no errors
2. `npm run build` → exit 0

## Test plan

No new automated tests for this plan — the changes are browser-DOM-dependent (MediaRecorder, fetch). Manual verification:

1. Convert a video file, then navigate away mid-conversion — the MediaRecorder should stop and the object URL should be revoked.
2. Convert a file that routes to the server (e.g. image → AVIF), then abort — the fetch should be cancelled.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] `grep -rn "signal: abortSignal" src/utils/serverConvert.ts` returns a match
- [ ] `grep -rn "abortSignal" src/utils/converter.ts` returns at least 3 matches (signature + checks)
- [ ] `grep -rn "abortController.signal" src/App.tsx` returns at least 3 matches (audio, server, video)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- You discover that the abort signal isn't actually cancelling the fetch or MediaRecorder as expected.

## Maintenance notes

- The `convertImage` and `convertDataDocument` functions don't accept abort signals — they're fast enough that cancellation isn't critical. If they ever become slow (e.g. large images), add abort support there too.
- The server-side ffmpeg process continues even if the client aborts the fetch — the server doesn't know the client disconnected. A future enhancement could add a cancellation endpoint or use a streaming response that the server can detect as closed.
- When adding new conversion paths, always pass the abort signal through.