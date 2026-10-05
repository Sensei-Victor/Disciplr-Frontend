// @vitest-environment jsdom
/**
 * Authorization and validation regression coverage for src/Zustand/Store.ts.
 *
 * Store.test.ts and notificationStore.test.ts cover the happy paths of the two
 * stores. This file covers the invariants those tests do not reach:
 *
 *  - validation:   rejected ids, duplicate/retried decisions, boundary inputs,
 *                  and the fact that a rejected action leaves state untouched;
 *  - state safety: the pending -> history transition happens exactly once and
 *                  never mutates the shared fixtures the store is seeded from;
 *  - authorization: the session-ownership gate (UNAUTHORIZED), the connected
 *                  -wallet requirement (DISCONNECTED_WALLET), payload schema
 *                  rejection (TAMPERED_INPUT / MALFORMED_RESPONSE) and nonce
 *                  replay protection (REPLAY) on the preferences surface that
 *                  Store.ts re-exports.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  sanitizePreferenceFields,
  useNotification,
  useNotificationPreferences,
  useVerifierStore,
  type ValidationTask,
} from "../Store";
import { BoundaryError, type BoundaryErrorCode } from "../boundaryErrors";
import {
  __resetSessionForTests,
  __setSessionForTests,
} from "../sessionBoundary";
import { getNotifications } from "@/components/Notification/exampleNotification/example";
import { initialHistory, initialPending } from "../../fixtures/validations";

/** Distinct-but-valid Stellar identities for session-ownership cases. */
const ALICE = "G" + "A".repeat(55);
const IMPOSTOR = "G" + "B".repeat(55);

/**
 * The argument type of the store's public `setState` handle. The two
 * regression tests below deliberately hand it a payload that is *not* a valid
 * partial state; casting through this alias records that intent without
 * widening anything to `any`.
 */
type SetStateArg = Parameters<typeof useNotificationPreferences.setState>[0];

const VALID_PAYLOAD = {
  email: false,
  push: true,
  frequency: "2",
  quietHours: "08:30",
};

/**
 * Asserts that `fn` rejects with a specific BoundaryError code. Throws a
 * readable error when the call wrongly succeeds, so a silently-removed guard
 * fails the suite instead of passing vacuously.
 */
function expectBoundary(fn: () => unknown, code: BoundaryErrorCode): void {
  let thrown: unknown;
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
    thrown = err;
  }
  if (!threw) {
    throw new Error(`expected BoundaryError(${code}), but nothing was thrown`);
  }
  expect(thrown).toBeInstanceOf(BoundaryError);
  expect((thrown as BoundaryError).code).toBe(code);
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Reset the preferences store to a known state owned by `address`.
 *
 * Ownership can only be stamped by a write made while a session is live: the
 * gate deliberately refuses to clear `ownerKey` while disconnected, so a
 * wallet cannot drop ownership, reconnect as someone else and claim the state.
 * Connect first, write once to pin the owner, then reset the payload values.
 */
function startSessionAs(address: string) {
  __resetSessionForTests();
  localStorage.clear();
  __setSessionForTests({ address, network: "TESTNET" });
  useNotificationPreferences.getState().setEmail(true); // pins ownerKey
  useNotificationPreferences.getState().reset(); // defaults + fresh nonce
}

const pendingIds = () =>
  useVerifierStore.getState().pendingValidations.map((t) => t.id);
const historyIds = () =>
  useVerifierStore.getState().validationHistory.map((t) => t.id);

