/**
 * singleFlight.ts
 *
 * Prevents replay of a sensitive async operation: while one invocation is
 * in flight, concurrent callers receive the SAME promise instead of firing
 * the underlying operation again. This is the boundary guard against
 * double-submits of irreversible vault actions (validate / cancel), even if
 * the UI (or a hostile script) calls the seam more than once in a tick.
 *
 * Invariants:
*  - At most one underlying runner invocation is in flight at any time.
 *  - Concurrent callers within the same flight share the exact same promise
 *    (so they observe identical resolution/rejection and no duplicate side
 *    effects).
 *  - The flight is cleared on both resolve and reject, so a legitimate later
 *    action still executes.
 *  - A rejected flight does not poison future flights.
 */

export interface SingleFlightRunner<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult>;
  isPending: () => boolean;
}

/**
 * Wraps an async runner so overlapping calls are coalesced into one execution.
 * After the promise settles (resolve or reject) the runner becomes available
 * again, so a legitimate later action still executes.
 */
export function createSingleFlightRunner<TArgs extends unknown[], TResult>(
  runner: (...args: TArgs) => Promise<TResult>,
): SingleFlightRunner<TArgs, TResult> {
  if (typeof runner !== 'function') {
    throw new TypeError('createSingleFlightRunner: runner must be a function');
  }

  let inflight: Promise<TResult> | null = null;

  const run = (...args: TArgs): Promise<TResult> => {
    if (inflight) {
      return inflight;
    }
    // Capture the flight locally so the `finally` clearance only nulls the
    // shared slot if it still points at this flight. This prevents a stale
    // flight from clearing a newly started one in theoretical re-entrant
    // settlement orderings.
    const flight = Promise.resolve()
      .then(() => runner(...args))
      .finally(() => {
        if (inflight === flight) {
          inflight = null;
        }
      });
    inflight = flight;
    return flight;
  };

  return { run, isPending: () => inflight !== null };
}
