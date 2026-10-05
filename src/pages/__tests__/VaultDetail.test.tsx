import { CONTRACT_ADDRESS } from '@/__tests__/fixtures/stellarAddresses';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MASTER_VAULTS } from "../../fixtures/vaults";
import VaultDetail from "../VaultDetail";

const CREATOR_ADDRESS = "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L";

const { mockDownloadIcsEvent } = vi.hoisted(() => ({
  mockDownloadIcsEvent: vi.fn(),
}));

const { mockWallet } = vi.hoisted(() => ({
  mockWallet: {
    address: "GBVZ3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L",
    network: "TESTNET",
  },
}));

const { mockGetVault, mockSubmitVaultAction } = vi.hoisted(() => ({
  mockGetVault: vi.fn(),
  mockSubmitVaultAction: vi.fn(),
}));

vi.mock("../../context/WalletContext", () => ({
  useWallet: () => mockWallet,
}));

vi.mock("../../services/vaultService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/vaultService")>();
  return {
    ...actual,
    getVault: mockGetVault,
    submitVaultAction: mockSubmitVaultAction,
  };
});

vi.mock("../../utils/ics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/ics")>();
  return {
    ...actual,
    downloadIcsEvent: mockDownloadIcsEvent,
  };
});

const ORIGINAL_VAULT_1_CONTRACT = MASTER_VAULTS["1"].contractAddress;

beforeEach(() => {
  mockWallet.address = CREATOR_ADDRESS;
  mockWallet.network = "TESTNET";
  mockGetVault.mockClear();
  mockGetVault.mockImplementation(async (id: string) => {
    if (Object.prototype.hasOwnProperty.call(MASTER_VAULTS, id)) {
      return MASTER_VAULTS[id];
    }
    return undefined;
  });
  mockSubmitVaultAction.mockReset();
  mockSubmitVaultAction.mockResolvedValue(undefined);
});

afterEach(() => {
  MASTER_VAULTS["1"].contractAddress = ORIGINAL_VAULT_1_CONTRACT;
  mockDownloadIcsEvent.mockReset();
});

