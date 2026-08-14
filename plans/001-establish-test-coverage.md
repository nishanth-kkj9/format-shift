# Plan 001: Establish a test baseline for conversion logic

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e56a9be..HEAD -- src/utils/converter.ts src/utils/metadata.ts server/convert.ts package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `e56a9be`, 2026-08-14
- **Issue**: (none)

## Why this matters

This project has **zero automated tests** for its most complex, bug-prone logic: CSV/JSON/YAML/XML conversion, audio buffer manipulation, and ffmpeg argument construction. These functions are pure and deterministic — ideal for unit testing. Without a safety net, every future refactor (including plans 002-006) risks silently breaking conversion behavior. This plan establishes the test infrastructure and covers the highest-value pure functions first.

## Current state

The relevant files and their roles:

- `src/utils/converter.ts` — client-side conversion logic; contains pure data-conversion helpers (`jsonToCsv`, `csvToJson`, `jsonToXml`, `jsonToYaml`, `markdownToHtml`, `formatBytes`) and browser-dependent functions (`convertImage`, `convertAudio`, `convertVideo`, `convertDataDocument`)
- `src/utils/metadata.ts` — `formatDuration` helper (pure) and `extractFileMetadata` (browser-dependent)
- `server/convert.ts` — server-side ffmpeg conversion; contains `imageFilters` (pure) and `convertFile` (spawns ffmpeg)
- `package.json` — no test script, no test framework installed

Key pure functions to test (with current line numbers):

