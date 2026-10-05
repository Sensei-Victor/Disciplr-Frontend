/**
 * vaultState.test.ts
 *
 * Unit tests for the authorization and hostile-input boundary behind the
 * milestone tracker and fund-release state.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeMilestones,
  buildFundReleaseView,
  detectSettlementAnomalies,
  evalVaultActionAuth,
  isFiniteAmount,
  isMilestoneStatus,
  isNonEmptyString,
  isPlausibleStellarAddress,
  isPositiveAmount,
  isVaultAction,
  isVaultStatus,
  isValidCurrency,
  isValidIsoTimestamp,
  isValidTxHash,
  isValidVaultRouteId,
  lookupVaultSafe,
  validateVaultResponse,
  type VaultAction,
} from "../vaultState";
import { describe as describeAuth, expect as expectAuth, it as itAuth } from "vitest";
import { MASTER_VAULTS } from "../../fixtures/vaults";
import type { Milestone, Vault } from "../../types/vault";

const ACTOR = "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L";
const VERIFIER = "GVERIF3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK";
const STRANGER = "GSTRANG3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK";
const SUCCESS_DEST = "GSUCC3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK";
const FAILURE_DEST = "GFAIL3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK";
const CONTRACT = "GCONT3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK";

function makeVault(overrides: Partial<Vault> = {}): Vault {
  const base: Vault = {
    id: "1",
    name: "Alpha Vault",
    status: "active",
    amount: 12500,
    currency: "USDC",
    createdAt: "2026-01-01T00:00:00.000Z",
    deadline: "2026-06-01T00:00:00.000Z",
    creatorAddress: ACTOR,
    verifierAddress: VERIFIER,
    successAddress: SUCCESS_DEST,
    failureAddress: FAILURE_DEST,
    contractAddress: CONTRACT,
    milestones: [
      {
        id: "m1",
        title: "Phase 1",
        description: "First phase",
        criteria: "Done",
        status: "validated",
        validatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        id: "m2",
        title: "Phase 2",
        description: "Second phase",
        criteria: "Pending",
        status: "pending",
      },
    ],
    transactions: [
      {
        id: "tx1",
        type: "create",
        hash: "a3f9d1c8e2b74056af3d9c1b2e8f0a4d",
        timestamp: "2026-01-01T00:00:00.000Z",
        amount: 12500,
      },
    ],
  };
  return { ...base, ...overrides };
}

// ── Route parameters ──────────────────────────────────────────────────────────

describe("isValidVaultRouteId", () => {
  it("accepts normal vault ids", () => {
    expect(isValidVaultRouteId("1")).toBe(true);
    expect(isValidVaultRouteId("abc-123_DEF")).toBe(true);
    expect(isValidVaultRouteId("GCONT3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK")).toBe(true);
  });

  it("rejects non-strings, empty strings, and whitespace", () => {
    expect(isValidVaultRouteId(undefined)).toBe(false);
    expect(isValidVaultRouteId(null)).toBe(false);
    expect(isValidVaultRouteId(42)).toBe(false);
    expect(isValidVaultRouteId("")).toBe(false);
    expect(isValidVaultRouteId("   ")).toBe(false);
  });

  it("rejects control characters and URL-hostile characters", () => {
    expect(isValidVaultRouteId("a b")).toBe(false);
    expect(isValidVaultRouteId("a\tb")).toBe(false);
    expect(isValidVaultRouteId("a/b")).toBe(false);
    expect(isValidVaultRouteId("a?b")).toBe(false);
    expect(isValidVaultRouteId("a\"b")).toBe(false);
    expect(isValidVaultRouteId("<script>")).toBe(false);
  });

  it("rejects over-long ids", () => {
    expect(isValidVaultRouteId("x".repeat(65))).toBe(false);
    expect(isValidVaultRouteId("x".repeat(64))).toBe(true);
  });

  it("rejects reserved object keys that could shadow prototype members", () => {
    for (const key of ["__proto__", "constructor", "prototype", "hasOwnProperty", "toString"]) {
      expect(isValidVaultRouteId(key)).toBe(false);
    }
  });
});

describe("lookupVaultSafe", () => {
  const store = { a: 1, b: 2 };

  it("returns the value for an own key", () => {
    expect(lookupVaultSafe(store, "a")).toBe(1);
  });

  it("returns undefined for unknown keys", () => {
    expect(lookupVaultSafe(store, "zzz")).toBeUndefined();
  });

  it("never returns Object.prototype members for hostile keys", () => {
    expect(lookupVaultSafe(store, "__proto__")).toBeUndefined();
    expect(lookupVaultSafe(store, "constructor")).toBeUndefined();
    expect(lookupVaultSafe(store, "toString")).toBeUndefined();
  });

  it("rejects non-string and missing ids", () => {
    expect(lookupVaultSafe(store, undefined)).toBeUndefined();
    expect(lookupVaultSafe(store, 5 as never)).toBeUndefined();
  });
});

// ── Scalar validators ─────────────────────────────────────────────────────────

describe("scalar validators", () => {
  it("isPositiveAmount accepts finite positive numbers only", () => {
    expect(isPositiveAmount(0.01)).toBe(true);
    expect(isPositiveAmount(12500)).toBe(true);
    expect(isPositiveAmount(0)).toBe(false);
    expect(isPositiveAmount(-5)).toBe(false);
    expect(isPositiveAmount(NaN)).toBe(false);
    expect(isPositiveAmount(Infinity)).toBe(false);
    expect(isPositiveAmount("12500")).toBe(false);
  });

  it("isFiniteAmount accepts zero and positive numbers", () => {
    expect(isFiniteAmount(0)).toBe(true);
    expect(isFiniteAmount(4.5)).toBe(true);
    expect(isFiniteAmount(-1)).toBe(false);
    expect(isFiniteAmount(NaN)).toBe(false);
    expect(isFiniteAmount(Infinity)).toBe(false);
  });

  it("isValidCurrency enforces the display charset", () => {
    expect(isValidCurrency("USDC")).toBe(true);
    expect(isValidCurrency("XLM")).toBe(true);
    expect(isValidCurrency("usdc")).toBe(true);
    expect(isValidCurrency("")).toBe(false);
    expect(isValidCurrency("USDC 1")).toBe(false);
    expect(isValidCurrency("A VERY LONG CURRENCY NAME")).toBe(false);
    expect(isValidCurrency("US$")).toBe(false);
  });

  it("isValidTxHash enforces a URL-safe hash shape", () => {
    expect(isValidTxHash("a3f9d1c8e2b74056af3d9c1b2e8f0a4d")).toBe(true);
    expect(isValidTxHash("short")).toBe(false);
    expect(isValidTxHash("with space hash")).toBe(false);
    expect(isValidTxHash("hash\nwith\nnewline")).toBe(false);
    expect(isValidTxHash("../../../etc/passwd")).toBe(false);
    expect(isValidTxHash("javascript:alert(1)")).toBe(false);
    expect(isValidTxHash("<script>")).toBe(false);
    expect(isValidTxHash("x".repeat(65))).toBe(false);
    expect(isValidTxHash(123)).toBe(false);
  });

  it("isValidIsoTimestamp parses real dates and rejects garbage", () => {
    expect(isValidIsoTimestamp("2026-01-01T00:00:00.000Z")).toBe(true);
    expect(isValidIsoTimestamp("2026-01-01")).toBe(true);
    expect(isValidIsoTimestamp("not a date")).toBe(false);
    expect(isValidIsoTimestamp("")).toBe(false);
    expect(isValidIsoTimestamp("   ")).toBe(false);
    expect(isValidIsoTimestamp(1700000000000)).toBe(false);
  });

  it("isNonEmptyString rejects empty and non-strings", () => {
    expect(isNonEmptyString("ok")).toBe(true);
    expect(isNonEmptyString("  trimmed  ")).toBe(true);
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });

  it("plausible address check accepts real and fixture-shaped keys, rejects hostile values", () => {
    expect(isPlausibleStellarAddress(ACTOR)).toBe(true);
    expect(isPlausibleStellarAddress(SUCCESS_DEST)).toBe(true);
    expect(isPlausibleStellarAddress(CONTRACT)).toBe(true);
    expect(isPlausibleStellarAddress("G" + "A".repeat(55))).toBe(true);
    expect(isPlausibleStellarAddress("G" + "A".repeat(30))).toBe(false);
    expect(isPlausibleStellarAddress("G" + "A".repeat(72))).toBe(false);
    expect(isPlausibleStellarAddress("B" + "A".repeat(55))).toBe(false);
    expect(isPlausibleStellarAddress("G" + "0".repeat(55))).toBe(false);
    expect(isPlausibleStellarAddress("https://evil.example")).toBe(false);
    expect(isPlausibleStellarAddress("")).toBe(false);
    expect(isPlausibleStellarAddress(42)).toBe(false);
  });

  it("status and action type guards accept members and reject others", () => {
    expect(isVaultStatus("completed")).toBe(true);
    expect(isVaultStatus("active")).toBe(true);
    expect(isVaultStatus("expired")).toBe(false);
    expect(isMilestoneStatus("validated")).toBe(true);
    expect(isMilestoneStatus("pending")).toBe(true);
    expect(isMilestoneStatus("done")).toBe(false);
    expect(isVaultAction("cancel_vault")).toBe(true);
    expect(isVaultAction("validate_milestone")).toBe(true);
    expect(isVaultAction("destroy_all_funds")).toBe(false);
  });
});

// ── Server response validation ────────────────────────────────────────────────

describe("validateVaultResponse", () => {
  it("accepts a well-formed vault", () => {
    const result = validateVaultResponse(makeVault());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vault.id).toBe("1");
    }
  });

  it("rejects non-object responses", () => {
    for (const bad of [null, undefined, 42, "vault", [], true]) {
      expect(validateVaultResponse(bad).ok).toBe(false);
    }
  });

  it("collects multiple structural issues in one pass", () => {
    const result = validateVaultResponse({
      ...makeVault(),
      id: "",
      name: "",
      status: "expired",
      amount: -1,
      currency: "US$",
      createdAt: "nope",
      deadline: "nope",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThanOrEqual(6);
      expect(result.issues.join(" ")).toMatch(/id|name|status|amount|currency|createdAt|deadline/);
    }
  });

  it("rejects a deadline that is not after the creation date", () => {
    const notOk = validateVaultResponse(
      makeVault({
        createdAt: "2026-06-01T00:00:00.000Z",
        deadline: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(notOk.ok).toBe(false);
    if (!notOk.ok) {
      expect(notOk.issues.join(" ")).toMatch(/after its creation date/);
    }
  });

  it("rejects implausible addresses in a vault record", () => {
    const notOk = validateVaultResponse(
      makeVault({
        creatorAddress: "https://evil.example",
        successAddress: "",
        failureAddress: "<img onerror=1>",
        contractAddress: "not-an-address",
      }),
    );
    expect(notOk.ok).toBe(false);
    if (!notOk.ok) {
      expect(notOk.issues.filter((i) => i.includes("address")).length).toBe(4);
    }
  });

  it("accepts a missing or empty verifier address but rejects an invalid one", () => {
    const noVerifier = makeVault();
    delete noVerifier.verifierAddress;
    expect(validateVaultResponse(noVerifier).ok).toBe(true);

    expect(validateVaultResponse(makeVault({ verifierAddress: "" })).ok).toBe(true);

    const invalid = validateVaultResponse(makeVault({ verifierAddress: "X".repeat(99) }));
    expect(invalid.ok).toBe(false);
  });

  it("rejects non-array milestones and transactions", () => {
    expect(validateVaultResponse(makeVault({ milestones: {} as never })).ok).toBe(false);
    expect(validateVaultResponse(makeVault({ transactions: "x" as never })).ok).toBe(false);
  });

  it("rejects malformed milestones at every field", () => {
    const result = validateVaultResponse({
      ...makeVault(),
      milestones: [
        { id: "m1", title: "T", description: "D", criteria: "C", status: "pending" },
        { id: "m1", title: "", description: "", criteria: "", status: "ordered" },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.issues.join(" ");
      expect(text).toMatch(/duplicated/);
      expect(text).toMatch(/title|description|criteria|status/);
    }
  });

  it("rejects malformed transactions at every field", () => {
    const result = validateVaultResponse({
      ...makeVault(),
      transactions: [
        {
          id: "",
          type: "transfer",
          hash: "not a hash",
          timestamp: "whenever",
          amount: Infinity,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.issues.join(" ");
      expect(text).toMatch(/transaction/i);
    }
  });

  it("rejects duplicate transaction ids", () => {
    const result = validateVaultResponse(
      makeVault({
        transactions: [
          {
            id: "tx1",
            type: "create",
            hash: "a3f9d1c8e2b74056af3d9c1b2e8f0a4d",
            timestamp: "2026-01-01T00:00:00.000Z",
            amount: 12500,
          },
          {
            id: "tx1",
            type: "release",
            hash: "b4f9d1c8e2b74056af3d9c1b2e8f0a4d",
            timestamp: "2026-01-02T00:00:00.000Z",
            amount: 100,
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(" ")).toMatch(/duplicated/i);
    }
  });

  it("rejects a vault whose amount is not a positive finite number", () => {
    for (const amount of [0, -1, NaN, Infinity]) {
      expect(validateVaultResponse(makeVault({ amount })).ok).toBe(false);
    }
  });

  it("rejects a vault with an empty milestone list", () => {
    expect(validateVaultResponse(makeVault({ milestones: [] })).ok).toBe(false);
  });

  it("is deterministic across repeated validation of the same input", () => {
    const vault = makeVault();
    const first = validateVaultResponse(vault);
    const second = validateVaultResponse(vault);
    expect(first.ok).toBe(second.ok);
    if (!first.ok && !second.ok) {
      expect(first.issues).toEqual(second.issues);
    }
  });

  it("does not mutate the input vault during validation", () => {
    const vault = makeVault();
    const snapshot = JSON.stringify(vault);
    validateVaultResponse(vault);
    expect(JSON.stringify(vault)).toBe(snapshot);
  });

  it("accepts fixture vaults from MASTER_VAULTS", () => {
    for (const vault of MASTER_VAULTS) {
      const result = validateVaultResponse(vault);
      expect(result.ok).toBe(true);
    }
  });
});

// ── Authorization ─────────────────────────────────────────────────────────────

describeAuth("evalVaultActionAuth", () => {
  const vault = makeVault();

  itAuth("allows the creator to cancel an active vault", () => {
    const decision = evalVaultActionAuth(vault, "cancel_vault", ACTOR);
    expectAuth(decision.allowed).toBe(true);
  });

  itAuth("rejects a stranger attempting to cancel", () => {
    const decision = evalVaultActionAuth(vault, "cancel_vault", STRANGER);
    expectAuth(decision.allowed).toBe(false);
  });

  itAuth("allows the verifier to validate a pending milestone", () => {
    const decision = evalVaultActionAuth(vault, "validate_milestone", VERIFIER);
    expectAuth(decision.allowed).toBe(true);
  });

  itAuth("rejects the creator attempting to validate a milestone", () => {
    const decision = evalVaultActionAuth(vault, "validate_milestone", ACTOR);
    expectAuth(decision.allowed).toBe(false);
  });

  itAuth("rejects unknown actions", () => {
    const decision = evalVaultActionAuth(vault, "destroy_all_funds" as VaultAction, ACTOR);
    expectAuth(decision.allowed).toBe(false);
  });

  itAuth("rejects missing or malformed actor addresses", () => {
    expectAuth(evalVaultActionAuth(vault, "cancel_vault", "").allowed).toBe(false);
    expectAuth(evalVaultActionAuth(vault, "cancel_vault", "not-an-address").allowed).toBe(false);
    expectAuth(evalVaultActionAuth(vault, "cancel_vault", undefined as never).allowed).toBe(false);
  });

  itAuth("is deterministic for repeated identical calls", () => {
    const a = evalVaultActionAuth(vault, "cancel_vault", ACTOR);
    const b = evalVaultActionAuth(vault, "cancel_vault", ACTOR);
    expectAuth(a.allowed).toBe(b.allowed);
  });
});

// ── Milestone analysis ────────────────────────────────────────────────────────

describe("analyzeMilestones", () => {
  it("counts validated and pending milestones deterministically", () => {
    const summary = analyzeMilestones(makeVault().milestones);
    expect(summary.validated).toBe(1);
    expect(summary.pending).toBe(1);
  });

  it("handles an empty milestone list", () => {
    const summary = analyzeMilestones([]);
    expect(summary.validated).toBe(0);
    expect(summary.pending).toBe(0);
  });

  it("ignores malformed milestone entries without throwing", () => {
    const summary = analyzeMilestones([
      { id: "m1", status: "validated" } as Milestone,
      null as never,
      undefined as never,
    ]);
    expect(summary.validated).toBe(1);
  });
});

// ── Fund release view ─────────────────────────────────────────────────────────

describe("buildFundReleaseView", () => {
  it("produces a deterministic view for a valid vault", () => {
    const view = buildFundReleaseView(makeVault());
    expect(view).toBeDefined();
    expect(view.vaultId).toBe("1");
  });

  it("does not release funds when milestones are incomplete", () => {
    const view = buildFundReleaseView(makeVault());
    expect(view.releasable).toBe(false);
  });

  it("is stable across repeated invocations", () => {
    const vault = makeVault();
    expect(buildFundReleaseView(vault)).toEqual(buildFundReleaseView(vault));
  });
});

// ── Settlement anomalies ──────────────────────────────────────────────────────

describe("detectSettlementAnomalies", () => {
  it("returns no anomalies for a clean vault", () => {
    expect(detectSettlementAnomalies(makeVault())).toEqual([]);
  });

  it("flags a vault whose deadline precedes creation", () => {
    const anomalies = detectSettlementAnomalies(
      makeVault({
        createdAt: "2026-06-01T00:00:00.000Z",
        deadline: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(anomalies.length).toBeGreaterThan(0);
  });

  it("is deterministic across repeated calls", () => {
    const vault = makeVault();
    expect(detectSettlementAnomalies(vault)).toEqual(detectSettlementAnomalies(vault));
  });
});

// ── Regression: hostile inputs never throw ────────────────────────────────────

describe("hostile input regression", () => {
  it("validators never throw on hostile values", () => {
    const hostile = [undefined, null, 0, -1, NaN, Infinity, "", "   ", "__proto__", {}, []];
    for (const value of hostile) {
      expect(() => isPositiveAmount(value as never)).not.toThrow();
      expect(() => isFiniteAmount(value as never)).not.toThrow();
      expect(() => isValidCurrency(value as never)).not.toThrow();
      expect(() => isValidTxHash(value as never)).not.toThrow();
      expect(() => isValidIsoTimestamp(value as never)).not.toThrow();
      expect(() => isNonEmptyString(value as never)).not.toThrow();
      expect(() => isPlausibleStellarAddress(value as never)).not.toThrow();
      expect(() => isVaultStatus(value as never)).not.toThrow();
      expect(() => isMilestoneStatus(value as never)).not.toThrow();
      expect(() => isVaultAction(value as never)).not.toThrow();
      expect(() => isValidVaultRouteId(value as never)).not.toThrow();
    }
  });

  it("validateVaultResponse never throws on hostile values", () => {
    const hostile = [undefined, null, 0, -1, NaN, Infinity, "", "   ", "__proto__", {}, []];
    for (const value of hostile) {
      expect(() => validateVaultResponse(value as never)).not.toThrow();
      expect(validateVaultResponse(value as never).ok).toBe(false);
    }
  });

  it("lookupVaultSafe never throws on hostile keys", () => {
    const store = { a: 1 };
    for (const key of [undefined, null, 0, {}, [], "__proto__", "constructor"]) {
      expect(() => lookupVaultSafe(store, key as never)).not.toThrow();
    }
  });

  it("accepts every fixture vault so the app's own data is never mislabeled", () => {
    for (const vault of Object.values(MASTER_VAULTS)) {
      const result = validateVaultResponse(vault);
      expect(result.ok).toBe(true);
    }
  });
});

// ── Milestone analysis ────────────────────────────────────────────────────────

const pendingMilestone: Milestone = { id: "m2", title: "T", description: "D", criteria: "C", status: "pending" };
const validatedMilestone: Milestone = {
  id: "m1",
  title: "T",
  description: "D",
  criteria: "C",
  status: "validated",
  validatedAt: "2026-02-01T00:00:00.000Z",
};

describe("analyzeMilestones", () => {
  it("finds the first pending milestone as current", () => {
    const { currentIndex, anomalies } = analyzeMilestones([validatedMilestone, pendingMilestone]);
    expect(currentIndex).toBe(1);
    expect(anomalies).toEqual([]);
  });

  it("returns -1 when no milestone is pending", () => {
    const { currentIndex } = analyzeMilestones([validatedMilestone, { ...pendingMilestone, status: "failed" }]);
    expect(currentIndex).toBe(-1);
  });

  it("handles an empty list", () => {
    const { currentIndex, anomalies } = analyzeMilestones([]);
    expect(currentIndex).toBe(-1);
    expect(anomalies).toEqual([]);
  });

  it("flags duplicate milestone ids", () => {
    const { anomalies } = analyzeMilestones([validatedMilestone, { ...pendingMilestone, id: "m1" }]);
    expect(anomalies.some((a) => a.kind === "duplicate-id")).toBe(true);
  });

  it("flags milestones with a missing id", () => {
    const { anomalies } = analyzeMilestones([{ ...pendingMilestone, id: "" } as Milestone]);
    expect(anomalies.some((a) => a.kind === "missing-id")).toBe(true);
  });

  it("flags milestones with an unknown status", () => {
    const { anomalies } = analyzeMilestones([
      { ...pendingMilestone, status: "delivered", id: "m9" } as unknown as Milestone,
    ]);
    expect(anomalies.some((a) => a.kind === "unknown-status")).toBe(true);
  });

  it("flags impossible transitions where a later milestone is validated before the current one", () => {
    const { anomalies, currentIndex } = analyzeMilestones([
      validatedMilestone,
      pendingMilestone,
      { ...pendingMilestone, id: "m3", status: "validated", validatedAt: "2026-03-01T00:00:00.000Z" },
    ]);
    expect(currentIndex).toBe(1);
    expect(anomalies.some((a) => a.kind === "impossible-order")).toBe(true);
  });

  it("does not treat a failed milestone after the pending step as an ordering anomaly", () => {
    const { anomalies } = analyzeMilestones([
      validatedMilestone,
      pendingMilestone,
      { ...pendingMilestone, id: "m3", status: "failed" },
    ]);
    expect(anomalies.some((a) => a.kind === "impossible-order")).toBe(false);
  });

  it("does not flag resolved milestones before the current step", () => {
    const { anomalies } = analyzeMilestones([validatedMilestone, pendingMilestone]);
    expect(anomalies.some((a) => a.kind === "impossible-order")).toBe(false);
  });

  it("flags a validation timestamp on a non-validated milestone", () => {
    const { anomalies } = analyzeMilestones([
      { ...pendingMilestone, validatedAt: "2026-03-01T00:00:00.000Z" },
    ]);
    expect(anomalies.some((a) => a.kind === "stale-validated-at")).toBe(true);
  });

  it("does not flag a validated milestone that legitimately has a timestamp", () => {
    const { anomalies } = analyzeMilestones([validatedMilestone]);
    expect(anomalies.some((a) => a.kind === "stale-validated-at")).toBe(false);
  });

  it("does not crash on non-object milestone entries", () => {
    const { anomalies } = analyzeMilestones([validatedMilestone, null, "junk"] as unknown as Milestone[]);
    expect(anomalies.some((a) => a.kind === "unknown-status")).toBe(true);
  });
});

// ── Settlement anomalies ───────────────────────────────────────────────────────

describe("detectSettlementAnomalies", () => {
  it("flags a completed vault with no release transaction", () => {
    const vault = makeVault({ status: "completed" });
    const anomalies = detectSettlementAnomalies(vault);
    expect(anomalies.some((a) => a.includes("no release transaction"))).toBe(true);
  });

  it("flags a failed or cancelled vault with no redirect transaction", () => {
    const failed = detectSettlementAnomalies(makeVault({ status: "failed" }));
    expect(failed.some((a) => a.includes("no redirect transaction"))).toBe(true);

    const cancelled = detectSettlementAnomalies(makeVault({ status: "cancelled" }));
    expect(cancelled.some((a) => a.includes("no redirect transaction"))).toBe(true);
  });

  it("flags a settled amount that does not match the vault principal", () => {
    const vault = makeVault({
      status: "completed",
      amount: 100,
      transactions: [
        { id: "tx1", type: "create", hash: "a3f9d1c8e2b74056af3d9c1b2e8f0a4d", timestamp: "2026-01-01T00:00:00.000Z", amount: 100 },
        { id: "tx2", type: "release", hash: "b3f9d1c8e2b74056af3d9c1b2e8f0a4d", timestamp: "2026-02-01T00:00:00.000Z", amount: 50 },
      ],
    });
    const anomalies = detectSettlementAnomalies(vault);
    expect(anomalies.some((a) => a.includes("does not match the vault principal"))).toBe(true);
  });

  it("returns no anomalies for a consistent completed vault", () => {
    const vault = makeVault({
      status: "completed",
      transactions: [
        { id: "tx1", type: "create", hash: "a3f9d1c8e2b74056af3d9c1b2e8f0a4d", timestamp: "2026-01-01T00:00:00.000Z", amount: 12500 },
        { id: "tx2", type: "release", hash: "b3f9d1c8e2b74056af3d9c1b2e8f0a4d", timestamp: "2026-02-01T00:00:00.000Z", amount: 12500 },
      ],
    });
    expect(detectSettlementAnomalies(vault)).toEqual([]);
  });

  it("returns no anomalies for an active vault", () => {
    expect(detectSettlementAnomalies(makeVault())).toEqual([]);
  });
});

// ── Fund-release view building ────────────────────────────────────────────────

describe("buildFundReleaseView", () => {
  it("builds a released view from a completed vault using the release amount", () => {
    const view = buildFundReleaseView(
      makeVault({
        status: "completed",
        transactions: [
          { id: "tx1", type: "create", hash: "a".repeat(32), timestamp: "2026-01-01T00:00:00.000Z", amount: 12500 },
          { id: "tx2", type: "release", hash: "b".repeat(32), timestamp: "2026-02-01T00:00:00.000Z", amount: 12500 },
        ],
      }),
    );
    expect(view.outcome).toBe("released");
    expect(view.destinationAddress).toBe(SUCCESS_DEST);
    expect(view.amount).toBe(12500);
    expect(view.transaction?.hash).toBe("b".repeat(32));
  });

  it("falls back to the vault principal when the release transaction has no amount", () => {
    const view = buildFundReleaseView(
      makeVault({
        status: "completed",
        transactions: [
          { id: "tx1", type: "create", hash: "a".repeat(32), timestamp: "2026-01-01T00:00:00.000Z", amount: 12500 },
          { id: "tx2", type: "release", hash: "b".repeat(32), timestamp: "2026-02-01T00:00:00.000Z" },
        ],
      }),
    );
    expect(view.amount).toBe(12500);
  });

  it("builds a redirected view for failed and cancelled vaults", () => {
    for (const status of ["failed", "cancelled"] as const) {
      const view = buildFundReleaseView(makeVault({ status }));
      expect(view.outcome).toBe("redirected");
      expect(view.destinationAddress).toBe(FAILURE_DEST);
    }
  });

  it("builds a pending view for an active vault", () => {
    const view = buildFundReleaseView(makeVault());
    expect(view.outcome).toBe("pending");
    expect(view.amount).toBe(12500);
    expect(view.transaction).toBeUndefined();
  });
});

// ── Authorization boundary ────────────────────────────────────────────────────

describe("evalVaultActionAuth", () => {
  const baseInput = {
    vault: makeVault(),
    walletAddress: ACTOR as string | null | undefined,
    walletNetwork: "TESTNET" as const,
    expectedNetwork: "TESTNET" as const,
  };

  it("allows the creator to validate, extend, and cancel an active vault", () => {
    for (const action of ["validate_milestone", "extend_deadline", "cancel_vault"] as VaultAction[]) {
      const input =
        action === "validate_milestone"
          ? { ...baseInput, vault: makeVault({ status: "pending_validation" }) }
          : baseInput;
      const result = evalVaultActionAuth({ ...input, action });
      expect(result.allowed).toBe(true);
      expect(result.reasons).toEqual([]);
    }
  });

  it("allows the verifier to validate a pending milestone", () => {
    const result = evalVaultActionAuth({
      ...baseInput,
      action: "validate_milestone",
      walletAddress: VERIFIER,
      vault: makeVault({ status: "pending_validation" }),
    });
    expect(result.allowed).toBe(true);
  });

  it("denies when the wallet is not an actor on the vault", () => {
    const result = evalVaultActionAuth({
      ...baseInput,
      action: "extend_deadline",
      walletAddress: STRANGER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("not authorized"))).toBe(true);
  });

  it("denies when the wallet is disconnected", () => {
    for (const address of [undefined, null, ""]) {
      const result = evalVaultActionAuth({ ...baseInput, action: "cancel_vault", walletAddress: address });
      expect(result.allowed).toBe(false);
      expect(result.reasons.some((r) => r.includes("Connect your wallet"))).toBe(true);
    }
  });

  it("denies a structurally invalid wallet address", () => {
    const result = evalVaultActionAuth({
      ...baseInput,
      action: "cancel_vault",
      walletAddress: "https://evil.example",
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("invalid"))).toBe(true);
  });

  it("denies when the wallet network mismatches the expected network", () => {
    const result = evalVaultActionAuth({
      ...baseInput,
      action: "cancel_vault",
      walletNetwork: "PUBLIC",
      expectedNetwork: "TESTNET",
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("wrong network"))).toBe(true);
  });

  it("does not flag a network mismatch when there is none or the wallet is disconnected", () => {
    const matches = evalVaultActionAuth({ ...baseInput, action: "cancel_vault", walletNetwork: "TESTNET", expectedNetwork: "TESTNET" });
    expect(matches.reasons.some((r) => r.includes("wrong network"))).toBe(false);

    const publicMatch = evalVaultActionAuth({
      ...baseInput,
      action: "cancel_vault",
      walletAddress: ACTOR,
      walletNetwork: "PUBLIC",
      expectedNetwork: "PUBLIC",
    });
    expect(publicMatch.allowed).toBe(true);
  });

  it("denies actions on settled vaults", () => {
    const result = evalVaultActionAuth({
      ...baseInput,
      action: "cancel_vault",
      vault: makeVault({ status: "completed" }),
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("already settled"))).toBe(true);
  });

  it("denies validate milestone when nothing is pending validation", () => {
    const result = evalVaultActionAuth({ ...baseInput, action: "validate_milestone", vault: makeVault({ status: "active" }) });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some((r) => r.includes("No milestone is currently pending"))).toBe(true);
  });
});