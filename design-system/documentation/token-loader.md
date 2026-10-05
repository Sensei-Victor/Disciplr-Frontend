# Token Loader Contract

This document specifies the public API of
`design-system/src/utils/token-loader.ts`, the security guarantees it provides,
and the rules consumers must follow when calling it.

> **Regression coverage:** The authorization, validation, and state-transition
> invariants described below are enforced by the focused test suite in
> `design-system/src/utils/__tests__/token-loader.test.ts`. Any change to the
> guards, merge order, or error modes in this document must be accompanied by
> corresponding test updates.

---

## Overview

`token-loader.ts` exposes two functions:

| Function | Purpose |
|---|---|
| `loadTokens(tokenFile)` | Read and parse a single JSON token file from the `tokens/` directory. |
| `getAllTokens()` | Aggregate all built-in token files into a single merged `DesignTokens` object. |

Both functions confine every file-system read to the `tokens/` directory that
sits under the process working directory. Any request that would escape that
boundary is rejected before the file system is touched.

---

## `loadTokens(tokenFile: string): DesignTokens`

### Signature

```ts
import { loadTokens } from 'design-system/src/utils/token-loader';

const tokens = loadTokens('colors.json');
```

### Validation rules

The function applies **two sequential guards** before reading the file.

#### Guard 1 — Basename-only with `.json` extension

```
/^[^/\\]+\.json$/
```

