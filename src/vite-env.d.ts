/// <reference types="vite/client" />

// --------------------------------------------------------------------------
// Environment variable contract for the Vault app.
//
// Invariants:
//   1. Only Vault-prefixed vars are exposed to the client bundle.	//      (Vault vars are inlined at build time and are visible to anyone	//       who downloads the bundle.)
//   2. Values are validated at access time via the helpers below.
//      Never read `import.meta.env` directly from application code.
//   3. A missing or invalid required variable fails fast with a
//      non-sensitive message (no values leaked into logs).
// --------------------------------------------------------------------------

interface ImportMetaEnv {
  /** Base URL of the API gateway. Optional; defaults to a relative path. */
  readonly VITE_API: string | undefined;
  /** Public identifier for the deployed environment. */
  readonly VITE_APP_ENV: string | undefined;
  /** Feature flag gate for experimental UI. */
  readonly VITE_FEATURE_FLAGS: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// --------------------------------------------------------------------------
// Runtime validation helpers.
//
// These are the only supported way to read environment configuration.
// They are pure functions of their arguments so they can be tested
// without mutating `import.meta.env`.
// --------------------------------------------------------------------------

export const ENV_VALIDATION_ERROR = "ENV_VALIDATION_ERROR" as const;

export type EnvValidationError = typeof ENV_VALIDATION_ERROR;

export class EnvConfigError extends Error {
  public readonly code = ENV_VALIDATION_ERROR;
  constructor(message: string) {
    super(message);
    this.name = "EnvConfigError";
  }
}

const DEFAULT_API_BASE = "/api";

/**
 * Returns true when the value is a non-empty string after trimming.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Returns true when the value is an absolute or relative HTTP(s) URL.
 * Rejects `javascript:`, `data:`, and other non-HTTP schemes.
 */
export function isValidApiBaseUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const trimmed = value.trim();
  // Relative path must start with a single slash and not a double slash.
  if (trimmed.startsWith("/")) {
    return !trimmed.startsWith("//") && !/[\r\n\t]/.test(trimmed);
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Resolves the API base URL from an environment object.
 *
 * - Omitted / empty -> defaults to `/api`.
 * - Valid absolute or relative URL -> returned trimmed.
 * - Invalid value -> throws EnvConfigError (fail fast, no value leaked).
 */
export function resolveApiBaseUrl(env: ImportMetaEnv | undefined): string {
  const raw = env?.VITE_API;
  if (raw === undefined || raw === "") return DEFAULT_API_BASE;
  if (!isValidApiBaseUrl(raw)) {
    throw new EnvConfigError(
       Invalid VITE_API configuration: expected an absolute http(s) URL or a relative path.",
    );
  }
  return raw.trim();
}

/**
 * Parses the comma-separated feature flag list.
 * - Omitted / empty -> empty set.
 * - Duplicates and whitespace are normalized.
 * - Entries must match /^[a-z0-9_-]+$/i.
 */
export function parseFeatureFlags(raw: string | undefined): ReadonlySet<string> {
  if (!isNonEmptyString(raw)) return new Set();
  const flags = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    if (!/^[a-z0-9_-]+$/i.test(trimmed)) {
      throw new EnvConfigError(
         Invalid VITE_FEATURE_FLAGS entry: expected alphanumeric identifiers separated by commas.",
      );
    }
    flags.add(trimmed);
  }
  return flags;
}

/**
 * Returns the current environment label, defaulting to \"development\".
 * Rejects values that contain whitespace or non-identifier characters.
 */
export function resolveAppEnv(env: ImportMetaEnv | undefined): string {
  const raw = env?.VITE_APP_ENV;
  if (!isNonEmptyString(raw)) return "development";
  const trimmed = raw.trim();
  if (!/^[a-z0-9_-]+$/i.test(trimmed)) {
    throw new EnvConfigError(
       "Invalid VITE_APP_ENV configuration: expected an identifier.",
    );
  }
  return trimmed;
}
