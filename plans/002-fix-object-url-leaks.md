# Plan 002: Fix object URL memory leaks and history download breakage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e56a9be..HEAD -- src/App.tsx src/utils/metadata.ts src/components/PreviewModal.tsx src/components/HistoryDrawer.tsx`
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

The app creates `URL.createObjectURL()` blobs for previews and converted files but never revokes most of them. Every file added to the queue and every conversion leaks memory in the browser tab. Worse, `PreviewModal.tsx:34` revokes the `convertedUrl` on unmount — but that same URL is stored in `history` and used by `HistoryDrawer` for re-download. After opening the preview modal once, the history download link is broken (the URL is revoked). This plan fixes both the leaks and the broken history download.

## Current state

The relevant files and their roles:

- `src/App.tsx` — main app; creates `convertedUrl` via `URL.createObjectURL` at line 247, stores it in `history` at line 290
- `src/utils/metadata.ts` — creates preview URLs at lines 24, 37, 52 via `URL.createObjectURL`
- `src/components/PreviewModal.tsx` — revokes `convertedUrl` on unmount (line 34), breaking history downloads
- `src/components/HistoryDrawer.tsx` — uses `item.downloadUrl` (the convertedUrl) for re-download

Current code excerpts:

```ts
// src/App.tsx:247-258
const convertedUrl = URL.createObjectURL(resultBlob);
const nameWithoutExt = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
const extFromMime = (t: string) =>
  t === 'video/webm' ? 'webm' :
  t === 'video/mp4' ? 'mp4' :
  t === 'image/gif' ? 'gif' :
  t === 'image/avif' ? 'avif' :
  t === 'image/webp' ? 'webp' :
  t === 'image/png' ? 'png' :
  t === 'image/jpeg' ? 'jpg' : null;
const actualExt = extFromMime(resultBlob.type) || effectiveTarget;
const convertedName = `${nameWithoutExt}_converted.${actualExt}`;
```

```ts
// src/App.tsx:279-293
const historyEntry: ConversionHistoryItem = {
  id: Math.random().toString(36).substring(2, 9),
  originalName: item.name,
  convertedName,
  category: item.category,
  sourceFormat: item.originalExtension,
  targetFormat: effectiveTarget,
  originalSize: item.originalSize,
  convertedSize: resultBlob.size,
  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  downloadUrl: convertedUrl,
};
setHistory((prev) => [historyEntry, ...prev]);
```

```ts
// src/utils/metadata.ts:24-35 (image preview)
const url = URL.createObjectURL(file);
metadata.previewUrl = url;
await new Promise<void>((resolve) => {
  const img = new Image();
  img.onload = () => {
    metadata.dimensions = { width: img.naturalWidth, height: img.naturalHeight };
    resolve();
  };
  img.onerror = () => resolve();
  img.src = url;
});
```

```ts
// src/components/PreviewModal.tsx:24-38
const originalUrl = item.previewUrl || URL.createObjectURL(item.file);
const convertedUrl = item.convertedUrl || '';

useEffect(() => {
  return () => {
    if (item?.previewUrl === undefined && item?.file) {
      URL.revokeObjectURL(originalUrl);
    }
    if (item?.convertedUrl) {
      URL.revokeObjectURL(convertedUrl);
    }
  };
}, [item, originalUrl, convertedUrl]);
```

```ts
// src/components/HistoryDrawer.tsx:112-119
<a
  href={item.downloadUrl}
  download={item.convertedName}
  className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shrink-0 cursor-pointer shadow-md"
  title="Download File"
>
  <Download className="w-4 h-4" />
</a>
```

**Repo conventions**:
- React 19 with hooks
- TypeScript strict-ish (no `strict` in tsconfig but `noEmit` is set)
- Code style: 2-space indent, single quotes, semicolons

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npm run lint`           | exit 0, no errors   |
| Build     | `npm run build`          | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/App.tsx`
- `src/utils/metadata.ts`
- `src/components/PreviewModal.tsx`
- `src/components/HistoryDrawer.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/utils/converter.ts` — the `convertVideo` function also creates a `videoUrl` via `URL.createObjectURL` (line 520) and revokes it on stop (line 573); that's already handled
- `src/utils/audioVisualizer.ts` — no object URLs created here
- `src/components/FileList.tsx` — uses `item.previewUrl` but doesn't create/revoke URLs

## Git workflow

- Branch: `advisor/002-object-url-leaks`
- Commit message style: `fix: revoke object URLs and preserve history downloads` (conventional commits)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix `PreviewModal.tsx` — stop revoking `convertedUrl`

