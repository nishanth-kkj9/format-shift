# Plan 005: Improve CSV parsing to handle quoted fields

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e56a9be..HEAD -- src/utils/converter.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (test coverage — the tests in plan 001 must land first so this refactor has a safety net)
- **Category**: bug
- **Planned at**: commit `e56a9be`, 2026-08-14
- **Issue**: (none)

## Why this matters

The CSV parsing in `src/utils/converter.ts` is naive: `csvToJson` splits lines on the delimiter without respecting quoted fields. A CSV like `name,note\n"Smith, John","said ""hi"""` will be split incorrectly — the comma inside the quoted `"Smith, John"` breaks the field. Similarly, `jsonToCsv` stringifies nested objects as `[object Object]` instead of a useful representation. This plan fixes both functions to handle RFC 4180-style quoted fields.

## Current state

The relevant file and its role:

- `src/utils/converter.ts` — contains `csvToJson` and `jsonToCsv`, the CSV conversion helpers

Current code excerpts:

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

**Repo conventions**:
- TypeScript
- Code style: 2-space indent, single quotes, semicolons
- These functions are module-private (not exported) — plan 001 exports them for testing

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `npm run lint`           | exit 0, no errors   |
| Tests     | `npm test`               | all pass            |
| Build     | `npm run build`          | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/utils/converter.ts`
- `src/utils/converter.test.ts` (update tests from plan 001)

**Out of scope** (do NOT touch, even though they look related):
- `src/utils/metadata.ts` — unrelated
- `server/convert.ts` — server-side, unrelated
- `src/types.ts` — no type changes needed

## Git workflow

- Branch: `advisor/005-csv-parsing`
- Commit message style: `fix: handle quoted fields in CSV parsing` (conventional commits)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a CSV line parser that respects quoted fields

Add a helper function that splits a CSV line into fields, respecting double-quoted sections and escaped quotes (`""`):

```ts
// src/utils/converter.ts (add near the other data helpers, before jsonToCsv)
function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("" inside a quoted field)
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}
```

**Verify**: `npm run lint` → exit 0

### Step 2: Update `csvToJson` to use the new parser

Replace the `split(delimiter)` calls with `parseCsvLine`:

```ts
// src/utils/converter.ts:712-730 (updated)
function csvToJson(csvText: string, delimiter = ','): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0], delimiter);
  const results: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCsvLine(lines[i], delimiter);
    const obj: Record<string, string> = {};
    headers.forEach((h, index) => {
      obj[h] = values[index] || '';
    });
    results.push(obj);
  }
  return results;
}
```

**Verify**: `npm run lint` → exit 0

### Step 3: Improve `jsonToCsv` nested object handling

The current code does `JSON.stringify(val)` for nested objects, which produces `{"a":1}` — valid but not ideal for spreadsheet display. Keep the JSON.stringify but ensure it's properly quoted if it contains the delimiter:

```ts
// src/utils/converter.ts:690-710 (updated)
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
        // Quote if contains delimiter, newline, or double quote
        return strVal.includes(delimiter) || strVal.includes('\n') || strVal.includes('"')
          ? `"${strVal.replace(/"/g, '""')}"`
          : strVal;
      })
      .join(delimiter);
  });
  return [headerLine, ...rows].join('\n');
}
```

**Verify**: `npm run lint` → exit 0

### Step 4: Update tests in `src/utils/converter.test.ts`

Add new test cases for quoted fields:

```ts
// src/utils/converter.test.ts (add to the csvToJson describe block)
it('handles quoted fields containing delimiter', () => {
  const input = 'name,note\n"Smith, John","said ""hi"""';
  expect(csvToJson(input)).toEqual([
    { name: 'Smith, John', note: 'said "hi"' },
  ]);
});

it('handles quoted fields with escaped quotes', () => {
  const input = 'name,quote\nAlice,"She said ""hello"""';
  expect(csvToJson(input)).toEqual([
    { name: 'Alice', quote: 'She said "hello"' },
  ]);
});

it('handles fields with leading/trailing spaces', () => {
  const input = 'name,age\n  Alice  ,  30';
  expect(csvToJson(input)).toEqual([
    { name: 'Alice', age: '30' },
  ]);
});
```

Also add a test for `jsonToCsv` with values containing double quotes:

```ts
// src/utils/converter.test.ts (add to the jsonToCsv describe block)
it('quotes values containing double quotes', () => {
  const input = [{ name: 'He said "hi"' }];
  expect(jsonToCsv(input)).toBe('name\n"He said ""hi"""');
});
```

**Verify**: `npm test` → all tests pass (including the new ones)

### Step 5: Run full verification

**Verify**:
1. `npm run lint` → exit 0, no errors
2. `npm test` → all tests pass
3. `npm run build` → exit 0

## Test plan

- New tests in `src/utils/converter.test.ts`:
  - `csvToJson` with quoted field containing delimiter
  - `csvToJson` with escaped quotes inside quoted field
  - `csvToJson` with leading/trailing whitespace
  - `jsonToCsv` with values containing double quotes
- Existing tests from plan 001 must still pass (regression check)

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; new tests for quoted CSV fields exist and pass
- [ ] `grep -rn "parseCsvLine" src/utils/converter.ts` returns at least 2 matches (definition + usage)
- [ ] `grep -rn "\.split(delimiter)" src/utils/converter.ts` returns NO matches in `csvToJson` (the old naive split is gone)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- Plan 001 hasn't landed yet (the tests don't exist) — in that case, write the tests as part of this plan's Step 4 instead of updating existing ones.

## Maintenance notes

- The `parseCsvLine` helper handles RFC 4180-style quoting but not multi-line quoted fields (a quoted field spanning multiple lines). If that's needed, the `split('\n')` at the top of `csvToJson` would need to be replaced with a stateful line parser.
- The `jsonToCsv` function now quotes values containing double quotes — this is a behavior change that could affect existing users' output. The tests from plan 001 should catch any regressions.
- If a third-party CSV library (e.g. `papaparse`) is ever added, these helpers could be replaced entirely — but for now the hand-rolled parser is sufficient.