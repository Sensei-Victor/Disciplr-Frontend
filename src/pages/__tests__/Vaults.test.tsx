import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";
import Vaults, { VaultsInner } from "../../pages/Vaults";
import VaultCard from "../../components/VaultCard";
import type { Vault } from "../../types/vault";

// Helper to mock fetch function
const mockSuccess = <T,)=(data: T) => vi.fn().mockResolvedValue(data);
const mockFailure = (message = "Network error") =>
  vi.fn().mockRejected(new Error(message));

function CreateVaultStateProbe() {
  const location = useLocation();
  return (
    <pre data-testid="create-vault-state">
      {JSON.stringify(location.state ?? {})}
    </pre>
  );
}

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Mock matchMedia for Tooltip
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("Vaults page states", () => {
  beforEach(() => {
    localStorageMock.clear();
  });

  test("shows loading skeletons initially", async () => {
    render(<Vaults fetchVaults={mockSuccess([])} />);
    // Skeletons should be present immediately
    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
    // Wait for loading to finish (no data)
    await waitFor(() =>
      expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument(),
    );
  });

  test("shows empty state when no vaults", async () => {
    render(<Vaults fetchVaults={mockSuccess([])} />);
    await waitFor(() => screen.getByText(/You don’t have any vaults yet./i));
    expect(
      screen.getByRole("link", { name: /Create your first vault/i }),
    ).toBeInTheDocument();
  });

  test("shows data state when vaults exist", async () => {
    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as const,
        deadline: "2025-01-01T00:00:00Z",
      },
    ];
    render(<Vaults fetchVaults={mockSuccess(mockData)} />);
    await waitFor(() => screen.getByText("Test Vault"));
    expect(screen.getByText(/Test Vault/i)).toBeInTheDocument();
  });

  test("duplicate action navigates to CreateVault with prefilled state", async () => {
    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as const,
        deadline: "2025-01-01T00:00:00Z",
        successAddress: "GSUCC3KQKM4XNQPBEZMXPOLKQKM4NQPBEZMXPOLKQKK",
        failureAddress: "GFAIL3KQKM4XPQBEZMXPOLKQKM4XNQPBEZMXPOLKQKK",
        milestones: [{ title: "Milestone A", criteria: "Criteria A" }],
        createdAt: "2024-01-01T00:00:00Z",
        creatorAddress: "GCREA3KQKM4XPQBEZMXPOLKQKM4XNQPBEZMXPOLKQKK",
        contractAddress: "GCONT3KQKM4XPQBEZMXPOLKQKM4XNQPBEZMXPOLKQKK",
        transactions: [],
      },
    ];

    render(
      <MemoryRouter initialEntries={["/vaults"]}>
        <Routes>
          <Route
            path="/vaults"
            element={<VaultsInner fetchVaults={mockSuccess(mockData)} />}
          />
          <Route path="/vaults/create" element={<CreateVaultStateProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText("Test Vault"));
    await userEvent.click(screen.getByRole("link", { name: /duplicate/i }));

    const state = JSON.parse(
      screen.getByTestId("create-vault-state").textContent ?? "{}",
    );
    expect(state.createVaultPrefill).toMatchObject({
      sourceVaultId: "1",
      sourceVaultName: "Test Vault",
      amount: "1000",
      successAddress: "GSUCC3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQKK",
      failureAddress: "GFAIL3KQKM4XPQBEZMXPOLKQKM4XNQPBEZMXPOLKQKK",
      milestones: [{ title: "Milestone A", criteria: "Criteria A" }],
    });
    expect(state.createVaultPrefill).not.toHaveProperty("deadline");
  });

  test("shows error state and can retry", async () => {
    const fetchMock = mockFailure();
    render(<Vaults fetchVaults={fetchMock} />);
    await waitFor(() => screen.getByText(/Failed to load vaults./i));
    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    expect(retryBtn).toBeInTheDocument();
    // Mock success on retry
    fetchMock.mockImplementationOnce(() => Promise.resolve([]));
    await userEvent.click(retryBtn);
    await waitFor(() => screen.getByText(/You don’t have any vaults yet./i));
  });
});

