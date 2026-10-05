/**
 * Failure-path and boundary coverage for src/pages/Dashboard.tsx.
 *
 * The Dashboard is the one page that reads an unbounded, entirely untrusted
 * list (`vaultService.listVaults()`, a seam documented as "replace with a real
 * Horizon/Soroban backend") and then both renders it and runs arithmetic over
 * it. These tests pin the invariants that make that safe:
 *
 *  1. Nothing from the service reaches render or the summary unless it cleared
 *     the response boundary (no unchecked `as VaultStatus` cast).
 *  2. A response that yields nothing renderable is reported as a retryable
 *     error, never as the "No vaults yet" empty state (which would lie).
 *  3. A failure never leaves stale totals on screen next to the failure notice.
 *  4. One page load issues one request, even under a React StrictMode
 *     double-mount, and an overlapping retry is coalesced rather than queued.
 *  5. Failures are diagnosable from a privacy-safe code + count, with no vault
 *     names, ids, addresses, amounts, or raw error messages in the output.
 *
 * Complements Dashboard.test.tsx, which covers the normal render path.
 */
import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import fc from "fast-check";

import Dashboard, { readVaultList } from "../Dashboard";
import { listVaults } from "../../services/vaultService";
import { isValidVaultRouteId } from "../../utils/vaultState";
import type { Vault } from "../../types/vault";

vi.mock("../../services/vaultService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/vaultService")>();
  return { ...actual, listVaults: vi.fn(actual.listVaults) };
});

const mockedListVaults = vi.mocked(listVaults);

const CREATED = "2026-01-01T00:00:00.000Z";

/** A structurally valid vault; `overrides` injects a single defect at a time. */
function buildVault(overrides: Record<string, unknown> = {}): Vault {
  return {
    id: "1",
    name: "Test Vault",
    status: "active",
    amount: 1000,
    currency: "USDC",
    createdAt: CREATED,
    deadline: "2026-12-31T00:00:00.000Z",
    creatorAddress: "GCREATOR",
    successAddress: "GSUCCESS",
    failureAddress: "GFAILURE",
    contractAddress: "GCONTRACT",
    milestones: [],
    transactions: [],
    ...overrides,
  } as Vault;
}

