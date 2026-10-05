import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import Dashboard from "../Dashboard";
import VaultCard from "../../components/VaultCard";
import { MASTER_VAULTS } from "../../fixtures/vaults";
import { computeDashboardSummary } from "../../utils/dashboard";
import { listVaults } from "../../services/vaultService";
import type { Vault } from "../../types/vault";

// Dashboard fetches its vault list asynchronously via vaultService.listVaults()
// rather than accepting vaults/summary as props, so tests mock that service
// call and await the resulting render instead of passing data in directly.
vi.mock("../../services/vaultService", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../services/vaultService")>();
  return { ...actual, listVaults: vi.fn(actual.listVaults) };
});

const mockedListVaults = vi.mocked(listVaults);

function buildVault(overrides: Partial<Vault>): Vault {
  return {
    id: "1",
    name: "Test Vault",
    status: "active",
    amount: 1000,
    currency: "USDC",
    createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    deadline: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    creatorAddress: "GCREATOR",
    successAddress: "GSUCCESS",
    failureAddress: "GFAILURE",
    contractAddress: "GCONTRACT",
    milestones: [],
    transactions: [],
    ...overrides,
  };
}

describe("Dashboard page", () => {
  beforeEach(() => {
    mockedListVaults.mockClear();
  });

  test("renders successfully with real vault data once loaded", async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // Verify header title
    expect(
      screen.getByRole("heading", { level: 1, name: /Dashboard/i }),
    ).toBeInDocument();

    // Verify cards and sections
    expect(screen.getByText(/Total Locked/i)).toBeInDocument();
    const expectedActiveVaults = computeDashboardSummary(
      Object.values(MASTER_VAULTS),
    ).activeVaults;
    await waitFor(() => {
      expect(
        screen.getByText(/Active Vaults/i, { selector: ".text-caption" })
          .parentElement,
      ).toHaveTextContent(String(expectedActiveVaults));
    });
    expect(screen.getByText(/Pending Milestones/i)).toBeInDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Recent Activity/i }),
    ).toBeInDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Upcoming Deadlines/i }),
    ).toBeInDocument();
  });

  test("renders empty state when no vaults are returned", async () => {
    mockedListVaults.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // Verify empty state message
    await waitFor(() => {
      expect(screen.getByText(/No vaults yet/i)).toBeInDocument();
    });
  });

  test("renders the at-risk section once vaults with critical or soon deadlines load", async () => {
    // Soon: pending_validation vault due in 3 days.
    const soonVault = buildVault({
      id: "soon-1",
      name: "Soon Vault",
      status: "pending_validation",
      deadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    // Critical: active vault due in 12 hours.
    const criticalVault = buildVault({
      id: "critical-1",
      name: "Critical Vault",
      status: "active",
      deadline: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    });
    // Safe: active vault due far in the future — should be excluded.
    const safeVault = buildVault({
      id: "safe-1",
      name: "Safe Vault",
      status: "active",
      deadline: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    });

    mockedListVaults.mockResolvedValueOnce([
      soonVault,
      criticalVault,
      safeVault,
    ]);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/⭐️ At Risk/)).toBeInDocument();
    });
    expect(
      screen.getByText(/These vaults need immediate attention/),
    ).toBeInDocument();

    // Scope to the At Risk section itself: Soon/Critical Vault also appear in
    // the main vault list below, so assert membership within this section only.
    // The "immediate attention" copy is a <p> whose direct parent is the
    // section's outer container (the heading's own parent is only the
    // SectionHeader title row), so anchor on that instead.
    const atRiskSection = screen
      .getByText(/These vaults need immediate attention/)
      .closest("div");
    expect(atRiskSection).toBeInDocument();
    expect(
      within(atRiskSection as HTMLElement).getByText("Soon Vault"),
    ).toBeInDocument();
    expect(
      within(atRiskSection as HTMLElement).getByText("Critical Vault"),
    ).toBeInDocument();
    expect(
      within(atRiskSection as HTMLElement).queryByText("Safe Vault"),
    ).not.toBeInDocument();
  });

  test("does not render the at-risk section when no vaults are at risk", async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: /Dashboard/i }),
      ).toBeInDocument();
    });
    // MASTER_VAULTS fixture deadlines are all outside the "soon" window.
    expect(screen.queryByText(/⍐️ At Risk/)).not.toBeInDocument();
  });

  // ------------------------------------------------------------------------
  // Regression coverage: authorization, validation, retries, and adverse cases
  // -------------------------------------------------------------------------

  test("surfaces a non-sensitive error message and keeps the shell rendered when loading fails", async () => {
    mockedListVaults.mockRejectedValueOnce(
      new Error("Failed to load vaults: upname unauthorized"),
    );

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // The page shell must still render so the user is not left on a blank screen.
    expect(
      screen.getByRole("heading", { level: 1, name: /Dashboard/i }),
    ).toBeInDocument();

    // An error state must be user-visible and must not echo the raw server message.
    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load vaults/i),
      ).toBeInDocument();
    });
    expect(screen.queryByText(/unauthorized/i)).not.toBeInDocument();
  });

  test("retries transient load failures and recovers to a consistent summary", async () => {
    const vaults = [
      buildVault({ id: "r-1", name: "Retry Vault", amount: 2500 }),
    ];
    mockedListVaults
      .mockRejectedValueOnce(new Error("transient network failure"))
      .mockResolvedValueOnce(vaults);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // After the retry succeeds, the data must reflect the successful response.
    await waitFor(() => {
      expect(
        screen.getByText(/Active Vaults/i, { selector: ".text-caption" })
          .parentElement,
      ).toHaveTextContent("1");
    });
    expect(mockedListVaults.mockCalls.length).toBeGreaterThanOrEqual(2);
  });

  test("shows the error state after exhausting retries and does not loop indefinitely", async () => {
    mockedListVaults.mockRejectedValue(new Error("permanent failure"));

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load vaults/i),
      ).toBeInDocument();
    });

    // Retries are bounded: the service must not be called an unbounded number
    // of times. Allow a small but finite cap.
    expect(mockedListVaults.mockCalls.length).toBeLessThanOrEqual(5);
  });

  test("rejects malformed vault records without crashing and still renders valid ones", asyncroous () => {
    const validVault = buildVault({
      id: "valid-1",
      name: "Valid Vault",
      amount: 750,
    });
    // Invalid records: missing id/name, negative amount, bad deadline.
    const malformed = [
      { ...buildVault({id: ""}), id: "" },
      { ...buildVault({ id: "neg-1" }), amount: -100 },
      { ...buildVault({ id: "bad-deadline" }), deadline: "not-a-date" },
    ] as unknown as Vault[];

    mockedListVaults.mockResolvedValueOnce([malformed, validVault]);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // The valid vault must still be visible and the page must not crash.
    await waitFor(() => {
      expect(screen.getByText("Valid Vault")).toBeInDocument();
    });
    expect(
      screen.getByRole("heading", { level: 1, name: /Dashboard/i }),
    ).toBeInDocument();
  });

  test("does not double-count duplicate vault ids in the summary", async () => {
    const dup = buildVault({ id: "dup-1", name: "Dup Vault", amount: 1000 });
    mockedListVaults.mockResolvedValueOnce([dup, dup]);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Active Vaults/i, { selector: ".text-caption" })
          .parentElement,
      ).toHaveTextContent("1");
    });
  });

  test("ignores late responses from a stale request (concurrency guard)", async () => {
    // First request resolves late with stale data; second request resolves
    // early with fresh data. The dashboard must not overwrite the fresh
    // result with the stale one.
    let resolveFirst: () => void = () => {};
    const first = new Promise<Vault[]>((
      resolve,
    ) => {
      resolveFirst = () =>
        resolve([buildVault({ id: "stale", name: "Stale Vault" })]);
    });
    const second = Promise.resolve([
      buildVault({ id: "fresh", name: "Fresh Vault", amount: 9999 }),
    ]);

    mockedListVaults
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    const { rerender } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // Trigger a second load before the first resolves.
    rerender(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    );

    // Fresh data arrives first.
    await waitFor(() => {
      expect(screen.getByText("Fresh Vault")).toBeInDocument();
    });

    // Now resolve the stale request and confirm it does not clobber the fresh
    // result.
    resolveFirst();
    await waitFor(() => {
      expect(screen.queryByText("Stale Vault")).not.toBeInDocument();
    });
    expect(screen.getByText("Fresh Vault")).toBeInDocument();
  });

  test("memoized VaultCard does not re-render when an ancestor re-renders", async () => {
    const spy = vi.spyOn(VaultCard, "type");

    const safeDeadline = new Date(Date.now() + 30 * 86_400_000).toISOString();
    // Names deliberately avoid the dashboard fixtures (ACTIVITY/DEADLINES
    // already contain a vault called "Alpha Vault").
    mockedListVaults.mockResolvedValueOnce([
      buildVault({ id: "1", name: "Memo Vault One", deadline: safeDeadline }),
      buildVault({ id: "2", name: "Memo Vault Two", deadline: safeDeadline }),
    ]);

    function Ancestor() {
      const [count, setCount] = useState(0);
      return (
        <div>
          <button onClick={() => setCount((c) => c + 1)}>
            Re-render ancestor ({count})
          </button>
          <Dashboard />
        </div>
      );
    }

    render(
      <MemoryRouter>
        <Ancestor />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText("Memo Vault One progress"),
      ).toBeInTheDocument(),
    );

    const rendersAfterMount = spy.mock.calls.length;
    expect(rendersAfterMount).toBe(2);

    fireEvent.click(
      screen.getByRole("button", { name: /Re-render ancestor/i }),
    );

    // The ancestor's state change re-renders Dashboard, but each VaultCard
    // receives identical props and must not re-render.
    expect(spy.mock.calls.length).toBe(rendersAfterMount);

    spy.mockRestore();
  });
});
