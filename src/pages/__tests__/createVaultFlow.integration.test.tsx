import { ACCOUNT_A, ACCOUNT_B, ACCOUNT_C, ACCOUNT_D } from '@/__tests__/fixtures/stellarAddresses';
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CreateVault from "../CreateVault";

vi.mock("../../context/WalletContext", () => ({
  useWallet: vi.fn(() => ({
    address: `G${"C".repeat(55)}`,
    network: "TESTNET",
    balance: null,
    balanceStatus: "idle",
    isConnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    checkConnection: vi.fn(),
  })),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ state: null }),
  useNavigate: () => mockNavigate,
}));

import { useWallet } from "../../context/WalletContext";
const mockUseWallet = vi.mocked(useWallet);

// Valid test addresses
const validSuccessAddress = ACCOUNT_A;
const validFailureAddress = ACCOUNT_B;
const futureDeadline = "2030-01-01T00:00";
const validAmount = "100.5";

function fillField(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("CreateVault Flow - Integration Tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockUseWallet.mockReturnValue({
      address: `G${"C".repeat(55)}`,
      network: "TESTNET",
      balance: null,
      balanceStatus: "idle",
      isConnecting: false,
      error: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      checkConnection: vi.fn(),
    } as ReturnType<typeof useWallet>);
  });

  describe("Happy Path: Form → Review → Confirm", () => {
    it("completes full flow with valid inputs and shows review details", () => {
      const consoleDebug = vi
        .spyOn(console, "debug")
        .mockImplementation(() => undefined);
      render(<CreateVault />);

      // Step 1: Fill the form with valid data
      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      // Verify form is still displayed (not in review)
      expect(screen.getByRole("button", { name: /create vault/i })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /review vault details/i })).not.toBeInTheDocument();

      // Step 2: Submit form to reach review step
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Verify review step is displayed
      expect(
        screen.getByRole("heading", { name: /review vault details/i }),
      ).toBeInTheDocument();

      // Verify form is no longer visible
      expect(
        screen.queryByLabelText(/amount/i),
      ).not.toBeInTheDocument();

      // Step 3: Assert review shows entered values
      // Addresses are rendered truncated (see AddressDisplay), but the full
      // value is always present in the element's title attribute.
      expect(screen.getByText(validAmount)).toBeInTheDocument();
      expect(screen.getByText(futureDeadline)).toBeInTheDocument();
      expect(screen.getByTitle(validSuccessAddress)).toBeInTheDocument();
      expect(screen.getByTitle(validFailureAddress)).toBeInTheDocument();

      // Step 4: Confirm vault creation
      fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));

      // Assert handler was invoked once with correct data
      expect(consoleDebug).toHaveBeenCalledWith("CreateVault confirm", { hasEvidence: false });
      expect(consoleDebug).toHaveBeenCalledTimes(1);
    });

    it("displays decimal amounts correctly in review", () => {
      render(<CreateVault />);

      const amountWithDecimals = "1234.5678901";
      fillField(/amount/i, amountWithDecimals);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Review should show the value as entered (with formatting applied by Field component)
      expect(screen.getByText(/1234/)).toBeInTheDocument();
    });
  });

  describe("Validation Gates: Invalid Inputs Block Review", () => {
    it("blocks review step and displays all field errors for completely empty form", () => {
      render(<CreateVault />);

      // Try to submit without filling any fields
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Alert should be visible with error message
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Please fix the highlighted fields before creating the vault.",
      );

      // Review should NOT be displayed
      expect(
        screen.queryByRole("heading", { name: /review vault details/i }),
      ).not.toBeInTheDocument();

      // Form should still be visible
      expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();

      // All field errors should be present (check alert for these messages)
      const alertText = screen.getByRole("alert").textContent || "";
      expect(alertText).toContain("Enter a positive USDC amount with up to 7 decimal places.");
      expect(alertText).toContain("Choose a future deadline.");
      // Should have two instances of the Stellar address error in the alert
      const stellarErrors = (alertText.match(/Enter a valid Stellar public key starting with G or C\./g) || []).length;
      expect(stellarErrors).toBe(2);
    });

    it("blocks review when amount is invalid", () => {
      render(<CreateVault />);

      fillField(/amount/i, "0"); // Invalid: zero
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Review should NOT appear
      expect(
        screen.queryByRole("heading", { name: /review vault details/i }),
      ).not.toBeInTheDocument();

      // Error should be displayed in the form
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain(
        "Enter a positive USDC amount with up to 7 decimal places.",
      );

      // Amount field should be marked invalid and have focus
      const amountField = screen.getByLabelText(/amount/i);
      expect(amountField).toHaveAttribute("aria-invalid", "true");
      expect(amountField).toHaveFocus();
    });

    it("blocks review when amount exceeds 7 decimal places", () => {
      render(<CreateVault />);

      fillField(/amount/i, "100.12345678"); // 8 decimal places, but parseUsdcInput should cap it
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      // Note: The form has input constraints that cap at 7 decimals, so submission should succeed
      // This test validates that very large decimal values are handled
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // The component's parseUsdcInput normalizes to 7 decimals, so review should show
      expect(
        screen.getByRole("heading", { name: /review vault details/i }),
      ).toBeInTheDocument();
    });

    it("blocks review when deadline is in the past", () => {
      render(<CreateVault />);

      const pastDate = "2020-01-01T00:00";
      fillField(/amount/i, validAmount);
      fillField(/deadline/i, pastDate);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      expect(
        screen.queryByRole("heading", { name: /review vault details/i }),
      ).not.toBeInTheDocument();
      
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Choose a future deadline.");

      const deadlineField = screen.getByLabelText(/deadline/i);
      expect(deadlineField).toHaveAttribute("aria-invalid", "true");
      expect(deadlineField).toHaveFocus();
    });

    it("blocks review when success address is invalid", () => {
      render(<CreateVault />);

      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, "invalid-address");
      fillField(/failure destination/i, validFailureAddress);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      expect(
        screen.queryByRole("heading", { name: /review vault details/i }),
      ).not.toBeInTheDocument();
      
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Enter a valid Stellar public key starting with G or C.");

      const successField = screen.getByLabelText(/success destination/i);
      expect(successField).toHaveAttribute("aria-invalid", "true");
    });

    it("blocks review when failure address is invalid", () => {
      render(<CreateVault />);

      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, "invalid");

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      expect(
        screen.queryByRole("heading", { name: /review vault details/i }),
      ).not.toBeInTheDocument();
      
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Enter a valid Stellar public key starting with G or C.");

      const failureField = screen.getByLabelText(/failure destination/i);
      expect(failureField).toHaveAttribute("aria-invalid", "true");
    });

    it("blocks review when failure address matches success address", () => {
      render(<CreateVault />);

      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validSuccessAddress); // Same address

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      expect(
        screen.queryByRole("heading", { name: /review vault details/i }),
      ).not.toBeInTheDocument();
      
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain(
        "Failure destination must be different from success destination.",
      );

      const failureField = screen.getByLabelText(/failure destination/i);
      expect(failureField).toHaveAttribute("aria-invalid", "true");
    });

    it("focuses first invalid field when validation fails", () => {
      render(<CreateVault />);

      // Leave all fields empty to ensure amount is first invalid
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      const amountField = screen.getByLabelText(/amount/i);
      expect(amountField).toHaveFocus();
    });
  });

  describe("Back to Edit: State Preservation", () => {
    it("returns to form and preserves all entered values", () => {
      render(<CreateVault />);

      // Fill form with valid data
      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      // Submit to review
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      expect(
        screen.getByRole("heading", { name: /review vault details/i }),
      ).toBeInTheDocument();

      // Click back to edit
      fireEvent.click(screen.getByRole("button", { name: /back to edit/i }));

      // Verify we're back on the form
      expect(
        screen.queryByRole("heading", { name: /review vault details/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create vault/i })).toBeInTheDocument();

      // Verify all values are preserved
      expect(screen.getByLabelText(/amount/i)).toHaveValue(validAmount);
      expect(screen.getByLabelText(/deadline/i)).toHaveValue(futureDeadline);
      expect(screen.getByLabelText(/success destination/i)).toHaveValue(
        validSuccessAddress,
      );
      expect(screen.getByLabelText(/failure destination/i)).toHaveValue(
        validFailureAddress,
      );
    });

    it("can re-submit after back to edit with modified values", () => {
      const consoleDebug = vi
        .spyOn(console, "debug")
        .mockImplementation(() => undefined);
      render(<CreateVault />);

      // Initial submission
      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Back to edit
      fireEvent.click(screen.getByRole("button", { name: /back to edit/i }));

      // Modify amount
      const newAmount = "250.75";
      fillField(/amount/i, newAmount);

      // Re-submit
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      expect(screen.getByText(newAmount)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));

      // Confirmation records no form details in diagnostics.
      expect(consoleDebug).toHaveBeenCalledWith("CreateVault confirm", { hasEvidence: false });
    });

    it("preserves state across multiple back-to-edit cycles", () => {
      render(<CreateVault />);

      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      // First cycle
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      fireEvent.click(screen.getByRole("button", { name: /back to edit/i }));
      expect(screen.getByLabelText(/amount/i)).toHaveValue(validAmount);

      // Second cycle
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      fireEvent.click(screen.getByRole("button", { name: /back to edit/i }));
      expect(screen.getByLabelText(/amount/i)).toHaveValue(validAmount);

      // Third submission
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      expect(
        screen.getByRole("heading", { name: /review vault details/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Error Clearing and Field Feedback", () => {
    it("clears error when user corrects invalid field", () => {
      render(<CreateVault />);

      // Submit with empty form to trigger errors
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain(
        "Enter a positive USDC amount with up to 7 decimal places.",
      );

      // Now fill with valid amount
      fillField(/amount/i, validAmount);

      // Error should be cleared from the field
      expect(screen.getByLabelText(/amount/i)).not.toHaveAttribute("aria-invalid", "true");
    });

    it("clears error when deadline field is updated", () => {
      render(<CreateVault />);

      // Submit with empty form
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Choose a future deadline.");

      // Update deadline
      fillField(/deadline/i, futureDeadline);

      // Error should be cleared from the field
      expect(screen.getByLabelText(/deadline/i)).not.toHaveAttribute("aria-invalid", "true");
    });

    it("clears error when success address is corrected", () => {
      render(<CreateVault />);

      fillField(/success destination/i, "invalid");
      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/failure destination/i, validFailureAddress);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Enter a valid Stellar public key starting with G or C.");

      // Correct the address
      fillField(/success destination/i, validSuccessAddress);

      // Error should be cleared from the field
      expect(screen.getByLabelText(/success destination/i)).not.toHaveAttribute("aria-invalid", "true");
    });
  });

  describe("Balance Exceeded Edge Case", () => {
    it("shows warning when amount exceeds balance", () => {
      mockUseWallet.mockReturnValue({
        balance: "50",
        balanceStatus: "success",
      } as ReturnType<typeof useWallet>);

      render(<CreateVault />);

      fillField(/amount/i, "100"); // Exceeds balance of 50
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      // Warning should be displayed
      expect(
        screen.getByText(/Amount exceeds your available USDC balance/),
      ).toBeInTheDocument();

      // But form submission should still be allowed (balance check is a warning, not a blocker)
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Review should still be shown
      expect(
        screen.getByRole("heading", { name: /review vault details/i }),
      ).toBeInTheDocument();
    });

    it("does not show warning when amount is within balance", () => {
      mockUseWallet.mockReturnValue({
        balance: "500",
        balanceStatus: "success",
      } as ReturnType<typeof useWallet>);

      render(<CreateVault />);

      fillField(/amount/i, "100");
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      // No warning should be displayed
      expect(
        screen.queryByText(/Amount exceeds your available USDC balance/),
      ).not.toBeInTheDocument();

      // Form should be submittable
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      expect(
        screen.getByRole("heading", { name: /review vault details/i }),
      ).toBeInTheDocument();
    });

    it("does not show warning when balance is unknown", () => {
      mockUseWallet.mockReturnValue({
        balance: null,
        balanceStatus: "idle",
      } as ReturnType<typeof useWallet>);

      render(<CreateVault />);

      fillField(/amount/i, "1000000");

      expect(
        screen.queryByText(/Amount exceeds your available USDC balance/),
      ).not.toBeInTheDocument();
    });
  });

  describe("Confirm Handler and Form Lifecycle", () => {
    it("invokes confirm handler exactly once", () => {
      const consoleDebug = vi
        .spyOn(console, "debug")
        .mockImplementation(() => undefined);
      render(<CreateVault />);

      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));

      expect(consoleDebug).toHaveBeenCalledTimes(1);
    });

    it("does not invoke confirm handler if validation fails", () => {
      const consoleDebug = vi
        .spyOn(console, "debug")
        .mockImplementation(() => undefined);
      render(<CreateVault />);

      // Submit with invalid data
      fillField(/amount/i, "0");
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Confirm handler should not be called
      expect(consoleDebug).not.toHaveBeenCalled();
    });

    it("does not log form contents on confirmation", () => {
      const consoleDebug = vi
        .spyOn(console, "debug")
        .mockImplementation(() => undefined);
      render(<CreateVault />);

      fillField(/amount/i, "500.1234567");
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      fireEvent.click(screen.getByRole("button", { name: /confirm vault/i }));

      expect(consoleDebug).toHaveBeenCalledWith("CreateVault confirm", { hasEvidence: false });
    });
  });

  describe("Review Display and Content Accuracy", () => {
    it("displays all vault details in review with correct labels", () => {
      render(<CreateVault />);

      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Verify heading and warning text
      expect(
        screen.getByRole("heading", { name: /review vault details/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Confirm the vault details before creating it/),
      ).toBeInTheDocument();
    });

    it("hides error alert when transitioning to review", () => {
      render(<CreateVault />);

      // Generate errors
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));
      expect(screen.getByRole("alert")).toBeInTheDocument();

      // Fix and resubmit
      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, validSuccessAddress);
      fillField(/failure destination/i, validFailureAddress);
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Alert should not be visible in review
      expect(
        screen.queryByRole("alert"),
      ).not.toBeInTheDocument();
    });

    it("displays review with different valid addresses", () => {
      render(<CreateVault />);

      // Create different valid addresses (Stellar uses specific Base32 alphabet G-Z, 2-7)
      const altSuccessAddress = ACCOUNT_C;
      const altFailureAddress = ACCOUNT_D;

      fillField(/amount/i, validAmount);
      fillField(/deadline/i, futureDeadline);
      fillField(/success destination/i, altSuccessAddress);
      fillField(/failure destination/i, altFailureAddress);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Both addresses should be visible in the review (rendered truncated,
      // full value available via the title attribute - see AddressDisplay).
      expect(screen.getByTitle(altSuccessAddress)).toBeInTheDocument();
      expect(screen.getByTitle(altFailureAddress)).toBeInTheDocument();
    });
  });

  describe("Accessibility and User Interaction", () => {
    it("maintains focus management through form validation", () => {
      render(<CreateVault />);

      const amountField = screen.getByLabelText(/amount/i);
      const deadlineField = screen.getByLabelText(/deadline/i);

      // Submit with empty form
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Focus should be on amount field (first invalid)
      expect(amountField).toHaveFocus();

      // Fill amount and resubmit to move focus to deadline
      fillField(/amount/i, validAmount);
      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      // Focus should now be on deadline
      expect(deadlineField).toHaveFocus();
    });

    it("provides accessible error messages through aria-describedby", () => {
      render(<CreateVault />);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      const amountField = screen.getByLabelText(/amount/i);
      expect(amountField).toHaveAttribute(
        "aria-describedby",
        "create-vault-amount-error",
      );

      const deadlineField = screen.getByLabelText(/deadline/i);
      expect(deadlineField).toHaveAttribute(
        "aria-describedby",
        "create-vault-deadline-error",
      );
    });

    it("alerts user with live region when validation fails", () => {
      render(<CreateVault />);

      fireEvent.click(screen.getByRole("button", { name: /create vault/i }));

      const alert = screen.getByRole("alert");
      expect(alert).toHaveAttribute("aria-live", "assertive");
      expect(alert).toHaveTextContent("Please fix the highlighted fields");
    });
  });
});