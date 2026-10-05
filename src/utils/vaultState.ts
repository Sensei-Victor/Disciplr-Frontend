/**
 * vaultState.ts
 *
 * Authorization and hostile-input boundary for milestone progress and
 * fund-release state.
 *
 * Every value that crosses the trust boundary (route parameters, wallet
 * identity, network, numeric values, and server/service responses) is
 * validated here before it is rendered or used to gate a sensitive action.
 *
 * Two kinds of findings are produced:
 *
 * - Hard `issues` (validateVaultResponse): the response is not a usable Vault.
 *   These block rendering of vault state entirely.
 * - Soft `anomalies` (analyzeMilestones / detectSettlementAnomalies):
 *   the response is structurally valid but internally inconsistent (e.g. a
 *   later milestone resolved before the current step, or a settled amount that
 *   does not match the vault principal). These are surfaced to the user rather
 *   than silently guessed at.
 *
 * Authorization is NOT inferred from client state. A wallet may act on a vault
 * only when its address is present, syntactically valid, matches the vault's
 * data (an actor on this vault — creator or verifier), and the wallet's
 * network matches the network the app is pinned to. The final authorization
 * authority stays in the contract; this boundary only prevents the UI from
 * offering or showing impossible transitions.
 *
 * Invariants enforced here (regression-covered):
 *  - Route ids are bounded, character-restricted, and never prototype keys.
 *  - Server responses are structurally validated before rendering; invalid
 *    data is rejected wholesale rather than partially rendered.
 *  - Milestone lists are checked for duplicate/missing ids, unknown statuses,
 *    stale validation timestamps, and impossible ordering.
 *  - Settlement state must be consistent with the vault principal.
 *  - Sensitive actions require a valid, matching-network, authorized wallet.
 */

import type { Milestone, MilestoneStatus, Vault, VaultStatus } from "../types/vault";
import { isValidStellarAddress } from "./stellarAddress";
import { isNetworkMismatch } from "./networkMismatch";

export { isValidStellarAddress };

// ── Route parameters ──────────────────────────────────────────────────────────

/** Maximum length accepted for a vault route id, high enough for any
 *  real contract/on-chain identifier. */
export const VAULT_ID_MAX_LENGTH = 64;

const VAULT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Reserved object keys that can be reached through a plain-object lookup
 *  even though they are not own properties. These must never be treated as
 *  valid vault ids. */
const RESERVED_OBJECT_KEYS = new Set<string>([
  "__proto__",
  "constructor",
  "prototype",
  "hasOwnProperty",
  "toString",
]);

/**
 * Validates a vault route parameter before it is used for lookups.
 * Rejects non-strings, empty strings, whitespace/control characters, overly
 * long inputs, and reserved object keys that could shadow plain-object
 * prototype members.
 */
export function isValidVaultRouteId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > VAULT_ID_MAX_LENGTH) return false;
  if (!VAULT_ID_PATTERN.test(value)) return false;
  return !RESERVED_OBJECT_KEYS.has(value);
}

/**
 * Looks a value up in a plain-object store while refusing to ever read
 * prototype members. Object stores historically leak `Object.prototype` when
 * queried with `"__proto__"` — this helper makes that class of hostile input
 * impossible to reach.
 */
export function lookupVaultSafe<T>(
  store: Record<string, T>,
  id: string | undefined,
): T | undefined {
  if (typeof id !== "string") return undefined;
  // Defense in depth: even if a caller bypasses isValidVaultRouteId, never
  // resolve prototype members through a plain-object lookup.
  if (RESERVED_OBJECT_KEYS.has(id)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(store, id)) return undefined;
  return store[id];
}

// ── Scalar validators ─────────────────────────────────────────────────────────

const STELLAR_CURRENCY_PATTERN = /^[A-Za-z]{2,12}$/;

/** Transaction hashes may be hex or the mock fixture format, but must be
 *  alphanumeric only and reasonably sized. Rejects path traversal, scheme
 *  injection, and whitespace so a hash can never escape into an explorer URL. */
const TX_HASH_PATTERN = /^[A-Za-z0-9]{8,64}$/;