```ts
// src/utils/converter.ts:690-710
function jsonToCsv(json: unknown, delimiter = ','): string {
  const arr = Array.isArray(json) ? json : [json];
  if (arr.length === 0) return '';
  const headers = Object.keys(arr[0] as Record<string, unknown>);
  const headerLine = headers.join(delimiter);
  const rows = arr.map((item) => {
    const record = item as Record<string, unknown>;
    return headers
      .map((header) => {
        const val = record[header];
        if (val === null || val === undefined) return '';
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return strVal.includes(delimiter) || strVal.includes('\n') ? `"${strVal.replace(/"/g, '""')}"` : strVal;
      })
      .join(delimiter);
  });
  return [headerLine, ...rows].join('\n');
}
```

```ts
// src/utils/converter.ts:712-730
function csvToJson(csvText: string, delimiter = ','): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));
  const results: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, index) => {
      obj[h] = values[index] || '';
    });
    results.push(obj);
  }
  return results;
}
```

```ts
// src/utils/converter.ts:890-897
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
```

```ts
// src/utils/metadata.ts:9-14
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
```

```ts
// server/convert.ts:106-137
function imageFilters(opts: ConvertOptions): string[] {
  const filters: string[] = [];
  const q = opts.quality ?? 90;
  if (opts.grayscale) filters.push("format=gray");
  if (opts.rotation) {
    const t = opts.rotation === 90 ? "0" : opts.rotation === 270 ? "1" : "2";
    filters.push(`transpose=${t}`);
  }
  if (opts.maxWidth || opts.maxHeight) {
    const w = opts.maxWidth ? String(opts.maxWidth) : "-2";
    const h = opts.maxHeight ? String(opts.maxHeight) : "-2";
    filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease`);
  }
  if (opts.targetFormat === "ico") filters.push("scale=32:32:force_original_aspect_ratio=decrease");
  const args: string[] = [];
  if (filters.length) args.push("-vf", filters.join(","));
  if (["jpg", "jpeg"].includes(opts.targetFormat)) {
    const qscale = Math.round(31 - (q / 100) * 29);
    args.push("-q:v", String(qscale));
  } else if (opts.targetFormat === "webp") {
    args.push("-quality", String(q));
  } else if (opts.targetFormat === "avif") {
    args.push("-crf", String(Math.round(32 - (q / 100) * 24)));
  }
  return args;
}
```

**Repo conventions**:
- TypeScript with `"type": "module"` in `package.json` — tests must use ESM imports
- No existing test framework — you'll add one
- Code style: 2-space indent, single quotes, semicolons, trailing commas

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `npm install`            | exit 0              |
| Typecheck | `npm run lint`           | exit 0, no errors   |
| Tests     | `npm test`               | all pass            |

## Scope

**In scope** (the only files you should modify):
- `package.json` — add test script and devDependencies
- `src/utils/converter.test.ts` (create)
- `src/utils/metadata.test.ts` (create)
- `server/convert.test.ts` (create)
- `vitest.config.ts` (create, if needed)

**Out of scope** (do NOT touch, even though they look related):
- `src/utils/converter.ts` — do not modify the source; tests only
- `src/utils/metadata.ts` — do not modify the source; tests only
- `server/convert.ts` — do not modify the source; tests only
- Any browser-dependent functions (`convertImage`, `convertAudio`, `convertVideo`, `convertDataDocument`, `extractFileMetadata`) — these need jsdom/mock setup that's out of scope for this plan

## Git workflow

- Branch: `advisor/001-test-coverage`
- Commit message style: `test: add unit tests for conversion helpers` (conventional commits, matching `git log` style)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install Vitest

Install Vitest as a dev dependency:

```bash
npm install -D vitest
```

**Verify**: `npm ls vitest` → shows vitest installed

### Step 2: Add test script to package.json

Add to the `scripts` section of `package.json`:

```json
"test": "vitest run"
```

**Verify**: `npm test` → exits 0 with "No test files found" (or similar)

### Step 3: Create `src/utils/converter.test.ts`

Create a test file covering the pure data-conversion helpers. Note: `jsonToCsv`, `csvToJson`, `jsonToXml`, `jsonToYaml`, `markdownToHtml` are **not exported** from `converter.ts` — they're module-private. You have two options:

**Option A (recommended)**: Export them. Add `export` keyword to these functions in `src/utils/converter.ts`:
- `jsonToCsv` (line 690)
- `csvToJson` (line 712)
- `jsonToXml` (line 732)
- `jsonToYaml` (line 763)
- `markdownToHtml` (line 790)

This is a minimal, safe change — it only adds the `export` keyword, no behavior change.

**Option B**: Test them indirectly through `convertDataDocument` — but that's browser-dependent (uses `file.text()`), so avoid this.

Go with **Option A**. Then write tests:

```ts
// src/utils/converter.test.ts
import { describe, it, expect } from 'vitest';
import { jsonToCsv, csvToJson, jsonToXml, jsonToYaml, markdownToHtml, formatBytes } from './converter';

describe('jsonToCsv', () => {
  it('converts array of objects to CSV with headers', () => {
    const input = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
    expect(jsonToCsv(input)).toBe('id,name\n1,Alice\n2,Bob');
  });

  it('handles empty array', () => {
    expect(jsonToCsv([])).toBe('');
  });

  it('quotes values containing delimiter', () => {
    const input = [{ name: 'Smith, John' }];
    expect(jsonToCsv(input)).toBe('name\n"Smith, John"');
  });

  it('handles null/undefined values as empty', () => {
    const input = [{ a: null, b: undefined, c: 1 }];
    expect(jsonToCsv(input)).toBe('a,b,c\n,,1');
  });
});

describe('csvToJson', () => {
  it('converts CSV to array of objects', () => {
    const input = 'id,name\n1,Alice\n2,Bob';
    expect(csvToJson(input)).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('handles empty input', () => {
    expect(csvToJson('')).toEqual([]);
  });

  it('skips empty lines', () => {
    const input = 'id,name\n1,Alice\n\n2,Bob';
    expect(csvToJson(input)).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });
});

describe('jsonToXml', () => {
  it('converts object to XML', () => {
    const input = { name: 'Alice', age: 30 };
    const result = jsonToXml(input);
    expect(result).toContain('<name>Alice</name>');
    expect(result).toContain('<age>30</age>');
  });

  it('handles nested objects', () => {
    const input = { user: { name: 'Alice' } };
    const result = jsonToXml(input);
    expect(result).toContain('<user>');
    expect(result).toContain('<name>Alice</name>');
  });
});

describe('jsonToYaml', () => {
  it('converts object to YAML', () => {
    const input = { name: 'Alice', age: 30 };
    const result = jsonToYaml(input);
    expect(result).toContain('name: Alice');
    expect(result).toContain('age: 30');
  });

  it('handles arrays', () => {
    const input = { items: [1, 2, 3] };
    const result = jsonToYaml(input);
    expect(result).toContain('items:');
    expect(result).toContain('- 1');
  });
});

describe('markdownToHtml', () => {
  it('converts markdown headings', () => {
    const result = markdownToHtml('# Hello');
    expect(result).toContain('<h1>Hello</h1>');
  });

  it('converts bold text', () => {
    const result = markdownToHtml('**bold**');
    expect(result).toContain('<b>bold</b>');
  });
});

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('formats KB', () => {
    expect(formatBytes(1024)).toBe('1.00 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
  });
});
```

**Verify**: `npm test` → all tests pass

### Step 4: Create `src/utils/metadata.test.ts`

```ts
// src/utils/metadata.test.ts
import { describe, it, expect } from 'vitest';
import { formatDuration } from './metadata';

describe('formatDuration', () => {
  it('formats zero as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats NaN as 0:00', () => {
    expect(formatDuration(NaN)).toBe('0:00');
  });

  it('formats seconds under a minute', () => {
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('pads seconds with leading zero', () => {
    expect(formatDuration(61)).toBe('1:01');
  });
});
```

**Verify**: `npm test` → all tests pass

### Step 5: Create `server/convert.test.ts`

`imageFilters` is not exported from `server/convert.ts`. Export it (add `export` keyword at line 106). Then:

```ts
// server/convert.test.ts
import { describe, it, expect } from 'vitest';
import { imageFilters } from './convert';

describe('imageFilters', () => {
  it('returns empty args for default options', () => {
    expect(imageFilters({ targetFormat: 'png', category: 'image' })).toEqual([]);
  });

  it('adds grayscale filter', () => {
    const result = imageFilters({ targetFormat: 'png', category: 'image', grayscale: true });
    expect(result).toContain('-vf');
    expect(result.join(' ')).toContain('format=gray');
  });

  it('adds rotation filter', () => {
    const result = imageFilters({ targetFormat: 'png', category: 'image', rotation: 90 });
    expect(result.join(' ')).toContain('transpose=0');
  });

  it('adds scale filter for maxWidth', () => {
    const result = imageFilters({ targetFormat: 'png', category: 'image', maxWidth: 1920 });
    expect(result.join(' ')).toContain('scale=1920:-2');
  });

  it('adds quality args for jpg', () => {
    const result = imageFilters({ targetFormat: 'jpg', category: 'image', quality: 90 });
    expect(result).toContain('-q:v');
  });

  it('adds quality args for webp', () => {
    const result = imageFilters({ targetFormat: 'webp', category: 'image', quality: 85 });
    expect(result).toContain('-quality');
    expect(result).toContain('85');
  });

  it('adds crf for avif', () => {
    const result = imageFilters({ targetFormat: 'avif', category: 'image', quality: 90 });
    expect(result).toContain('-crf');
  });

  it('adds ico scale', () => {
    const result = imageFilters({ targetFormat: 'ico', category: 'image' });
    expect(result.join(' ')).toContain('scale=32:32');
  });
});
```

**Verify**: `npm test` → all tests pass

### Step 6: Run full verification

**Verify**:
1. `npm run lint` → exit 0, no errors
2. `npm test` → all tests pass
3. `npm run build` → exit 0

## Test plan

- New tests in `src/utils/converter.test.ts` covering: `jsonToCsv` (4 cases), `csvToJson` (3 cases), `jsonToXml` (2 cases), `jsonToYaml` (2 cases), `markdownToHtml` (2 cases), `formatBytes` (3 cases)
- New tests in `src/utils/metadata.test.ts` covering: `formatDuration` (5 cases)
- New tests in `server/convert.test.ts` covering: `imageFilters` (8 cases)
- Total: ~29 new tests

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; at least 25 new tests exist and pass
- [ ] `grep -rn "export function jsonToCsv" src/utils/converter.ts` returns a match
- [ ] `grep -rn "export function csvToJson" src/utils/converter.ts` returns a match
- [ ] `grep -rn "export function imageFilters" server/convert.ts` returns a match
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- You discover that exporting the private functions breaks something unexpected (e.g. a naming collision).

## Maintenance notes

- When new conversion helpers are added to `converter.ts`, they should be exported and tested following the patterns in this plan.
- The browser-dependent functions (`convertImage`, `convertAudio`, `convertVideo`, `convertDataDocument`) are intentionally untested here — they need jsdom or mock setup. A follow-up plan could add those.
- If the CSV parsing is improved (see plan 005), the tests in this file must be updated to match the new behavior.