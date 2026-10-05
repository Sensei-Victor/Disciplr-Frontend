import type { StateCreator, StoreMutatorIdentifier } from "zustand";
import { BoundaryError } from "./boundaryErrors";
import { assertConnectedSession, getSession } from "./sessionBoundary";

/**
 * Zustand middleware that runs a validation gate before every `set`.
 *
 * The gate receives the *proposed next state* (or partial) plus the live
 * session snapshot. Failed gates throw `BoundaryError` and leave the store
 * unchanged — callers / UI must handle the rejection.
 */

export type ValidateContext<T> = {
  current: T;
  next: T | Partial<T>;
  action?: string;
  session: ReturnType<typeof getSession>;
};

export type ValidateOptions<T> = {
  /** Feature name used in error messages. */
  name: string;
  /**
   * When true, every mutation requires a connected, on-network wallet.
   * Reads are unaffected.
   */
  requireConnected?: boolean;
  /**
   * Return a sanitized next-state (or throw). Partial updates are passed
   * through as-is; implementors should treat unknown keys as tampering.
   */
  validate: (ctx: ValidateContext<T>) => T | Partial<T>;
};

type Validate = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  config: StateCreator<T, Mps, Mcs>,
  options: ValidateOptions<T>,
) => StateCreator<T, Mps, Mcs>;

type SetState = (
  partial: unknown,
  replace?: boolean,
  ...extra: unknown[]
) => void;

export const validate = (<T>(
  config: StateCreator<T, [], []>,
  options: ValidateOptions<T>,
): StateCreator<T, [], []> => {
  return (set, get, api) => {
    const runGuard = (
      partial: unknown,
      replace?: boolean,
      ...extra: unknown[]
    ) => {
      if (options.requireConnected) {
        assertConnectedSession();
      }

      const current = get();
      const resolvedPartial =
        typeof partial === "function"
          ? (partial as (state: T) => T | Partial<T>)(current)
          : (partial as T | Partial<T>);

      let sanitized: T | Partial<T>;
      try {
        sanitized = options.validate({
          current,
          next: resolvedPartial,
          session: getSession(),
        });
      } catch (err) {
        if (err instanceof BoundaryError) throw err;
        throw new BoundaryError(
          "TAMPERED_INPUT",
          `${options.name} rejected an update.`,
          err,
        );
      }

      return (set as SetState)(sanitized, replace, ...extra);
    };

    const guardedSet: typeof set = runGuard as typeof set;

    // Also guard external api.setState so tests and external callers are covered
    const originalApiSetState = api.setState.bind(api);
    (api as { setState: typeof api.setState }).setState = (
      partial: unknown,
      replace?: boolean,
    ) => {
      if (options.requireConnected) {
        assertConnectedSession();
      }
      const current = get();
      const resolvedPartial =
        typeof partial === "function"
          ? (partial as (state: T) => T | Partial<T>)(current)
          : (partial as T | Partial<T>);
      let sanitized: T | Partial<T>;
      try {
        sanitized = options.validate({
          current,
          next: resolvedPartial,
          session: getSession(),
        });
      } catch (err) {
        if (err instanceof BoundaryError) throw err;
        throw new BoundaryError(
          "TAMPERED_INPUT",
          `${options.name} rejected an update.`,
          err,
        );
      }
      return originalApiSetState(sanitized as Parameters<typeof originalApiSetState>[0], replace as never);
    };

    // `set` above is only what the store's own actions receive. The public
    // `useStore.setState` / `api.setState` handle still pointed at zustand's
    // raw setter, so a write issued from outside the store reached state
    // without ever passing this gate. Re-point it at the guarded version —
    // the same shape devtools and persist use — so every mutation is
    // validated, whichever handle it comes through. Note `guardedSet` closes
    // over `set` (persist's wrapped setter), so persistence still runs.
    api.setState = guardedSet;

    return config(guardedSet, get, api);
  };
}) as Validate;

/**
 * Parse an unknown server payload into a typed object or throw
 * `MALFORMED_RESPONSE`. Used at the store/API boundary so pages never
 * apply raw fetch bodies to Zustand.
 */
export function parseServerPayload<T>(
  payload: unknown,
  parse: (value: unknown) => T | null,
  label: string,
): T {
  if (payload === null || payload === undefined) {
    throw new BoundaryError(
      "MALFORMED_RESPONSE",
      `${label} response was empty.`,
    );
  }
  let parsed: T | null;
  try {
    parsed = parse(payload);
  } catch (err) {
    throw new BoundaryError(
      "MALFORMED_RESPONSE",
      `${label} response could not be parsed.`,
      err,
    );
  }
  if (parsed === null) {
    throw new BoundaryError(
      "MALFORMED_RESPONSE",
      `${label} response failed schema validation.`,
    );
  }
  return parsed;
}