describe("Vaults view toggle", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  test("defaults to list view when no preference exists", async () => {
    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as any,
        deadline: "2025-01-01T00:00:00Z",
        milestones: [],
      },
    ];
    render(<Vaults fetchVaults={mockSuccess(mockData)} />);
    await waitFor(() => screen.getByText("Test Vault"));

    const listButton = screen.getByRole("radio", { name: "List" });
    const gridButton = screen.getByRole("radio", { name: "Grid" });

    expect(listButton).toHaveAttribute("aria-checked", "true");
    expect(gridButton).toHaveAttribute("aria-checked", "false");
  });

  test("switches to grid view when grid button is clicked", async () => {
    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as any,
        deadline: "2025-01-01T00:00:00Z",
        milestones: [],
      },
    ];
    render(<Vaults fetchVaults={mockSuccess(mockData)} />);
    await waitFor(() => screen.getByText("Test Vault"));

    const gridButton = screen.getByRole("radio", { name: "Grid" });
    await userEvent.click(gridButton);

    await waitFor(() =>
      expect(gridButton).toHaveAttribute("aria-checked", "true"),
    );
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute(
        "aria-checked",
        "false",
      ),
    );
  });

  test("switches back to list view when list button is clicked", async () => {
    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as any,
        deadline: "2025-01-01T00:00:00Z",
        milestones: [],
      },
    ];
    render(<Vaults fetchVaults={mockSuccess(mockData)} />);
    await waitFor(() => screen.getByText("Test Vault"));

    const gridButton = screen.getByRole("radio", { name: "Grid" });
    await userEvent.click(gridButton);

    const listButton = screen.getByRole("radio", { name: "List" });
    await userEvent.click(listButton);

    await waitFor(() =>
      expect(listButton).toHaveAttribute("aria-checked", "true"),
    );
    await waitFor(() =>
      expect(gridButton).toHaveAttribute("aria-checked", "false"),
    );
  });

  test("persists grid view preference to localStorage", async () => {
    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as any,
        deadline: "2025-01-01T00:00:00Z",
        milestones: [],
      },
    ];
    render(<Vaults fetchVaults={mockSuccess(mockData)} />);
    await waitFor(() => screen.getByText("Test Vault"));

    const gridButton = screen.getByRole("radio", { name: "Grid" });
    await userEvent.click(gridButton);

    await waitFor(() =>
      expect(gridButton).toHaveAttribute("aria-checked", "true"),
    );
    expect(localStorageMock.getItem("vaults-view-preference")).toBe("grid");
  });

  test("persists list view preference to localStorage", async () => {
    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as any,
        deadline: "2025-01-01T00:00:00Z",
        milestones: [],
      },
    ];
    render(<Vaults fetchVaults={mockSuccess(mockData)} />);
    await waitFor(() => screen.getByText("Test Vault"));

    const gridButton = screen.getByRole("radio", { name: "Grid" });
    await userEvent.click(gridButton);

    const listButton = screen.getByRole("radio", { name: "List" });
    await userEvent.click(listButton);

    await waitFor(() =>
      expect(listButton).toHaveAttribute("aria-checked", "true"),
    );
    expect(localStorageMock.getItem("vaults-view-preference")).toBe("list");
  });

  test("loads grid view from localStorage preference", async () => {
    localStorageMock.setItem("vaults-view-preference", "grid");

    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as any,
        deadline: "2025-01-01T00:00:00Z",
        milestones: [],
      },
    ];
    render(<Vaults fetchVaults={mockSuccess(mockData)} />);
    await waitFor(() => screen.getByText("Test Vault"));

    const gridButton = screen.getByRole("radio", { name: "Grid" });
    const listButton = screen.getByRole("radio", { name: "List" });

    expect(gridButton).toHaveAttribute("aria-checked", "true");
    expect(listButton).toHaveAttribute("aria-checked", "false");
  });

  test("shows empty state in both views", async () => {
    render(<Vaults fetchVaults={mockSuccess([])} />);
    await waitFor(() => screen.getByText(/You don’t have any vaults yet./i));

    // Toggle buttons should still be present
    expect(screen.getByRole("radio", { name: "List" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Grid" })).toBeInTheDocument();
  });

  test("renders vaults VaultCard in grid view", async () => {
    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as any,
        deadline: "2025-01-01T00:00:00Z",
        milestones: [],
      },
    ];
    render(<Vaults fetchVaults={mockSuccess(mockData)} />);
    await waitFor(() => screen.getByText("Test Vault"));

    const gridButton = screen.getByRole("radio", { name: "Grid" });
    await userEvent.click(gridButton);

    // VaultCard should be rendered with progress bar
    await waitFor(() => screen.getByLabelText(/Test Vault progress/i));
  });

  test("memoized VaultCard does not re-render when unrelated Vaults state changes", async () => {
    const spy = vi.spyOn(VaultCard, "type");

    const mockData = [
      {
        id: "1",
        name: "Alpha Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as const,
        deadline: "2025-06-01T00:00:00Z",
        milestones: [],
      },
      {
        id: "2",
        name: "Beta Vault",
        amount: 2000,
        currency: "USDC",
        status: "active" as const,
        deadline: "2025-09-01T00:00:00Z",
        milestones: [],
      },
    ];

    render(<Vaults fetchVaults={mockSuccess(mockData)} />);
    await waitFor(() => screen.getByText("Alpha Vault"));

    // Grid view is the only view that renders VaultCard.
    await userEvent.click(screen.getByRole("radio", { name: "Grid" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Alpha Vault progress")).toBeInTheDocument(),
    );

    const rendersAfterMount = spy.mock.calls.length;
    expect(rendersAfterMount).toBe(mockData.length);

    // Toggling the sort direction re-renders the page from its own state,
    // without changing any individual card's props, so every memoized
    // VaultCard must bail out instead of re-rendering.
    await userEvent.click(screen.getByRole("button", { name: /sort/i }));

    expect(spy.mock.calls.length).toBe(rendersAfterMount);

    spy.mockRestore();
  });

  test("handles localStorage errors gracefully", async () => {
    // Mock localStorage to throw error
    const originalGetItem = localStorageMock.getItem;
    localStorageMock.getItem = vi.fn(() => {
      throw new Error("localStorage error");
    });

    const mockData = [
      {
        id: "1",
        name: "Test Vault",
        amount: 1000,
        currency: "USDC",
        status: "active" as any,
        deadline: "2025-01-01T00:00:00Z",
        milestones: [],
      },
    ];
    render(<Vaults fetchVaults={mockSuccess(mockData)} />);

    // Should still render with default list view
    await waitFor(() => screen.getByText("Test Vault"));
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    localStorageMock.getItem = originalGetItem;
  });
});

describe("Vaults filter and sort", () => {
  const vaults: Vault[] = [
    {
      id: "1",
      name: "Alpha Project",
      amount: 500,
      currency: "USDC",
      status: "active",
      deadline: "2025-06-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
      creatorAddress: "GCREA3KQKM4XNQPBEZMXPOLKQK4XNQPBEZMXPOLKQKK",
      successAddress: "GSUCC3KQKM4XNQPBEZMXPOLKQK4XNQPBEZMXPOLKQKK",
      failureAddress: "GFAIL3KQKM4XNQPBEZMXPOLKQK4XNQPBEZMXPOLKQKK",
      contractAddress: "GCONT3KQKM4XNQPBEZMXPOLKQKK4XNQPBEZMXPOLKQK",
      milestones: [],
      transactions: [],
    },
    {
      id: "2",
      name: "Beta Project",
      amount: 1500,
      currency: "USDC",
      status: "completed",
      deadline: "2025-03-01T00:00:00Z",
      milestones: [],
    },
    {
      id: "3",
      name: "Gamma Project",
      amount: 2500,
      currency: "USDC",
      status: "failed",
      deadline: "2025-01-15T00:00:00Z",
      milestones: [],
      transactions: [],
    },
  ];

  test("filters by status", async () => {
    render(<Vaults fetchVaults={mockSuccess(vaults)} />);
    await waitFor(() => screen.getByText("Alpha Project"));

    const statusFilter = screen.getByLabelText(/status/i);
    await userEvent.selectOptions(statusFilter, "active");

    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeInTheDocument();
      expect(screen.queryByText("Beta Project")).not.toBeInTheDocument();
    });
  });

  test("searches by name", async () => {
    render(<Vaults fetchVaults={mockSuccess(vaults)} />);
    await waitFor(() => screen.getByText("Alpha Project"));

    const searchInput = screen.getByPlaceholderText(/search/i);
    await userEvent.type(searchInput, "Beta");

    await waitFor(() => {
      expect(screen.getByText("Beta Project")).toBeInTheDocument();
      expect(screen.queryByText("Alpha Project")).not.toBeInTheDocument();
    });
  });

  test("sorts by amount descending", async () => {
    render(<Vaults fetchVaults={mockSuccess(vaults)} />);
    await waitFor(() => screen.getByText("Alpha Project"));

    const sortSelect = screen.getByLabelText(/sort/i);
    await userEvent.selectOptions(sortSelect, "amount-desc");

    await waitFor(() => {
      const cards = screen.getAllByTestId("vault-card");
      expect(cards[0]).toHaveTextContent(/Gamma Project/i);
    });
  });
});