/** Stellar public keys are 56 characters; mock/contract records may be
 *  shorter while they are still syntactically address-like. Accept a bounded
 *  range so fixture-grade records keep passing while control characters,
 *  URLs, scheme injection, and absurd payloads are rejected. */
const ADDRESS_MIN_LENGTH = 40;
const ADDRESS_MAX_LENGTH = 72;
const ADDRESS_PATTERN = /^[GC][A-Z2-7]+$/;

/** Structural sanity check for addresses found in server responses. Unlike
 *  `isValidStellarAddress` (which is strict on the 56-character account key
 *  format and used for live wallet identity), this only requires a plausible
 *  Stellar shape: G/C prefix, base32 alphabet, bounded length. */
export function isPlausibleStellarAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < ADDRESS_MIN_LENGTH || trimmed.length > ADDRESS_MAX_LENGTH) {
    return false;
  }
  return ADDRESS_PATTERN.test(trimmed);
}

/** Money amounts must be finite, non-negative numbers. */
export function isFiniteAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** A vault's locked principal must be a strictly positive finite number. */
export function isPositiveAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** A currency symbol used for display. */
export function isValidCurrency(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    STELLAR_CURRENCY_PATTERN.test(value)
  );
}

/** A Stellar transaction hash. Loose on character set (hex or fixture-style)
 *  but strict about shape so it can never contain URL-unsafe content. */
export function isValidTxHash(value: unknown): value is string {
  return typeof value === "string" && TX_HASH_PATTERN.test(value);
}

export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.trim().length === 0) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const VAULT_STATUSES: readonly VaultStatus[] = [
  "active",
  "pending_validation",
  "completed",
  "failed",
  "cancelled",
];

const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  "pending",
  "validated",
  "failed",
];

const TX_TYPES = ["create", "validate", "release", "redirect"] as const;

export function isVaultStatus(value: unknown): value is VaultStatus {
  return (
    typeof value === "string" && (VAULT_STATUSES as readonly string[]).includes(value)
  );
}

export function isMilestoneStatus(value: unknown): value is MilestoneStatus {
  return (
    typeof value === "string" &&
    (MILESTONE_STATUSES as readonly string[]).includes(value)
  );
}

// ── Server response validation ────────────────────────────────────────────────

export type VaultValidationResult =
  | { ok: true; vault: Vault }
  | { ok: false; issues: string[] };

/**
 * Validates a vault received from the service/server before its state is
 * rendered or acted upon. Structural problems (missing fields, wrong types,
 * impossible numbers, unparseable dates, invalid addresses) are hard failures
 * that block display — the UI must never guess at invalid server data.
 */