The argument must be a plain filename — no path separators (`/` or `\`), no
leading dots or directory components — and it must end with `.json`.

| Input | Result |
|---|---|
| `'colors.json'` | ✅ passes |
| `'typography.json'` | ✅ passes |
| `'../secrets.json'` | ❌ throws `Invalid token file name` |
| `'sub/dir/colors.json'` | ❌ throws `Invalid token file name` |
| `'colors.txt'` | ❌ throws `Invalid token file name` |
| `'colors'` | ❌ throws `Invalid token file name` |
| `'/etc/passwd.json'` | ❌ throws `Invalid token file name` |

#### Guard 2 — Within-`tokens/` resolution check

After the basename check passes, the function resolves the full path:

```ts
const tokensDir = path.resolve(process.cwd(), 'tokens');
const tokenPath = path.resolve(tokensDir, tokenFile);
```

It then asserts that `tokenPath` starts with `tokensDir + path.sep` (or equals
`tokensDir` exactly):

```ts
if (!tokenPath.startsWith(tokensDir + path.sep) && tokenPath !== tokensDir) {
  throw new Error(`Path traversal detected for token file: "${tokenFile}"`);
}
```

This second guard is a defense-in-depth measure. Even if a future change to
the regex or the Node.js `path` module allowed a separator through, the
resolved-path check would still catch an attempt to escape the directory.

#### Guard ordering invariant

Both guards run **before** any file-system access. The basename regex is
evaluated first; only if it passes is the resolved-path check performed. This
ordering is a security invariant: a rejected input must never reach
`fs.readFileSync`, and the thrown error must be deterministic regardless of
whether the target file exists on disk. Tests assert that no `fs` call is made
for rejected inputs.

### Return value

On success the raw file content is parsed with `JSON.parse` and cast to
`DesignTokens`. The shape of `DesignTokens` is defined in
`design-system/src/types/tokens.ts`.

### Error modes

| Condition | Error message |
|---|---|
| `tokenFile` fails the basename regex | `Invalid token file name: "<input>"` |
| Resolved path escapes `tokens/` | `Path traversal detected for token file: "<input>"` |
| File does not exist or is unreadable | Node.js `ENOENT` / `EACCES` propagated as-is |
| File content is not valid JSON | `SyntaxError` from `JSON.parse` |

All errors are thrown synchronously; there is no async path.

Error messages include the offending input verbatim so failures are
diagnosable, but they must not include resolved absolute paths, environment
variables, or file contents. Tests assert the exact message shape for each
rejection class to prevent accidental leakage of sensitive data.

`loadTokens` is a pure function of its argument and the on-disk token file: it
holds no module-level mutable state, so concurrent or repeated calls cannot
observe stale or interleaved results.

---

## `getAllTokens(): DesignTokens`

### Signature

```ts
import { getAllTokens } from 'design-system/src/utils/token-loader';

const allTokens = getAllTokens();
```

### File list and load order

`getAllTokens` calls `loadTokens` for each file in this fixed, ordered list:

```
colors.json
typography.json
spacing.json
shadows.json
motion.json
borders.json
z-index.json
opacity.json
breakpoints.json
toast.json
```

### Merge behaviour

The results are merged with `Object.assign` into a single accumulator:

```ts
const allTokens: DesignTokens = {};
tokenFiles.forEach(file => {
  const tokens = loadTokens(file);
  Object.assign(allTokens, tokens);
});
return allTokens;
```

**Key consequences:**

- **Later files win:** if two token files define the same top-level key, the
  value from the later file in the list overwrites the earlier one. Avoid
  duplicate top-level keys across token files.
- **Required files fail loudly:** if a file is missing, unreadable, or contains
  malformed JSON, `getAllTokens` throws an error naming that file. Callers and
  CI never receive a silently incomplete token set.
- **No deep merge:** only top-level keys are merged. Nested objects from
  different files are not combined — the last writer for a given key wins in
  full.

### Determinism and failure isolation

The `tokenFiles` list is fixed and ordered, so the merge result is
deterministic for a given on-disk state. A failure in one file (missing,
unreadable, or malformed JSON) is isolated: it is logged via `logger.warn` and
that file is skipped, while the remaining files are still loaded in order.
Tests cover the partial-failure path to ensure a single bad file cannot abort
the aggregation or corrupt the keys contributed by earlier files.

### Adding a new token file to the aggregator

1. Create `tokens/<name>.json` following the [Token Authoring Guide](./token-authoring.md).
2. Add `'<name>.json'` to the `tokenFiles` array in `getAllTokens` (in
   `design-system/src/utils/token-loader.ts`).
3. Confirm that `loadTokens('<name>.json')` passes the basename and traversal
   guards (it will, provided the name contains no path separators).
4. Update the [Token Catalog](./token-catalog.md) table with the new group.

---

## Test coverage map

The regression suite maps each acceptance criterion to concrete tests:

| Criterion | Test location |
|---|---|
| Valid basename inputs load and parse | `token-loader.test.ts` — success cases |
| Path traversal and separator inputs rejected before FS access | `token-loader.test.ts` — rejection cases |
| Boundary inputs (empty string, leading dot, wrong extension) | `token-loader.test.ts` — boundary cases |
| Partial failure in `getAllTokens` skips only the failing file | `token-loader.test.ts` — partial-failure regression |
| Merge order and later-file-wins semantics | `token-loader.test.ts` — merge regression |
| Error messages do not leak sensitive data | `token-loader.test.ts` — message-shape assertions |

---

## Worked example

```ts
import { loadTokens, getAllTokens } from 'design-system/src/utils/token-loader';

// ── Load a single token file ─────────────────────────────────────────────────
// ✅ Correct — plain basename, .json extension
const colorTokens = loadTokens('colors.json');
console.log(colorTokens['color-surface-primary']);

// ❌ Incorrect — path traversal attempt; throws immediately, no FS access
try {
  loadTokens('../../etc/passwd.json');
} catch (e) {
  // Error: Invalid token file name: "../../etc/passwd.json"
}

// ❌ Incorrect — subdirectory separator; throws immediately
try {
  loadTokens('sub/colors.json');
} catch (e) {
  // Error: Invalid token file name: "sub/colors.json"
}

// ── Load all tokens at once ──────────────────────────────────────────────────
// Returns a merged DesignTokens object covering all ten built-in token files.
// Missing, unreadable, or malformed required files throw with file context.
const everything = getAllTokens();
```

---

## Security guarantees summary

| Guarantee | Mechanism |
|---|---|
| No path separators in the filename | Regex `^[^/\\]+\.json$` rejects any `/` or `\` |
| No directory traversal | `path.resolve` + `startsWith(tokensDir + sep)` check |
| `.json` extension only | Regex enforces the suffix |
| All reads confined to `tokens/` | Both guards must pass before `fs.readFileSync` is called |

> **Do not** derive the `tokenFile` argument from user-supplied or untrusted
> input. The guards protect against accidental misuse; they are not a substitute
> for keeping untrusted data out of the call-site entirely.

---

## Related documentation

- [Token Catalog](./token-catalog.md) — maps every token group to its source
  file, runtime CSS variables, and component consumers.
- [Token Authoring Guide](./token-authoring.md) — naming conventions,
  `$type`/`$value` structure, and validation rules for adding new tokens.
- [Getting Started](./getting-started.md) — package setup and initial
  configuration.
- Source: [`design-system/src/utils/token-loader.ts`](../src/utils/token-loader.ts)