/** A vault whose pending-milestone count is observable in the summary. */
function vaultWithPending(id: string, pending: number): Vault {
  return buildVault({
    id,
    milestones: Array.from({ length: pending }, (_, i) => ({
      id: `${id}_m${i}`,
      title: `M${i}`,
      description: "d",
      criteria: "c",
      status: "pending",
    })),
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

/**
 * The summary card value for `label`, read the way a user would see it.
 * `.text-caption` disambiguates the card label from the "Active Vaults"
 * section header, which is rendered with the body typography role.
 */
function summaryValue(label: string): string {
  return (
    screen.getByText(label, { selector: ".text-caption" }).parentElement
      ?.textContent ?? ""
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

/** Every console.error/warn the app emitted, as one flat string per channel. */
function loggedText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call) => JSON.stringify(call)).join("\n");
}

beforeEach(() => {
  mockedListVaults.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

describe("Dashboard response boundary (readVaultList)", () => {
  it("accepts a fully valid vault unchanged", () => {
    const read = readVaultList([buildVault()]);
    expect(read.unusable).toBe(false);
    expect(read.rejected).toBe(0);
    expect(read.accepted).toHaveLength(1);
    expect(read.accepted[0].name).toBe("Test Vault");
  });

  it("treats a non-array payload as unusable rather than empty", () => {
    for (const payload of [null, undefined, {}, "nope", 42, true, Symbol("s")]) {
      const read = readVaultList(payload);
      expect(read.unusable).toBe(true);
      expect(read.accepted).toEqual([]);
    }
  });

  it("treats an empty array as a genuine empty list, not a failure", () => {
    const read = readVaultList([]);
    expect(read.unusable).toBe(false);
    expect(read.rejected).toBe(0);
    expect(read.accepted).toEqual([]);
  });

  it("refuses every entry when none is usable", () => {
    const read = readVaultList([{ id: "1" }, null, "x"]);
    expect(read.unusable).toBe(true);
    expect(read.rejected).toBe(3);
  });

  const refusals: Array<[string, unknown]> = [
    ["missing milestones", { milestones: undefined }],
    ["milestones not an array", { milestones: { 0: { status: "pending" } } }],
    ["empty milestones array is valid but amount is not", { amount: 0 }],
    ["NaN amount", { amount: Number.NaN }],
    ["Infinity amount", { amount: Number.POSITIVE_INFINITY }],
    ["negative amount", { amount: -1 }],
    ["string amount", { amount: "1000" }],
    ["unknown status", { status: "hacked" }],
    ["missing status", { status: undefined }],
    ["empty name", { name: "   " }],
    ["non-string name", { name: 42 }],
    ["unparseable deadline", { deadline: "not-a-date" }],
    ["unparseable createdAt", { createdAt: "" }],
    ["deadline equal to createdAt", { deadline: CREATED }],
    ["deadline before createdAt", { deadline: "2025-12-31T00:00:00.000Z" }],
    ["non-alphanumeric currency", { currency: "US DC" }],
    ["script-injection currency", { currency: "USDC<script>" }],
    ["empty id", { id: "" }],
    ["non-string id", { id: 7 }],
    ["path-traversal id", { id: "../1" }],
    ["slash id", { id: "a/b" }],
    ["dot id", { id: "a.b" }],
    ["reserved __proto__ id", { id: "__proto__" }],
    ["over-long id (65 chars)", { id: "a".repeat(65) }],
  ];

  it.each(refusals)("refuses a vault with %s", (_label, override) => {
    const read = readVaultList([buildVault(override)]);
    expect(read.accepted).toEqual([]);
    expect(read.rejected).toBe(1);
    expect(read.unusable).toBe(true);
  });

  it.each([
    ["id at the 64-character limit", "a".repeat(64)],
    ["id with dashes and underscores", "G-vault_9"],
  ])("accepts %s", (_label, id) => {
    const read = readVaultList([buildVault({ id })]);
    expect(read.rejected).toBe(0);
    expect(read.accepted[0].id).toBe(id);
  });

  it("refuses non-object entries", () => {
    const read = readVaultList([null, undefined, 1, "x", true, [], () => {}]);
    expect(read.accepted).toEqual([]);
    expect(read.rejected).toBe(7);
  });

  it("drops a repeated id so React keys stay unique and totals are not double counted", () => {
    const read = readVaultList([
      buildVault({ id: "dup", name: "First", amount: 100 }),
      buildVault({ id: "dup", name: "Second", amount: 999 }),
      buildVault({ id: "other", name: "Third", amount: 50 }),
    ]);
    expect(read.accepted.map((v) => v.name)).toEqual(["First", "Third"]);
    expect(read.rejected).toBe(1);
    expect(read.unusable).toBe(false);
  });

  it("keeps valid siblings when one entry is refused (partial failure tolerance)", () => {
    const read = readVaultList([
      buildVault({ id: "good-1", name: "Good One" }),
      buildVault({ id: "bad", amount: Number.NaN }),
      buildVault({ id: "good-2", name: "Good Two" }),
    ]);
    expect(read.accepted.map((v) => v.name)).toEqual(["Good One", "Good Two"]);
    expect(read.rejected).toBe(1);
  });

  it("strips milestone holes so the summary's milestone.status read is safe", () => {
    const read = readVaultList([
      buildVault({
        id: "holed",
        milestones: [null, undefined, { status: "pending" }, "x", 3],
      }),
    ]);
    expect(read.rejected).toBe(0);
    expect(read.accepted[0].milestones).toEqual([{ status: "pending" }]);
  });

  it("never returns an accepted vault that fails its own boundary rule", () => {
    fc.assert(
      fc.property(fc.anything(), (entry) => {
        const { accepted } = readVaultList([entry]);
        for (const vault of accepted) {
          expect(isValidVaultRouteId(vault.id)).toBe(true);
          expect(Number.isFinite(vault.amount)).toBe(true);
          expect(vault.amount).toBeGreaterThan(0);
          expect(Array.isArray(vault.milestones)).toBe(true);
          expect(
            new Date(vault.deadline).getTime(),
          ).toBeGreaterThan(new Date(vault.createdAt).getTime());
        }
      }),
      { numRuns: 200 },
    );
  });

  it("keeps accepted ids unique and preserves response order for any payload", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.oneof(
              fc.constantFrom("a", "b", "c"),
              fc.constant("__proto__"),
              fc.string(),
            ),
            amount: fc.oneof(fc.constant(10), fc.constant(Number.NaN)),
            milestones: fc.oneof(
              fc.constant([]),
              fc.constant(null),
              fc.constant("x"),
            ),
          }),
          { maxLength: 12 },
        ),
        (payload) => {
          const { accepted } = readVaultList(payload);
          const ids = accepted.map((v) => v.id);
          expect(new Set(ids).size).toBe(ids.length);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("Dashboard load failure states", () => {
  it("renders a retryable, announced error when the service rejects", async () => {
    mockedListVaults.mockRejectedValue(new Error("network down"));
    renderDashboard();

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Failed to load vaults.")).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: /retry/i })).toBeEnabled();
    // The empty state must not be shown when the request failed.
    expect(screen.queryByText("No vaults yet")).not.toBeInTheDocument();
  });

  it("shows a loading status before the request settles", async () => {
    const gate = deferred<Vault[]>();
    mockedListVaults.mockReturnValue(gate.promise);
    renderDashboard();

    expect(await screen.findByText("Loading vaults…")).toBeInTheDocument();

    await act(async () => {
      gate.resolve([buildVault({ name: "Late Arrival" })]);
    });
    expect(await screen.findByText("Late Arrival")).toBeInTheDocument();
  });

  it("reports a non-array payload as a failure, not as an empty account", async () => {
    mockedListVaults.mockResolvedValue({ vaults: [] } as never);
    renderDashboard();

    expect(await screen.findByText("Failed to load vaults.")).toBeInTheDocument();
    expect(screen.queryByText("No vaults yet")).not.toBeInTheDocument();
  });

  it("reports an all-unusable payload as a failure rather than 'No vaults yet'", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({ id: "1", amount: Number.NaN }),
      { id: "2" },
    ] as never);
    renderDashboard();

    expect(await screen.findByText("Failed to load vaults.")).toBeInTheDocument();
    expect(screen.queryByText("No vaults yet")).not.toBeInTheDocument();
  });

  it("renders the empty state for a genuinely empty list", async () => {
    mockedListVaults.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText("No vaults yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recovers from a failure when Retry succeeds", async () => {
    mockedListVaults
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce([buildVault({ name: "Recovered Vault" })]);
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));

    expect(await screen.findByText("Recovered Vault")).toBeInTheDocument();
    expect(screen.queryByText("Failed to load vaults.")).not.toBeInTheDocument();
    expect(mockedListVaults).toHaveBeenCalledTimes(2);
  });

  it("stays on the error state across repeated failures and stays interactive", async () => {
    mockedListVaults.mockRejectedValue(new Error("still down"));
    renderDashboard();

    const retry = await screen.findByRole("button", { name: /retry/i });
    fireEvent.click(retry);
    expect(await screen.findByText("Failed to load vaults.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeEnabled();
    expect(mockedListVaults).toHaveBeenCalledTimes(2);
  });

  it("recovers when a retry returns data after a partially invalid response", async () => {
    mockedListVaults
      .mockResolvedValueOnce([buildVault({ id: "bad", amount: Number.NaN })] as never)
      .mockResolvedValueOnce([buildVault({ id: "ok", name: "Second Try" })]);
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Second Try")).toBeInTheDocument();
    expect(screen.queryByText(/could not be verified/)).not.toBeInTheDocument();
  });
});

describe("Dashboard malformed-entry handling", () => {
  it("drops a vault missing milestones instead of crashing the render", async () => {
    mockedListVaults.mockResolvedValue([
      { id: "1", name: "No Milestones", status: "active", amount: 5, currency: "USDC" },
    ] as never);
    renderDashboard();

    expect(
      await screen.findByText("Failed to load vaults."),
    ).toBeInTheDocument();
    // The crash this guarded was `Cannot read properties of undefined (reading 'filter')`.
    expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
  });

  it("never lets a non-finite amount reach the summary as NaN", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({ id: "nan-1", name: "NaN Vault", amount: Number.NaN }),
    ] as never);
    renderDashboard();

    expect(await screen.findByText("Failed to load vaults.")).toBeInTheDocument();
    expect(summaryValue("Total Locked")).not.toMatch(/NaN/);
  });

  it("excludes refused entries from the totals but keeps their valid siblings", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({ id: "keep-1", name: "Kept Vault", amount: 400 }),
      buildVault({ id: "drop-1", name: "Dropped Vault", amount: 900, status: "hacked" }),
    ] as never);
    renderDashboard();

    expect(await screen.findByText("Kept Vault")).toBeInTheDocument();
    expect(screen.queryByText("Dropped Vault")).not.toBeInTheDocument();
    // 400 counted once; 900 refused so it cannot inflate the total.
    expect(summaryValue("Total Locked")).toContain("400");
    expect(summaryValue("Total Locked")).not.toContain("900");
  });

  it("makes a partial refusal visible instead of silently shrinking the list", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({ id: "good-1", name: "Kept Vault" }),
      buildVault({ id: "bad-1", amount: Number.NaN }),
      buildVault({ id: "bad-2", milestones: "nope" }),
    ] as never);
    renderDashboard();

    expect(await screen.findByText("Kept Vault")).toBeInTheDocument();
    expect(
      screen.getByText("2 vaults could not be verified and are not shown."),
    ).toBeInTheDocument();
  });

  it("uses the singular form for exactly one refused entry", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({ id: "good-1", name: "Kept Vault" }),
      buildVault({ id: "bad-1", milestones: null }),
    ] as never);
    renderDashboard();

    expect(
      await screen.findByText("1 vault could not be verified and is not shown."),
    ).toBeInTheDocument();
  });

  it("shows no refusal notice when every entry is valid", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({ id: "a", name: "Vault A" }),
      buildVault({ id: "b", name: "Vault B" }),
    ]);
    renderDashboard();

    expect(await screen.findByText("Vault A")).toBeInTheDocument();
    expect(screen.queryByText(/could not be verified/)).not.toBeInTheDocument();
  });

  it("renders duplicate ids once, without a React duplicate-key warning", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({ id: "dup", name: "First Copy", amount: 100 }),
      buildVault({ id: "dup", name: "Second Copy", amount: 500 }),
    ]);
    renderDashboard();

    expect(await screen.findByText("First Copy")).toBeInTheDocument();
    expect(screen.queryByText("Second Copy")).not.toBeInTheDocument();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("never renders a hostile id as a vault link", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({ id: "__proto__", name: "Proto Vault" }),
      buildVault({ id: "../escape", name: "Escape Vault" }),
    ] as never);
    renderDashboard();

    expect(await screen.findByText("Failed to load vaults.")).toBeInTheDocument();
    const hrefs = screen
      .queryAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes("__proto__") || h.includes(".."))).toBe(false);
  });

  it("survives an arbitrary junk payload without crashing", async () => {
    const junk = [null, 0, "", false, [], {}, { id: {} }, [[[]]]];
    for (const entry of junk) {
      mockedListVaults.mockResolvedValueOnce([entry] as never);
      const view = renderDashboard();
      expect(
        await screen.findByText("Failed to load vaults."),
      ).toBeInTheDocument();
      view.unmount();
    }
  });
});