describe("verifier store — validation and state-transition invariants", () => {
  beforeEach(() => {
    useVerifierStore.setState({
      pendingValidations: [...initialPending],
      validationHistory: [...initialHistory],
    });
  });

  it("seeds from the fixtures and exposes them unmodified", () => {
    expect(pendingIds()).toEqual(initialPending.map((t) => t.id));
    expect(historyIds()).toEqual(initialHistory.map((t) => t.id));
    expect(
      useVerifierStore
        .getState()
        .pendingValidations.every((t) => t.status === "pending"),
    ).toBe(true);
  });

  it("rejects an unknown id without altering either queue", () => {
    const before = clone(useVerifierStore.getState());

    useVerifierStore.getState().approveValidation("no-such-task", "note");
    useVerifierStore.getState().rejectValidation("", "note");

    expect(useVerifierStore.getState()).toMatchObject({
      pendingValidations: before.pendingValidations,
      validationHistory: before.validationHistory,
    });
  });

  it("does not duplicate a task when the same decision is retried", () => {
    const store = useVerifierStore.getState();
    store.approveValidation("v-101", "first pass");
    store.approveValidation("v-101", "second pass must not re-queue");
    store.rejectValidation("v-101", "third pass");

    const occurrences = historyIds().filter((id) => id === "v-101");
    expect(occurrences).toHaveLength(1);
    expect(pendingIds()).not.toContain("v-101");
    // the original decision is the one that sticks
    expect(
      useVerifierStore.getState().validationHistory.find((t) => t.id === "v-101")
        ?.status,
    ).toBe("approved");
  });

  it("stamps decidedAt with a parseable ISO timestamp on transition", () => {
    useVerifierStore.getState().approveValidation("v-101", "reviewed");

    const moved = useVerifierStore
      .getState()
      .validationHistory.find((t) => t.id === "v-101") as ValidationTask;
    expect(moved.decidedAt).toBeDefined();
    expect(new Date(moved.decidedAt as string).toISOString()).toBe(
      moved.decidedAt,
    );
  });

  it("records optional notes as undefined rather than inventing a value", () => {
    useVerifierStore.getState().rejectValidation("v-102");

    const moved = useVerifierStore
      .getState()
      .validationHistory.find((t) => t.id === "v-102") as ValidationTask;
    expect(moved.notes).toBeUndefined();
    expect(moved).not.toHaveProperty("notes", "");
  });

  it("conserves every task: pending + history counts stay constant", () => {
    const totalBefore =
      useVerifierStore.getState().pendingValidations.length +
      useVerifierStore.getState().validationHistory.length;

    useVerifierStore.getState().batchApprove(pendingIds(), "all of them");

    const state = useVerifierStore.getState();
    expect(state.pendingValidations).toHaveLength(0);
    expect(state.validationHistory).toHaveLength(totalBefore);
    expect(
      state.validationHistory.filter((t) => t.status === "approved").length,
    ).toBe(state.validationHistory.length);
  });

  it("keeps a mixed valid/unknown batch partially applied and consistent", () => {
    useVerifierStore.getState().batchReject(["v-101", "ghost"], "partial");

    expect(pendingIds()).toEqual(["v-102"]);
    expect(historyIds()).toContain("v-101");
    expect(historyIds()).not.toContain("ghost");
    expect(
      useVerifierStore
        .getState()
        .validationHistory.find((t) => t.id === "v-101")?.status,
    ).toBe("rejected");
  });

  it("gives each batch member its own copy of the notes string", () => {
    const notes = "shared note";
    const ids = pendingIds();
    useVerifierStore.getState().batchApprove(ids, notes);

    const decided = useVerifierStore
      .getState()
      .validationHistory.filter((t) => ids.includes(t.id));
    expect(decided).toHaveLength(2);
    for (const task of decided) expect(task.notes).toBe(notes);
    // distinct task objects, not one aliased object appearing twice
    expect(decided[0]).not.toBe(decided[1]);
  });

  it("never mutates the shared fixtures the store is seeded from", () => {
    const pendingSnapshot = clone(initialPending);
    const historySnapshot = clone(initialHistory);

    const store = useVerifierStore.getState();
    store.batchApprove(pendingIds(), "approved");
    store.batchReject(["ghost"], "no-op");

    expect(initialPending).toEqual(pendingSnapshot);
    expect(initialHistory).toEqual(historySnapshot);
    expect(initialPending.every((t) => t.status === "pending")).toBe(true);
    expect(initialHistory[0].status).toBe("approved");
  });

  it("does not touch the notification store when deciding tasks", () => {
    const notificationsBefore = clone(
      useNotification.getState().notification,
    );

    useVerifierStore.getState().batchApprove(pendingIds(), "isolated");

    expect(useNotification.getState().notification).toEqual(
      notificationsBefore,
    );
    expect(useNotification.getState().notification.length).toBe(
      getNotifications().length,
    );
  });
});