The `convertedUrl` is owned by `App.tsx` and stored in history. `PreviewModal` must NOT revoke it. Remove the `convertedUrl` revocation from the cleanup effect:

```ts
// src/components/PreviewModal.tsx:27-38
useEffect(() => {
  return () => {
    // Only revoke the URL we created ourselves (when previewUrl is undefined)
    if (item?.previewUrl === undefined && item?.file) {
      URL.revokeObjectURL(originalUrl);
    }
    // Do NOT revoke convertedUrl — it's owned by App.tsx and used by history
  };
}, [item, originalUrl]);
```

Note: remove `convertedUrl` from the dependency array since it's no longer used in the effect.

**Verify**: `npm run lint` → exit 0

### Step 2: Fix `metadata.ts` — revoke preview URLs after use

The preview URLs created in `extractFileMetadata` are used by `FileList` and `PreviewModal` to display thumbnails. They should be revoked when the item is removed from the queue or when the app unmounts.

The cleanest approach: revoke the preview URL when the item is removed from the queue in `App.tsx`. But first, let's make `metadata.ts` not leak when the image/video/audio fails to load. The current code creates the URL and never revokes it even on error.

Add revocation on error paths:

```ts
// src/utils/metadata.ts:24-35 (image preview)
const url = URL.createObjectURL(file);
metadata.previewUrl = url;
await new Promise<void>((resolve) => {
  const img = new Image();
  img.onload = () => {
    metadata.dimensions = { width: img.naturalWidth, height: img.naturalHeight };
    resolve();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    metadata.previewUrl = undefined;
    resolve();
  };
  img.src = url;
});
```

Apply the same pattern to the video (lines 37-50) and audio (lines 52-64) blocks: on `onerror`, revoke the URL and clear `metadata.previewUrl`.

**Verify**: `npm run lint` → exit 0

### Step 3: Fix `App.tsx` — revoke preview URLs on item removal

When an item is removed from the queue (`handleRemove`), revoke its `previewUrl` if it exists:

```ts
// src/App.tsx:368-370
const handleRemove = (id: string) => {
  setQueue((prev) => {
    const item = prev.find((i) => i.id === id);
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    return prev.filter((item) => item.id !== id);
  });
};
```

Also revoke preview URLs when clearing the queue:

```ts
// src/App.tsx:373-375
const handleClearAll = () => {
  setQueue((prev) => {
    prev.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    return [];
  });
};
```

**Verify**: `npm run lint` → exit 0

### Step 4: Fix `App.tsx` — revoke converted URLs when items are removed

When an item is removed from the queue, also revoke its `convertedUrl` — but ONLY if it's not in history. Since history stores the same URL, we need to check:

```ts
// src/App.tsx:368-370 (updated)
const handleRemove = (id: string) => {
  setQueue((prev) => {
    const item = prev.find((i) => i.id === id);
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    // Only revoke convertedUrl if it's not referenced in history
    if (item?.convertedUrl && !history.some((h) => h.downloadUrl === item.convertedUrl)) {
      URL.revokeObjectURL(item.convertedUrl);
    }
    return prev.filter((item) => item.id !== id);
  });
};
```

**Verify**: `npm run lint` → exit 0

### Step 5: Run full verification

**Verify**:
1. `npm run lint` → exit 0, no errors
2. `npm run build` → exit 0

## Test plan

No new tests for this plan — the changes are browser-DOM-dependent (object URL lifecycle) and the test infrastructure from plan 001 doesn't cover DOM. Manual verification:

1. Add an image to the queue, convert it, open the preview modal, close it, then open history and click download — the file should download correctly (this was broken before).
2. Add multiple files, remove one from the queue, verify the app doesn't crash.
3. Use Chrome DevTools Memory tab to verify object URLs are being cleaned up (look for decreasing `URL.createObjectURL` count after removing items).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] `grep -rn "URL.revokeObjectURL(convertedUrl)" src/components/PreviewModal.tsx` returns NO matches
- [ ] `grep -rn "URL.revokeObjectURL" src/App.tsx` returns at least 2 matches (preview + converted)
- [ ] `grep -rn "URL.revokeObjectURL" src/utils/metadata.ts` returns at least 3 matches (image, video, audio error paths)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- You discover that revoking a URL breaks something unexpected (e.g. a component still references it after removal).

## Maintenance notes

- The `history` array stores `downloadUrl` references. If history is ever persisted to localStorage (it currently only stores metadata, not blobs), the URLs would be invalid on page reload — a future enhancement could store blobs in IndexedDB instead.
- When adding new features that create object URLs, follow the pattern: create → use → revoke on cleanup.
- The `handleClearAll` function now revokes preview URLs but NOT converted URLs that are in history — this is intentional to keep history downloads working.