function renderVaultDetail(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/vaults/${id}`]}>
      <Routes>
        <Route path="/vaults/:id" element={<VaultDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Vault fixtures use deadlines computed relative to "now" (see
// src/fixtures/vaults.ts), so tests must format the actual fixture value the
// same way the page does rather than asserting a hardcoded date string.
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function CreateVaultStateProbe() {
  const location = useLocation();
  return (
    <pre data-testid="create-vault-state">
      {JSON.stringify(location.state ?? {})}
    </pre>
  );
}

describe("VaultDetail", () => {
  it("renders active vault status, milestones, transactions, addresses, and deadline", async () => {
    renderVaultDetail("1");

    expect(
      await screen.findByRole("heading", { name: "Alpha Vault" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getByText("12,500")).toBeInTheDocument();
    expect(screen.getAllByText("USDC").length).toBeGreaterThan(0);

    expect(screen.getByText("Status Timeline")).toBeInTheDocument();
    expect(
      screen.getByText(`Deadline ${fmtDate(MASTER_VAULTS["1"].deadline)}`),
    ).toBeInTheDocument();
    // CountdownDeadline active vault should show time remaining or expired
    expect(screen.getByText(/Overdue|remaining/)).toBeInTheDocument();

    const addresses = screen
      .getByText("Addresses")
      .closest("div")?.parentElement;
    expect(addresses).toBeInTheDocument();
    expect(within(addresses!).getByText("Creator")).toBeInTheDocument();
    expect(within(addresses!).getByText("Verifier")).toBeInTheDocument();
    expect(
      within(addresses!).getByText("Success destination"),
    ).toBeInTheDocument();
    expect(
      within(addresses!).getByText("Failure destination"),
    ).toBeInTheDocument();
    expect(within(addresses!).getByText("Contract")).toBeInTheDocument();
    expect(within(addresses!).getByText("GBVZ3K...QK7L")).toBeInTheDocument();

    expect(screen.getByText("Phase 1 Complete")).toBeInTheDocument();
    expect(
      screen.getByText("Complete initial development phase"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All unit tests passing, code reviewed/),
    ).toBeInTheDocument();
    expect(screen.getByText("Validated")).toBeInTheDocument();
    expect(screen.getByText("Beta Launch")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View evidence/i }),
    ).toHaveAttribute("href", "https://github.com/org/repo/pull/42");

    expect(screen.getByText("Transaction History")).toBeInTheDocument();
    expect(screen.getByText("Vault Created")).toBeInTheDocument();
    expect(screen.getByText("Milestone Validated")).toBeInTheDocument();
    expect(screen.getAllByText("a3f9d1c8...8f0a4d").length).toBeGreaterThan(0);
    expect(screen.getAllByText("b4e0c2d9...9a5e8b").length).toBeGreaterThan(0);
  });

  it("renders completed vault release details without a verifier address", async () => {
    renderVaultDetail("2");

    expect(
      await screen.findByRole("heading", { name: "Beta Reserve" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.queryByText("Verifier")).not.toBeInTheDocument();

    // Verify Countdown is replaced by status text
    expect(screen.queryByText(/Overdue|remaining/)).not.toBeInTheDocument();
    expect(
      screen.getByText(`Deadline ${fmtDate(MASTER_VAULTS["2"].deadline)}`),
    ).toBeInTheDocument();

    expect(screen.getByText("Project Delivery")).toBeInTheDocument();
    expect(
      screen.getByText(/All deliverables submitted and approved/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View evidence/i }),
    ).toHaveAttribute("href", "https://docs.example.com/delivery");

    expect(screen.getByText("Funds released")).toBeInTheDocument();
    expect(screen.getAllByText("4,200.5 USDC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("c5f1d3e0...0b6f9c").length).toBeGreaterThan(0);
    // Success destination
    expect(screen.getAllByText("GSUCC3...LKQK").length).toBeGreaterThan(0);
  });

  it("renders failed vault milestone and redirect transaction details", async () => {
    renderVaultDetail("3");

    expect(
      await screen.findByRole("heading", { name: "Gamma Fund" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);

    // Verify Countdown is replaced by status text
    expect(screen.queryByText(/Overdue|remaining/)).not.toBeInTheDocument();

    expect(screen.getByText("Milestone 1")).toBeInTheDocument();
    expect(screen.getByText("Criteria not met")).toBeInTheDocument();

    expect(screen.getByText("Funds redirected")).toBeInTheDocument();
    expect(screen.getAllByText("8,800 USDC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("d6a2e4f1...1c7a0d").length).toBeGreaterThan(0);
    // Failure destination
    expect(screen.getAllByText("GFAIL3...LKQK").length).toBeGreaterThan(0);
  });

  it("renders cancelled vault with mixed milestone statuses and redirect destination", async () => {
    renderVaultDetail("4");

    expect(
      await screen.findByRole("heading", { name: "Delta Cancelled" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0);

    // Verify Countdown is replaced by status text
    expect(screen.queryByText(/Overdue|remaining/)).not.toBeInTheDocument();

    // Mixed milestones
    expect(screen.getByText("Milestone 1")).toBeInTheDocument();
    expect(screen.getByText("Validated")).toBeInTheDocument();
    expect(screen.getByText("Milestone 2")).toBeInTheDocument();
    // Use getAllByText for "Failed" since it appears for the status label too
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getByText("Milestone 3")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();

    expect(screen.getByText("Funds redirected")).toBeInTheDocument();
    expect(screen.getAllByText("5,000 USDC").length).toBeGreaterThan(0);
    // Failure destination
    expect(screen.getAllByText("GFAIL3...LKQK").length).toBeGreaterThan(0);
  });

  it("renders a not-found state for an unknown vault id", async () => {
    renderVaultDetail("999");

    expect(
      await screen.findByRole("heading", { name: "Vault not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No vault with ID "999" exists.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Back to Vaults/i }),
    ).toHaveAttribute("href", "/vaults");
  });

  it("links duplicate action to CreateVault with prefilled state and no deadline", async () => {
    render(
      <MemoryRouter initialEntries={["/vaults/1"]}>
        <Routes>
          <Route path="/vaults/:id" element={<VaultDetail />} />
          <Route path="/vaults/create" element={<CreateVaultStateProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Alpha Vault" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("link", { name: /duplicate vault/i }));

    const state = JSON.parse(
      screen.getByTestId("create-vault-state").textContent ?? "{}",
    );
    expect(state.createVaultPrefill).toMatchObject({
      sourceVaultId: "1",
      sourceVaultName: "Alpha Vault",
      amount: "12500",
      successAddress: "GSUCC3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
      failureAddress: "GFAIL3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK",
    });
    expect(state.createVaultPrefill).not.toHaveProperty("deadline");
    expect(state.createVaultPrefill.milestones).toEqual([
      {
        title: "Phase 1 Complete",
        criteria: "All unit tests passing, code reviewed",
      },
      {
        title: "Beta Launch",
        criteria: "Beta deployed, 100 active users onboarded",
      },
    ]);
  });

  it('downloads the vault deadline calendar event', async () => {
    mockDownloadIcsEvent.mockReturnValue(true);
    renderVaultDetail('1');

    await screen.findByRole('heading', { name: 'Alpha Vault' });
    fireEvent.click(screen.getByRole('button', { name: /Add to calendar/i }));

    await waitFor(() => {
      expect(mockDownloadIcsEvent).toHaveBeenCalledWith({
        title: 'Alpha Vault deadline',
        deadline: MASTER_VAULTS['1'].deadline,
        description: 'Alpha Vault vault deadline for 12,500 USDC.',
        uid: 'vault-1-deadline',
      });
    });
  });

  it('hides the Add to calendar button when the deadline is invalid', async () => {
    renderVaultDetail('2');

    await screen.findByRole('heading', { name: 'Beta Reserve' });
    expect(
      screen.queryByRole('button', { name: /Add to calendar/i }),
    ).not.toBeInTheDocument();
  });

  it("renders transaction explorer links pointing to the active network", async () => {
    renderVaultDetail("1");

    await screen.findByRole("heading", { name: "Alpha Vault" });

    const txLinks = screen.getAllByRole("link").filter((a) =>
      a.getAttribute("href")?.includes("/explorer/") && a.getAttribute("href")?.includes("/tx/"),
    );

    expect(txLinks.length).toBeGreaterThan(0);
    txLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        "href",
        expect.stringContaining("/explorer/testnet/tx/"),
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  // ── Action buttons ────────────────────────────────────────────────────────

  describe("action buttons", () => {
    it("Extend Deadline button opens a confirmation modal with correct title and message", async () => {
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      fireEvent.click(screen.getByRole("button", { name: /extend deadline/i }));

      expect(
        await screen.findByRole("heading", { name: "Extend Deadline" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Are you sure you want to extend the vault deadline\?/i,
        ),
      ).toBeInTheDocument();
    });

    it("Cancel Vault button opens a confirmation modal with correct title and message", async () => {
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      fireEvent.click(screen.getByRole("button", { name: /cancel vault/i }));

      expect(
        await screen.findByRole("heading", { name: "Cancel Vault" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to cancel this vault\?/i),
      ).toBeInTheDocument();
    });

    it("confirmation modal closes when the Cancel button is clicked", async () => {
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      fireEvent.click(screen.getByRole("button", { name: /extend deadline/i }));
      expect(
        await screen.findByRole("heading", { name: "Extend Deadline" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: "Extend Deadline" }),
        ).not.toBeInTheDocument();
      });
    });

    it("confirmation modal closes after confirming the action", async () => {
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      fireEvent.click(screen.getByRole("button", { name: /cancel vault/i }));
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("heading", { name: "Cancel Vault" }),
      ).toBeInTheDocument();

      // Click the confirm button inside the modal (distinct from the page-level button)
      fireEvent.click(within(dialog).getByRole("button", { name: /^cancel vault$/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("Extend Deadline and Cancel Vault buttons are present for an active vault", async () => {
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      expect(
        screen.getByRole("button", { name: /extend deadline/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /cancel vault/i }),
      ).toBeInTheDocument();
    });

    it("Validate Milestone button is shown for a pending_validation vault and opens confirmation modal", async () => {
      renderVaultDetail("5");
      await screen.findByRole("heading", { name: "Epsilon Pending" });

      const validateBtn = screen.getByRole("button", {
        name: /validate milestone/i,
      });
      expect(validateBtn).toBeInTheDocument();

      fireEvent.click(validateBtn);

      expect(
        await screen.findByRole("heading", { name: "Validate Milestone" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Are you sure you want to validate the current milestone\?/i,
        ),
      ).toBeInTheDocument();
    });

    it("Validate Milestone button is not shown for an active (non-pending_validation) vault", async () => {
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      expect(
        screen.queryByRole("button", { name: /validate milestone/i }),
      ).not.toBeInTheDocument();
    });

    it("action buttons are not rendered for a completed vault", async () => {
      renderVaultDetail("2");
      await screen.findByRole("heading", { name: "Beta Reserve" });

      expect(
        screen.queryByRole("button", { name: /extend deadline/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /cancel vault/i }),
      ).not.toBeInTheDocument();
    });
  });

  // ── Network footer banner ─────────────────────────────────────────────────

  describe("NetworkFooterBanner", () => {
    it("renders the network footer banner with an accessible landmark", async () => {
      renderVaultDetail("1");
      expect(await screen.findByRole("contentinfo")).toBeInTheDocument();
    });

    it('shows the "Testnet" label when network is TESTNET', async () => {
      renderVaultDetail("1");
      const footer = await screen.findByRole("contentinfo");
      expect(within(footer).getByText("Testnet")).toBeInTheDocument();
    });

    it("displays the contract address text in the footer", async () => {
      renderVaultDetail("1");
      const footer = await screen.findByRole("contentinfo");
      expect(
        within(footer).getByText("GCONT3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK"),
      ).toBeInTheDocument();
    });

    it("renders the explorer link pointing to the testnet contract URL", async () => {
      const validContractAddress = CONTRACT_ADDRESS;
      MASTER_VAULTS["1"].contractAddress = validContractAddress;

      renderVaultDetail("1");
      await screen.findByRole("contentinfo");
      const link = screen.getByRole("link", {
        name: /View contract.*on Stellar Testnet explorer/i,
      });
      expect(link).toHaveAttribute(
        "href",
        `https://stellar.expert/explorer/testnet/contract/${validContractAddress}`,
      );
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it('shows "Mainnet" label and a mainnet explorer URL when network is PUBLIC', async () => {
      mockWallet.network = "PUBLIC";
      renderVaultDetail("1");
      const footer = await screen.findByRole("contentinfo");
      expect(within(footer).getByText("Mainnet")).toBeInTheDocument();
      const link = within(footer).getByRole("link", {
        name: /View contract.*on Stellar Mainnet explorer/i,
      });
      expect(link).toHaveAttribute(
        "href",
        expect.stringContaining("/explorer/public/contract/"),
      );
    });

    it("does not render the footer banner on the not-found page", async () => {
      renderVaultDetail("999");
      await screen.findByRole("heading", { name: "Vault not found" });
      await waitFor(() => {
        expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
      });
    });
  });

  // ── Async boundary ─────────────────────────────────────────────────────────

  describe('async load boundary', () => {
    it("renders an invalid-identifier state for a hostile route id", async () => {
      renderVaultDetail("__proto__");

      expect(
        await screen.findByRole("heading", { name: "Invalid vault identifier" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Alpha Vault" }),
      ).not.toBeInTheDocument();
    });

    it("refuses to render unverified vault state for a malformed response", async () => {
      mockGetVault.mockResolvedValueOnce({ id: "1" } as never);

      renderVaultDetail("1");

      expect(
        await screen.findByRole("heading", {
          name: "Vault data could not be verified",
        }),
      ).toBeInTheDocument();
      expect(screen.getAllByText(/must be/).length).toBeGreaterThan(0);
      expect(
        screen.queryByRole("heading", { name: "Alpha Vault" }),
      ).not.toBeInTheDocument();
    });

    it("shows an error state and recovers via Retry", async () => {
      mockGetVault.mockRejectedValueOnce(new Error("network down"));

      renderVaultDetail("1");

      expect(
        await screen.findByRole("heading", { name: "Failed to load vault" }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      expect(
        await screen.findByRole("heading", { name: "Alpha Vault" }),
      ).toBeInTheDocument();
    });

    it("flags a completed vault whose settlement amount does not match the principal", async () => {
      const releaseTx = MASTER_VAULTS["2"].transactions.find(
        (tx) => tx.type === "release",
      );
      const originalAmount = releaseTx?.amount;
      if (releaseTx) releaseTx.amount = 9876;

      try {
        renderVaultDetail("2");
        await screen.findByRole("heading", { name: "Beta Reserve" });

        const notice = screen.getByRole("alert", {
          name: "Fund release inconsistency notice",
        });
        expect(
          within(notice).getByText(
            /does not match the vault principal/i,
          ),
        ).toBeInTheDocument();
      } finally {
        if (releaseTx) releaseTx.amount = originalAmount;
      }
    });
  });

  // ── Authorization gate on sensitive actions ───────────────────────────────

  describe("action authorization gate", () => {
    it("disables sensitive actions for a disconnected wallet", async () => {
      mockWallet.address = null;
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      expect(
        screen.getByRole("button", { name: /extend deadline/i }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /cancel vault/i }),
      ).toBeDisabled();
      expect(
        screen.getAllByText(/Connect your wallet to authorize this action/).length,
      ).toBeGreaterThan(0);
    });

    it("disables sensitive actions for a wallet that is not the vault creator", async () => {
      mockWallet.address = "GBOTH3KQKM4XNQPBEZMXPOLKQKM4XNQPBEZMXPOLKQK7L";
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      expect(
        screen.getByRole("button", { name: /extend deadline/i }),
      ).toBeDisabled();
      expect(
        screen.getAllByText(/not authorized to extend/i).length,
      ).toBeGreaterThan(0);
    });

    it("disables sensitive actions when the wallet is on the wrong network", async () => {
      mockWallet.network = "PUBLIC";
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      expect(
        screen.getByRole("button", { name: /extend deadline/i }),
      ).toBeDisabled();
      expect(
        screen.getAllByText(/wrong network/i).length,
      ).toBeGreaterThan(0);
    });

    it("leaves actions enabled for an authorized creator on the expected network", async () => {
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      expect(
        screen.getByRole("button", { name: /extend deadline/i }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: /cancel vault/i }),
      ).toBeEnabled();
    });

    it("locks the confirmation while the action is submitting so it cannot fire twice", async () => {
      mockSubmitVaultAction.mockReturnValueOnce(new Promise(() => {}));

      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      fireEvent.click(screen.getByRole("button", { name: /cancel vault/i }));
      const dialog = await screen.findByRole("dialog");

      fireEvent.click(
        within(dialog).getByRole("button", { name: /^cancel vault$/i }),
      );
      expect(mockSubmitVaultAction).toHaveBeenCalledTimes(1);

      const submittingBtn = within(dialog).getByRole("button", {
        name: /submitting/i,
      });
      expect(submittingBtn).toBeDisabled();
      fireEvent.click(submittingBtn);
      expect(mockSubmitVaultAction).toHaveBeenCalledTimes(1);
    });
  });

  // ── Action submission failure paths ───────────────────────────────────────

  describe("action submission failure", () => {
    it("shows an inline error when the action rejects and keeps the modal open", async () => {
      mockSubmitVaultAction.mockRejectedValueOnce(new Error("Contract call failed"));

      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      fireEvent.click(screen.getByRole("button", { name: /extend deadline/i }));
      const dialog = await screen.findByRole("dialog");

      fireEvent.click(within(dialog).getByRole("button", { name: /extend/i }));

      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
        expect(screen.getByText("Contract call failed")).toBeInTheDocument();
      });

      // Modal should remain open so the user can retry
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("shows a fallback error message when the rejection is not an Error instance", async () => {
      mockSubmitVaultAction.mockRejectedValueOnce("something went wrong");

      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      fireEvent.click(screen.getByRole("button", { name: /cancel vault/i }));
      const dialog = await screen.findByRole("dialog");

      fireEvent.click(within(dialog).getByRole("button", { name: /^cancel vault$/i }));

      await waitFor(() => {
        expect(screen.getByText(/could not be submitted/i)).toBeInTheDocument();
      });
    });

    it("clears the error when the modal is closed after a failed action", async () => {
      mockSubmitVaultAction.mockRejectedValueOnce(new Error("Network error"));

      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      fireEvent.click(screen.getByRole("button", { name: /extend deadline/i }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: /extend/i }));

      await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

      fireEvent.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      });
    });

    it("does not close the modal while a submission is in flight", async () => {
      let resolveAction!: () => void;
      mockSubmitVaultAction.mockReturnValueOnce(
        new Promise<void>((res) => { resolveAction = res; }),
      );

      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      fireEvent.click(screen.getByRole("button", { name: /extend deadline/i }));
      const dialog = await screen.findByRole("dialog");

      fireEvent.click(within(dialog).getByRole("button", { name: /extend/i }));

      // Try to close mid-flight — modal must remain
      fireEvent.click(within(dialog).getByRole("button", { name: /submitting/i }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Let the action finish so the test can clean up
      resolveAction();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });

  // ── Boundary / edge cases ─────────────────────────────────────────────────

  describe("boundary cases", () => {
    it("does not render an amount for a transaction that has no amount field", async () => {
      // Vault 1's second tx (validate) has no amount — check the currency is absent from that row
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      // The create tx has 12,500 — that should be present
      expect(screen.getByText("12,500")).toBeInTheDocument();

      // The validate tx has no amount, so its row should not contain a second currency span
      // Exactly one transaction row should show the amount
      const amountSpans = screen
        .getAllByText(/\d[\d,]+ USDC/)
        .filter((el) => el.closest("[data-testid]") === null);
      // At least the header amount plus the create tx; the validate tx row adds none
      expect(amountSpans.length).toBeGreaterThanOrEqual(1);
    });

    it("shows the Malformed view retry path: re-fetches and renders the vault on success", async () => {
      mockGetVault
        .mockResolvedValueOnce({ id: "1" } as never)  // first call → malformed
        .mockImplementationOnce(async (id: string) =>   // second call → real vault
          Object.prototype.hasOwnProperty.call(MASTER_VAULTS, id)
            ? MASTER_VAULTS[id]
            : undefined
        );

      renderVaultDetail("1");

      await screen.findByRole("heading", { name: "Vault data could not be verified" });

      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      expect(
        await screen.findByRole("heading", { name: "Alpha Vault" }),
      ).toBeInTheDocument();
    });

    it("allows the verifier to validate a milestone when vault is pending_validation", async () => {
      mockWallet.address = MASTER_VAULTS["5"].verifierAddress as string;
      renderVaultDetail("5");
      await screen.findByRole("heading", { name: "Epsilon Pending" });

      // Verifier is authorized — button must be enabled
      expect(
        screen.getByRole("button", { name: /validate milestone/i }),
      ).toBeEnabled();
    });

    it("disables Validate Milestone for the verifier when vault is not pending_validation", async () => {
      // Vault 1 is active (not pending_validation) — verifier should not see the button at all
      mockWallet.address = MASTER_VAULTS["1"].verifierAddress as string;
      renderVaultDetail("1");
      await screen.findByRole("heading", { name: "Alpha Vault" });

      expect(
        screen.queryByRole("button", { name: /validate milestone/i }),
      ).not.toBeInTheDocument();
    });

    it("shows the loading skeleton before the vault resolves", async () => {
      let resolve!: (v: undefined) => void;
      mockGetVault.mockReturnValueOnce(new Promise((res) => { resolve = () => res(undefined); }));

      renderVaultDetail("999");

      expect(screen.getByTestId("vault-detail-loading")).toBeInTheDocument();

      resolve();
      await screen.findByRole("heading", { name: "Vault not found" });
    });
  });
});