describe("Dashboard summary invariants", () => {
  it("counts pending milestones across accepted vaults only", async () => {
    mockedListVaults.mockResolvedValue([
      vaultWithPending("a", 2),
      vaultWithPending("b", 1),
      buildVault({ id: "c", name: "Done", status: "completed", milestones: [] }),
    ]);
    renderDashboard();

    await screen.findByText("Done");
    expect(summaryValue("Pending Milestones")).toContain("3");
  });

  it("does not let a refused entry inflate the active vault count", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({ id: "good", name: "Good", amount: 100 }),
      buildVault({ id: "dup", name: "Dup", amount: 100 }),
      buildVault({ id: "dup", name: "Dup Again", amount: 100 }),
    ]);
    renderDashboard();

    await screen.findByText("Good");
    expect(summaryValue("Active Vaults")).toContain("2");
    expect(summaryValue("Total Locked")).toContain("200");
  });
});

describe("Dashboard concurrency and retry safety", () => {
  it("issues a single request for a StrictMode double-mount", async () => {
    mockedListVaults.mockResolvedValue([buildVault({ name: "Strict Vault" })]);

    render(
      <StrictMode>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByText("Strict Vault")).toBeInTheDocument();
    expect(mockedListVaults).toHaveBeenCalledTimes(1);
  });

  it("coalesces an overlapping retry into the in-flight request", async () => {
    const gate = deferred<Vault[]>();
    mockedListVaults
      .mockRejectedValueOnce(new Error("down"))
      .mockReturnValueOnce(gate.promise);
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    await waitFor(() =>
      expect(mockedListVaults).toHaveBeenCalledTimes(2),
    );

    // The retry owns the view: the panel is loading, and no Retry control is
    // reachable while a request is in flight, so a second request cannot start.
    expect(await screen.findByText("Loading vaults…")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /retry/i }),
    ).not.toBeInTheDocument();

    await act(async () => {
      gate.resolve([buildVault({ name: "Coalesced Vault" })]);
    });
    expect(await screen.findByText("Coalesced Vault")).toBeInTheDocument();
    expect(mockedListVaults).toHaveBeenCalledTimes(2);
  });

  it("does not apply a stale response after a newer one has settled", async () => {
    const first = deferred<Vault[]>();
    const second = deferred<Vault[]>();
    mockedListVaults.mockReturnValueOnce(first.promise);

    const view = renderDashboard();

    // Unmount while the first request is still in flight, then mount again.
    view.unmount();
    mockedListVaults.mockReturnValueOnce(second.promise);
    renderDashboard();

    await act(async () => {
      // The abandoned request resolves last and must be ignored entirely.
      second.resolve([buildVault({ id: "fresh", name: "Fresh Vault" })]);
      await Promise.resolve();
    });
    expect(await screen.findByText("Fresh Vault")).toBeInTheDocument();

    await act(async () => {
      first.resolve([buildVault({ id: "stale", name: "Stale Vault" })]);
      await Promise.resolve();
    });
    expect(screen.queryByText("Stale Vault")).not.toBeInTheDocument();
    expect(screen.getByText("Fresh Vault")).toBeInTheDocument();
  });

  it("gives each Dashboard instance its own in-flight request", async () => {
    mockedListVaults.mockResolvedValue([buildVault({ name: "Shared Page" })]);

    const first = renderDashboard();
    expect(await screen.findByText("Shared Page")).toBeInTheDocument();
    first.unmount();

    renderDashboard();
    expect(await screen.findByText("Shared Page")).toBeInTheDocument();
    // Two sequential mounts, one request each — no in-flight state leaks across.
    expect(mockedListVaults).toHaveBeenCalledTimes(2);
  });

  it("unmounts cleanly while a request is still in flight", async () => {
    const gate = deferred<Vault[]>();
    mockedListVaults.mockReturnValue(gate.promise);
    const view = renderDashboard();

    await screen.findByText("Loading vaults…");
    view.unmount();

    await act(async () => {
      gate.resolve([buildVault({ name: "Too Late" })]);
      await Promise.resolve();
    });

    // No post-unmount state update, so no React warning is emitted.
    const reactWarnings = [...consoleError.mock.calls, ...consoleWarn.mock.calls]
      .map((call) => String(call[0]))
      .filter((line) => /unmounted component|Warning:/.test(line));
    expect(reactWarnings).toEqual([]);
  });
});

