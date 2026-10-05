/** @vitest-environment jsdom */
import { ACCOUNT_A } from '@/__tests__/fixtures/stellarAddresses';
import { afterEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import { BoundaryError } from "../boundaryErrors";
import {
  __resetSessionForTests,
  __setSessionForTests,
  assertConnectedSession,
  bindSession,
  clearSession,
} from "../sessionBoundary";
import { parseServerPayload, validate } from "../validateMiddleware";

const VALID_ADDR = ACCOUNT_A;

describe("sessionBoundary", () => {
  it("rejects a checksum-corrupted wallet on bind", () => {
    const address = `${VALID_ADDR.slice(0, -1)}A`;
    expect(() => bindSession({ address, network: "TESTNET" })).toThrow(BoundaryError);
  });

  afterEach(() => {
    __resetSessionForTests();
  });

  it("rejects an invalid address on bind", () => {
    expect(() =>
      bindSession({ address: "not-a-wallet", network: "TESTNET" }),
    ).toThrow(BoundaryError);
    expect(() =>
      bindSession({ address: "not-a-wallet", network: "TESTNET" }),
    ).toThrow(/valid Stellar/);
  });

  it("binds a valid TESTNET wallet and bumps epoch", () => {
    const first = bindSession({ address: VALID_ADDR, network: "TESTNET" });
    expect(first.address).toBe(VALID_ADDR);
    expect(first.network).toBe("TESTNET");
    expect(first.epoch).toBeGreaterThan(0);
    const cleared = clearSession();
    expect(cleared.address).toBeNull();
    expect(cleared.epoch).toBeGreaterThan(first.epoch);
  });

  it("assertConnectedSession throws when disconnected", () => {
    expect(() => assertConnectedSession()).toThrow(BoundaryError);
    try {
      assertConnectedSession();
    } catch (err) {
      expect((err as BoundaryError).code).toBe("DISCONNECTED_WALLET");
    }
  });

  it("assertConnectedSession throws WRONG_NETWORK for a mismatched live session", () => {
    __setSessionForTests({ address: VALID_ADDR, network: "PUBLIC" });
    try {
      assertConnectedSession();
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BoundaryError);
      expect((err as BoundaryError).code).toBe("WRONG_NETWORK");
    }
  });
});

describe("validate middleware", () => {
  afterEach(() => {
    __resetSessionForTests();
  });

  it("blocks tampered keys and leaves prior state intact", () => {
    type S = { count: number; bump: (n: number) => void };
    const useStore = create<S>()(
      validate(
        (set) => ({
          count: 0,
          bump: (n) => set({ count: n }),
        }),
        {
          name: "counter",
          validate: ({ next }) => {
            const partial = next as Partial<S>;
            if ("count" in partial && typeof partial.count !== "number") {
              throw new BoundaryError("TAMPERED_INPUT", "count must be a number");
            }
            return partial;
          },
        },
      ),
    );

    useStore.getState().bump(3);
    expect(useStore.getState().count).toBe(3);
    expect(() =>
      useStore.setState({ count: "x" as unknown as number }),
    ).toThrow(BoundaryError);
    expect(useStore.getState().count).toBe(3);
  });

  it("requireConnected rejects mutations without a wallet", () => {
    type S = { flag: boolean; arm: () => void };
    const useStore = create<S>()(
      validate(
        (set) => ({
          flag: false,
          arm: () => set({ flag: true }),
        }),
        {
          name: "gated",
          requireConnected: true,
          validate: ({ next }) => next,
        },
      ),
    );

    expect(() => useStore.getState().arm()).toThrow(BoundaryError);
    expect(useStore.getState().flag).toBe(false);

    bindSession({ address: VALID_ADDR, network: "TESTNET" });
    useStore.getState().arm();
    expect(useStore.getState().flag).toBe(true);
  });
});

describe("parseServerPayload", () => {
  it("rejects empty and schema-invalid bodies", () => {
    expect(() => parseServerPayload(null, () => ({ ok: true }), "demo")).toThrow(
      /empty/,
    );
    expect(() => parseServerPayload({ x: 1 }, () => null, "demo")).toThrow(
      /schema/,
    );
    expect(parseServerPayload({ ok: true }, (v) => v as { ok: boolean }, "demo")).toEqual(
      { ok: true },
    );
  });
});