describe("notification preferences — authorization (re-exported by Store)", () => {
  afterEach(() => {
    __resetSessionForTests();
    localStorage.clear();
  });

  it("rejects a mutation when the stored owner is a different wallet", () => {
    startSessionAs(ALICE); // pins ownerKey to ALICE
    useNotificationPreferences.getState().setEmail(false);
    expect(useNotificationPreferences.getState().ownerKey).toBe(
      `TESTNET:${ALICE}`,
    );

    // A different wallet takes over the session without clearing state.
    __setSessionForTests({ address: IMPOSTOR, network: "TESTNET" });

    expectBoundary(
      () => useNotificationPreferences.getState().setEmail(true),
      "UNAUTHORIZED",
    );
    // the rejected write left the previous owner's value in place
    expect(useNotificationPreferences.getState().email).toBe(false);
    expect(useNotificationPreferences.getState().ownerKey).toBe(
      `TESTNET:${ALICE}`,
    );
  });

  it("allows a mutation for the owning wallet", () => {
    startSessionAs(ALICE);
    useNotificationPreferences.getState().setEmail(false);

    expect(useNotificationPreferences.getState().email).toBe(false);
    expect(useNotificationPreferences.getState().ownerKey).toBe(
      `TESTNET:${ALICE}`,
    );
  });

  it("refuses to apply a server payload with no connected wallet", () => {
    startSessionAs(ALICE);
    __resetSessionForTests();
    expectBoundary(
      () =>
        useNotificationPreferences
          .getState()
          .applyFromServer(VALID_PAYLOAD, "nonce-1"),
      "DISCONNECTED_WALLET",
    );
    expect(useNotificationPreferences.getState().lastNonce).toBeNull();
  });

  it("refuses a server payload without a nonce", () => {
    startSessionAs(ALICE);
    expectBoundary(
      () =>
        useNotificationPreferences
          .getState()
          .applyFromServer(VALID_PAYLOAD, ""),
      "TAMPERED_INPUT",
    );
  });

  it("refuses to replay an already-applied nonce", () => {
    startSessionAs(ALICE);

    useNotificationPreferences
      .getState()
      .applyFromServer(VALID_PAYLOAD, "nonce-1");

    expectBoundary(
      () =>
        useNotificationPreferences
          .getState()
          .applyFromServer(VALID_PAYLOAD, "nonce-1"),
      "REPLAY",
    );
    // the first application is preserved, not clobbered by the rejected replay
    expect(useNotificationPreferences.getState().lastNonce).toBe("nonce-1");
  });

  it("rejects a malformed server payload before touching the wallet", () => {
    startSessionAs(ALICE);
    expectBoundary(
      () => useNotificationPreferences.getState().applyFromServer(null, "n-1"),
      "MALFORMED_RESPONSE",
    );
    expectBoundary(
      () =>
        useNotificationPreferences
          .getState()
          .applyFromServer({ email: "yes" }, "n-2"),
      "MALFORMED_RESPONSE",
    );
  });
});

describe("notification preferences — input validation (re-exported by Store)", () => {
  beforeEach(() => {
    // Deterministic owner so the ownership gate can never mask a schema error.
    startSessionAs(ALICE);
  });

  afterEach(() => {
    __resetSessionForTests();
    localStorage.clear();
  });

  it("accepts a fully valid payload", () => {
    expect(sanitizePreferenceFields(VALID_PAYLOAD)).toEqual(VALID_PAYLOAD);
  });

  it.each([
    ["null", null],
    ["a string", "nope"],
    ["an array", []],
    ["a missing email", { push: true, frequency: "1", quietHours: "12:00" }],
    ["a non-boolean email", { ...VALID_PAYLOAD, email: "true" }],
    ["a non-boolean push", { ...VALID_PAYLOAD, push: 1 }],
    ["an out-of-range frequency", { ...VALID_PAYLOAD, frequency: "9" }],
    ["an empty frequency", { ...VALID_PAYLOAD, frequency: "" }],
    ["a malformed quiet hour", { ...VALID_PAYLOAD, quietHours: "25:99" }],
    ["a non-string quiet hour", { ...VALID_PAYLOAD, quietHours: 1200 }],
  ])("rejects %s", (_label, input) => {
    expect(sanitizePreferenceFields(input)).toBeNull();
  });

  it("rejects an out-of-range frequency through the store gate", () => {
    expectBoundary(
      () => useNotificationPreferences.getState().setFrequency("99"),
      "TAMPERED_INPUT",
    );
    expect(useNotificationPreferences.getState().frequency).toBe("1");
  });

  it("rejects a malformed quiet hour through the store gate", () => {
    expectBoundary(
      () => useNotificationPreferences.getState().setQuietHours("99:99"),
      "TAMPERED_INPUT",
    );
    expect(useNotificationPreferences.getState().quietHours).toBe("12:00");
  });

  /**
   * Regression: the validate middleware wraps the `set` handed to the store
   * creator, so a write issued through the public `setState` handle used to
   * reach state without passing the gate. The gate now wraps both.
   */
  it("blocks an unknown key injected through setState", () => {
    expectBoundary(
      () =>
        useNotificationPreferences.setState({
          evil: true,
        } as unknown as SetStateArg),
      "TAMPERED_INPUT",
    );
    expect(
      useNotificationPreferences.getState(),
    ).not.toHaveProperty("evil");
  });

  it("blocks a wrong-typed value injected through setState", () => {
    expectBoundary(
      () =>
        useNotificationPreferences.setState({
          frequency: 1,
        } as unknown as SetStateArg),
      "TAMPERED_INPUT",
    );
    expect(useNotificationPreferences.getState().frequency).toBe("1");
  });
});