describe("Dashboard failure observability", () => {
  it("records a stable code and attempt number for an unavailable service", async () => {
    mockedListVaults.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.5"));
    renderDashboard();

    await screen.findByText("Failed to load vaults.");
    const payload = consoleError.mock.calls.map((call) => call[1]).find(Boolean) as
      | Record<string, unknown>
      | undefined;
    expect(payload).toMatchObject({
      code: "unavailable",
      attempt: 1,
    });
  });

  it("records a distinct code for an unusable response", async () => {
    mockedListVaults.mockResolvedValue("nope" as never);
    renderDashboard();

    await screen.findByText("Failed to load vaults.");
    const payload = consoleError.mock.calls.map((call) => call[1]).find(Boolean) as
      | Record<string, unknown>
      | undefined;
    expect(payload).toMatchObject({ code: "invalid_response", received: 0 });
  });

  it("numbers retries so a retry loop is diagnosable", async () => {
    mockedListVaults.mockRejectedValue(new Error("down"));
    renderDashboard();

    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    await waitFor(() => expect(consoleError).toHaveBeenCalledTimes(2));

    const attempts = consoleError.mock.calls
      .map((call) => (call[1] as { attempt?: number }).attempt)
      .filter((n): n is number => typeof n === "number");
    expect(attempts).toEqual([1, 2]);
  });

  it("never writes vault data or raw error text into the diagnostics", async () => {
    mockedListVaults.mockRejectedValue(
      new Error("ECONNREFUSED for GSECRETKEYADDRESS at 10.0.0.5"),
    );
    renderDashboard();

    await screen.findByText("Failed to load vaults.");
    const output = loggedText(consoleError) + loggedText(consoleWarn);
    expect(output).not.toContain("GSECRETKEYADDRESS");
    expect(output).not.toContain("10.0.0.5");
    expect(output).not.toContain("ECONNREFUSED");
  });

  it("never writes refused vault fields into the diagnostics", async () => {
    mockedListVaults.mockResolvedValue([
      buildVault({
        id: "bad-1",
        name: "Secret Vault Name",
        amount: Number.NaN,
        creatorAddress: "GSECRETCREATOR",
      }),
      buildVault({ id: "good", name: "Fine" }),
    ] as never);
    renderDashboard();

    await screen.findByText("Fine");
    const output = loggedText(consoleError) + loggedText(consoleWarn);
    expect(output).toContain("vault_entries_rejected");
    expect(output).not.toContain("Secret Vault Name");
    expect(output).not.toContain("GSECRETCREATOR");
    expect(output).not.toContain("bad-1");
  });

  it("logs nothing on a fully successful load", async () => {
    mockedListVaults.mockResolvedValue([buildVault({ name: "Clean Vault" })]);
    renderDashboard();

    await screen.findByText("Clean Vault");
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});

describe("Dashboard caller-supplied prop boundaries", () => {
  it("renders an unrecognised activity type with a neutral fallback", async () => {
    mockedListVaults.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <Dashboard
          activity={[
            {
              id: "x1",
              type: "slashed" as never,
              vault: "Mystery Vault",
              timestamp: "2026-06-27T11:45:00.000Z",
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Vault activity ·")).toBeInTheDocument();
    expect(screen.getByText("Mystery Vault")).toBeInTheDocument();
  });

  it("does not resolve a prototype key as an activity type", async () => {
    mockedListVaults.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <Dashboard
          activity={[
            {
              id: "x1",
              type: "__proto__" as never,
              vault: "Hostile Vault",
              timestamp: "2026-06-27T11:45:00.000Z",
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Vault activity ·")).toBeInTheDocument();
    expect(screen.queryByText(/Vault created/)).not.toBeInTheDocument();
  });

  it("renders known activity types with their own label and icon", async () => {
    mockedListVaults.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <Dashboard
          activity={[
            {
              id: "x1",
              type: "created",
              vault: "Alpha",
              timestamp: "2026-06-27T11:45:00.000Z",
            },
            {
              id: "x2",
              type: "released",
              vault: "Beta",
              timestamp: "2026-06-27T11:40:00.000Z",
              amount: 1500,
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Vault created/)).toBeInTheDocument();
    expect(screen.getByText(/Funds released/)).toBeInTheDocument();
    expect(screen.getByText("1,500 USDC")).toBeInTheDocument();
  });

  it("degrades a non-array activity prop to an empty feed", async () => {
    mockedListVaults.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <Dashboard activity={null as never} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Recent Activity")).toBeInTheDocument();
    expect(screen.queryByText(/Vault created/)).not.toBeInTheDocument();
  });

  it("keeps the fixture deadlines when the prop is omitted entirely", async () => {
    mockedListVaults.mockResolvedValue([]);
    renderDashboard();

    // `deadlines = DEADLINES` is a default parameter, so omitting the prop must
    // still yield the seeded sidebar rather than an empty one.
    expect(
      await screen.findByText("Upcoming Deadlines"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No upcoming deadlines.")).not.toBeInTheDocument();
  });

  it("degrades a null deadlines prop to an empty sidebar", async () => {
    mockedListVaults.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <Dashboard deadlines={null as never} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No upcoming deadlines.")).toBeInTheDocument();
  });

  it("keeps rendering the page when activity and deadlines are both hostile", async () => {
    mockedListVaults.mockResolvedValue([buildVault({ name: "Resilient Vault" })]);
    render(
      <MemoryRouter>
        <Dashboard activity={"boom" as never} deadlines={42 as never} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Resilient Vault")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
  });
});
