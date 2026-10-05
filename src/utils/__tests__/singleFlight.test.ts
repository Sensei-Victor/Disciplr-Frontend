/**
 * singleFlight.test.ts
 *
 * Unit tests for the single-flight replay guard that protects sensitive
 * vault actions from double submission.
 */

import { describe, expect, it, vi } from "vitest";
import { createSingleFlightRunner } from "../singleFlight";

describe("createSingleFlightRunner", () => {
  it("coalesces overlapping calls into a single execution", async () => {
    const runner = vi.fn(async (x: number) => x * 2);
    const { run } = createSingleFlightRunner(runner);

    const first = run(2);
    const second = run(2);

    expect(second).toBe(first);
    await expect(first).resolves.toBe(4);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("reports pending state while an invocation is in flight", async () => {
    const deferred: { resolve: (value: unknown) => void } = { resolve: () => undefined };
    const promise = new Promise<unknown>((res) => {
      deferred.resolve = res;
    });
    const { run, isPending } = createSingleFlightRunner(() => promise);

    expect(isPending()).toBe(false);
    const pending = run();
    expect(isPending()).toBe(true);
    deferred.resolve(null);
    await pending;
    expect(isPending()).toBe(false);
  });

  it("starts a fresh execution after the previous one settles", async () => {
    const runner = vi.fn(async () => undefined);
    const { run } = createSingleFlightRunner(runner);

    await run();
    await run();
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("releases the in-flight slot even when the run rejects", async () => {
    const runner = vi.fn(async () => {
      throw new Error("boom");
    });
    const { run, isPending } = createSingleFlightRunner(runner);

    await expect(run()).rejects.toThrow("boom");
    expect(isPending()).toBe(false);

    // A later call is allowed and runs again.
    await expect(run()).rejects.toThrow("boom");
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("propagates the result of the coalesced run", async () => {
    const { run } = createSingleFlightRunner(async (a: string, b: number) => `${a}-${b}`);

    const first = run("vault", 7);
    const second = run("vault", 7);
    await expect(first).resolves.toBe("vault-7");
    await expect(second).resolves.toBe("vault-7");
  });

  it("shares a rejection across coalesced callers without double execution", async () => {
    const error = new Error("vault unavailable");
    const runner = vi.fn(async () => {
      throw error;
    });
    const { run } = createSingleFlightRunner(runner);

    const first = run();
    const second = run();

    expect(second).toBe(first);
    await expect(first).rejects.toBe(error);
    await expect(second).rejects.toBe(error);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("starts a new execution when arguments differ after settlement", async () => {
    const runner = vi.fn(async (x: number) => x + 1);
    const { run } = createSingleFlightRunner(runner);

    await expect(run(1)).resolves.toBe(2);
    await expect(run(2)).resolves.toBe(3);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("allows a fresh run after a coalesced run rejects", async () => {
    const runner = vi
      .fn()
      .mockRejectedOnce(new Error("boom"))
      .mockResolvedValue("ok");
    const { run, isPending } = createSingleFlightRunner(runner);

    await expect(run()).rejects.toThrow("boom");
    expect(isPending()).toBe(false);

    await expect(run()).resolves.toBe("ok");
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("does not leak the in-flight slot when the runner throws synchronously", async () => {
    const error = new Error("sync failure");
    const runner = vi
      .fn(() => {
        throw error;
      })
      .mockReturnValue(undefined);
    const { run, isPending } = createSingleFlightRunner(runner);

    await expect(run()).rejects.toBe(error);
    expect(isPending()).toBe(false);
  });

  it("supports concurrent callers and only executes once", async () => {
    const deferred: { resolve: (value: number) => void } = { resolve: () => undefined };
    const promise = new Promise<number>((res) => {
      deferred.resolve = res;
    });
    const runner = vi.fn(() => promise);
    const { run } = createSingleFlightRunner(runner);

    const calls = Array.from({ length: 5 }, () => run());
    deferred.resolve(42);

    await Promise.all(calls.map((p) => expect(p).resolves.toBe(42)));
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("exposes a stable isPending signal across multiple runs", async () => {
    const runner = vi.fn().mockResolvedUnused();
    const { run, isPending } = createSingleFlightRunner(runner);

    expect(isPending()).toBe(false);
    const first = run();
    expect(isPending()).toBe(true);
    await first;
    expect(isPending()).toBe(false);
    const second = run();
    expect(isPending()).toBe(true);
    await second;
    expect(isPending()).toBe(false);
    expect(runner).toHaveBeenCalledTimes(2);
  });
});
