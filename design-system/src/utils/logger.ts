/**
 * Canonical runtime-agnostic logger shared by the design-system and app.
 *
 * Detects production via import.meta.env.MODE (Vite) or
 * process.env.NODE_ENV (Node), so it works in both runtimes from a
 * single source of truth.
 *
 * The app re-exports this module from src/utils/logger.ts rather than
 * maintaining its own copy. When changing behaviour here, confirm both
 * packages' tests still pass before merging.
 *
 * ## import.meta compatibility note
 *
 * `import.meta` is only valid in ESM contexts (Vite / bundlers). When
 * Jest/ts-jest compiles to CommonJS, accessing `import.meta` directly
 * causes a TypeScript TS1343 error. We therefore read it through an
 * indirect runtime access (`new Function(...)`) so that:
 *   - TypeScript does not emit TS1343 in CJS mode, and
 *   - Vite's bundler still inlines `import.meta.env.MODE` correctly
 *     because the bundler handles real ESM source.
 */

/** @internal — reads import.meta.env.MODE without a static import.meta reference */
const getViteMode = (): string | undefined => {
  try {
    // new Function avoids static analysis by TypeScript's CJS checker while
    // still executing correctly in a Vite/ESM runtime where import.meta exists.
    // eslint-disable-next-line no-new-func
    return new Function('return (typeof import.meta !== "undefined") ? import.meta?.env?.MODE : undefined')();
  } catch {
    return undefined;
  }
};

const isProd = (): boolean => {
  // Vite: import.meta.env.MODE (accessed dynamically to avoid TS1343 in CJS)
  if (getViteMode() === 'production') {
    return true;
  }

  // Node: process.env.NODE_ENV (accessed via globalThis to avoid requiring
  // @types/node in consumers that don't otherwise depend on Node typings)
  const nodeProcess = (globalThis as any).process;
  if (
    typeof nodeProcess !== 'undefined' &&
    nodeProcess.env?.NODE_ENV === 'production'
  ) {
    return true;
  }

  return false;
};

/* eslint-disable no-console */
export const logger = {
  debug: (...args: unknown[]): void => {
    if (!isProd()) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    if (!isProd()) console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    if (!isProd()) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
/* eslint-enable no-console */