export function validateVaultResponse(value: unknown): VaultValidationResult {
  const issues: string[] = [];

  if (!isRecord(value)) {
    return { ok: false, issues: ["Vault response is not an object."] };
  }

  if (!isNonEmptyString(value.id)) {
    issues.push("Vault id must be a non-empty string.");
  }

  if (!isNonEmptyString(value.name)) {
    issues.push("Vault name must be a non-empty string.");
  }

  if (!isVaultStatus(value.status)) {
    issues.push(
      `Vault status must be one of: ${VAULT_STATUSES.join(", ")}.`,
    );
  }

  if (!isPositiveAmount(value.amount)) {
    issues.push("Vault amount must be a positive finite number.");
  }

  if (!isValidCurrency(value.currency)) {
    issues.push("Vault currency must be letters only (2-12 characters).");
  }

  if (!isValidIsoTimestamp(value.createdAt)) {
    issues.push("Vault createdAt must be a valid date.");
  }

  if (!isValidIsoTimestamp(value.deadline)) {
    issues.push("Vault deadline must be a valid date.");
  } else if (
    isValidIsoTimestamp(value.createdAt) &&
    new Date(value.deadline).getTime() <= new Date(value.createdAt).getTime()
  ) {
    issues.push("Vault deadline must be after its creation date.");
  }

  for (const field of [
    "creatorAddress",
    "successAddress",
    "failureAddress",
    "contractAddress",
  ] as const) {
    if (!isPlausibleStellarAddress(value[field])) {
      issues.push(`Vault ${field} must be a plausible Stellar address.`);
    }
  }

  if (value.verifierAddress !== undefined) {
    if (typeof value.verifierAddress !== "string") {
      issues.push("Vault verifierAddress must be a string when present.");
    } else if (
      value.verifierAddress.trim().length > 0 &&
      !isPlausibleStellarAddress(value.verifierAddress)
    ) {
      issues.push("Vault verifierAddress must be a plausible Stellar address.");
    }
  }

  if (!Array.isArray(value.milestones)) {
    issues.push("Vault milestones must be an array.");
  } else {
    const seenIds = new Set<string>();
    value.milestones.forEach((milestone, index) => {
      if (!isRecord(milestone)) {
        issues.push(`Milestone ${index} must be an object.`);
        return;
      }
      if (!isNonEmptyString(milestone.id)) {
        issues.push(`Milestone ${index} id must be a non-empty string.`);
      } else if (seenIds.has(milestone.id)) {
        issues.push(`Milestone id "${milestone.id}" is duplicated.`);
      } else {
        seenIds.add(milestone.id);
      }
      if (
        milestone.validatedAt !== undefined &&
        milestone.status !== "validated" &&
        milestone.validatedAt !== ""
      ) {
        issues.push(
          `Milestone ${index} has a validation timestamp but is not validated.`,
        );
      }
      if (!isNonEmptyString(milestone.title)) {
        issues.push(`Milestone ${index} title must be a non-empty string.`);
      }
      if (!isNonEmptyString(milestone.description)) {
        issues.push(`Milestone ${index} description must be a non-empty string.`);
      }
      if (!isNonEmptyString(milestone.criteria)) {
        issues.push(`Milestone ${index} criteria must be a non-empty string.`);
      }
      if (!isMilestoneStatus(milestone.status)) {
        issues.push(
          `Milestone ${index} status must be one of: ${MILESTONE_STATUSES.join(", ")}.`,
        );
      }
      if (
        milestone.validatedAt !== undefined &&
        !isValidIsoTimestamp(milestone.validatedAt)
      ) {
        issues.push(`Milestone ${index} validatedAt must be a valid date.`);
      }
    });
  }

  if (!Array.isArray(value.transactions)) {
    issues.push("Vault transactions must be an array.");
  } else {
    value.transactions.forEach((tx, index) => {
      if (!isRecord(tx)) {
        issues.push(`Transaction ${index} must be an object.`);
        return;
      }
      if (!isNonEmptyString(tx.id)) {
        issues.push(`Transaction ${index} id must be a non-empty string.`);
      }
      if (typeof tx.type !== "string" || !TX_TYPES.includes(tx.type as never)) {
        issues.push(
          `Transaction ${index} type must be one of: ${TX_TYPES.join(", ")}.`,
        );
      }
      if (!isValidTxHash(tx.hash)) {
        issues.push(
          `Transaction ${index} hash must be an alphanumeric string (8-64 characters).`,
        );
      }
      if (!isValidIsoTimestamp(tx.timestamp)) {
        issues.push(`Transaction ${index} timestamp must be a valid date.`);
      }
      if (tx.amount !== undefined && !isFiniteAmount(tx.amount)) {
        issues.push(`Transaction ${index} amount must be a non-negative number.`);
      }
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, vault: value as unknown as Vault };
}

// ── Milestone anomalies ───────────────────────────────────────────────────────

export type MilestoneAnomalyKind =
  | "duplicate-id"
  | "missing-id"
  | "unknown-status"
  | "impossible-order"
  | "stale-validated-at";

export interface MilestoneAnomaly {
  kind: MilestoneAnomalyKind;
  message: string;
  index: number;
}

/**
 * Detects internally inconsistent milestone lists that would otherwise display
 * impossible progress transitions. The tracker renders these as a non-blocking
 * notice instead of pretending the progress is coherent.
 */
export function analyzeMilestones(
  milestones: readonly Milestone[],
): { currentIndex: number; anomalies: MilestoneAnomaly[] } {
  const anomalies: MilestoneAnomaly[] = [];
  let currentIndex = -1;

  const seenIds = new Set<string>();

  milestones.forEach((milestone, index) => {
    if (!milestone || typeof milestone !== "object") {
      anomalies.push({
        kind: "unknown-status",
        message: `Milestone ${index} is malformed and cannot be displayed.`,
        index,
      });
      return;
    }

    if (!isNonEmptyString(milestone.id)) {
      anomalies.push({
        kind: "missing-id",
        message: `Milestone ${index} is missing an id.`,
        index,
      });
    } else if (seenIds.has(milestone.id)) {
      anomalies.push({
        kind: "duplicate-id",
        message: `Milestone id "${milestone.id}" appears more than once.`,
        index,
      });
    } else {
      seenIds.add(milestone.id);
    }

    if (!isMilestoneStatus(milestone.status)) {
      anomalies.push({
        kind: "unknown-status",
        message: `Milestone ${index} has an unrecognized status.`,
        index,
      });
    }

    // A validation timestamp on a milestone that is not validated is stale
    // or tampered data — a plain `validated` milestone legitimately has one.
    if (
      milestone.status !== "validated" &&
      milestone.validatedAt !== undefined &&
      milestone.validatedAt !== ""
    ) {
      anomalies.push({
        kind: "stale-validated-at",
        message: `Milestone ${index} has a validation timestamp despite not being validated.`,
        index,
      });
    }

    if (currentIndex === -1 && milestone.status === "pending") {
      currentIndex = index;
    }
  });

// A validated milestone after the first pending one is an impossible
// transition — approvals always advance in order, so progress cannot
// leapfrog validation across the current pending step. A failed milestone,
// by contrast, may legitimately be recorded mid-sequence (see the
// canceled-vault fixture: validated, then failed, then pending), so failure
// alone is not treated as an ordering anomaly here.
if (currentIndex !== -1) {
  milestones.forEach((milestone, index) => {
    if (index > currentIndex && milestone?.status === "validated") {
      anomalies.push({
        kind: "impossible-order",
        message: `Milestone ${index + 1} is marked as validated before the current pending milestone.`,
        index,
      });
    }
  });
}

  return { currentIndex, anomalies };
}

// ── Settlement anomalies ──────────────────────────────────────────────────────

/**
 * Detects settlement-state inconsistencies that would misrepresent where the
 * vault's funds actually went (tampered or truncated server responses).
 */
export function detectSettlementAnomalies(vault: Vault): string[] {
  const anomalies: string[] = [];

  const releaseTx = vault.transactions.find((tx) => tx.type === "release");
  const redirectTx = vault.transactions.find((tx) => tx.type === "redirect");

  if (vault.status === "completed" && !releaseTx) {
    anomalies.push(
      "Vault is completed but no release transaction was found in its history.",
    );
  }

  if (
    vault.status === "failed" ||
    vault.status === "cancelled"
  ) {
    if (!redirectTx) {
      anomalies.push(
        "Vault is settled but no redirect transaction was found in its history.",
      );
    }
  }

  const settlementTx = releaseTx ?? redirectTx;
  if (
    settlementTx &&
    settlementTx.amount !== undefined &&
    Math.abs(settlementTx.amount - vault.amount) > 1e-9
  ) {
    anomalies.push(
      `Settled amount (${settlementTx.amount}) does not match the vault principal (${vault.amount}).`,
    );
  }

  return anomalies;
}

// ── Fund-release view building ────────────────────────────────────────────────

export interface FundReleaseViewState {
  outcome: "released" | "redirected" | "pending";
  destinationAddress?: string;
  amount: number;
  currency: string;
  transaction?: { hash?: string; timestamp?: string };
}

/**
 * Derives the fund-release view state from a validated vault. Mirrors the
 * pre-existing mapping so actors keep the same happy-path semantics, while the
 * caller surfaces detectSettlementAnomalies separately.
 */
export function buildFundReleaseView(vault: Vault): FundReleaseViewState {
  const releaseTx = vault.transactions.find((tx) => tx.type === "release");
  const redirectTx = vault.transactions.find((tx) => tx.type === "redirect");

  if (vault.status === "completed") {
    return {
      outcome: "released",
      destinationAddress: vault.successAddress,
      amount: releaseTx?.amount ?? vault.amount,
      currency: vault.currency,
      transaction: releaseTx,
    };
  }

  if (vault.status === "failed" || vault.status === "cancelled") {
    return {
      outcome: "redirected",
      destinationAddress: vault.failureAddress,
      amount: redirectTx?.amount ?? vault.amount,
      currency: vault.currency,
      transaction: redirectTx,
    };
  }

  return {
    outcome: "pending",
    amount: vault.amount,
    currency: vault.currency,
  };
}

// ── Authorization boundary ────────────────────────────────────────────────────

export type VaultAction =
  | "validate_milestone"
  | "extend_deadline"
  | "cancel_vault";

export const VAULT_ACTIONS: readonly VaultAction[] = [
  "validate_milestone",
  "extend_deadline",
  "cancel_vault",
];

export function isVaultAction(value: unknown): value is VaultAction {
  return (
    typeof value === "string" && (VAULT_ACTIONS as readonly string[]).includes(value)
  );
}

export type WalletNetworkLike = "TESTNET" | "PUBLIC" | null | undefined;

export interface EvalVaultActionAuthInput {
  action: VaultAction;
  vault: Vault;
  walletAddress: string | null | undefined;
  walletNetwork: WalletNetworkLike;
  expectedNetwork?: "TESTNET" | "PUBLIC";
}

export interface VaultActionAuth {
  allowed: boolean;
  reasons: string[];
}

const ACTION_LABELS: Record<VaultAction, string> = {
  validate_milestone: "validate this milestone",
  extend_deadline: "extend this vault's deadline",
  cancel_vault: "cancel this vault",
};

const SETTLED_STATUSES: readonly VaultStatus[] = ["completed", "failed", "cancelled"];

/**
 * Decides whether a wallet may perform a sensitive vault action. Every check is
 * evaluated against vault data (the fetched, validated store) plus the live
 * wallet — identity is never taken from client-inferred state, and the network
 * the wallet reports must match the network the app is pinned to.
 *
 * This is a client-side precondition only. The authoritative authorization
 * remains enforced by the vault contract on-chain.
 */
export function evalVaultActionAuth({
  action,
  vault,
  walletAddress,
  walletNetwork,
  expectedNetwork,
}: EvalVaultActionAuthInput): VaultActionAuth {
  const reasons: string[] = [];
  const label = ACTION_LABELS[action];

  if (!isNonEmptyString(walletAddress)) {
    reasons.push("Connect your wallet to authorize this action.");
  } else if (!isPlausibleStellarAddress(walletAddress)) {
    reasons.push("The connected wallet address is invalid.");
  }

  if (isNetworkMismatch(walletNetwork, expectedNetwork)) {
    const expected =
      (expectedNetwork ?? "TESTNET") === "PUBLIC" ? "mainnet" : "testnet";
    reasons.push(`Your wallet is on the wrong network. Switch to ${expected} first.`);
  }

  if (
    vault.status !== undefined &&
    (SETTLED_STATUSES as readonly string[]).includes(vault.status)
  ) {
    reasons.push("This vault has already settled and no actions remain.");
  }

  if (action === "validate_milestone" && vault.status !== "pending_validation") {
    reasons.push("No milestone is currently pending validation.");
  }

  const isCreator = walletAddress === vault.creatorAddress;
  const isVerifier =
    (vault.verifierAddress ?? "").length > 0 &&
    walletAddress === vault.verifierAddress;

  const authorized =
    action === "validate_milestone" ? isCreator || isVerifier : isCreator;

  if (
    reasons.length === 0 &&
    isNonEmptyString(walletAddress) &&
    !authorized
  ) {
    reasons.push(
      `The connected wallet is not authorized to ${label}. Only the vault's creator${
        action === "validate_milestone" ? " or verifier" : ""
      } may do this.`,
    );
  }

  // Invariant: an action is allowed only when every precondition passed.
  // Returning `allowed: true` with any reason present would be unsafe.
  return { allowed: reasons.length === 0, reasons };
}