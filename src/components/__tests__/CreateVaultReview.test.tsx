import { ACCOUNT_A, ACCOUNT_B, ACCOUNT_C } from '@/__tests__/fixtures/stellarAddresses';
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateVaultReview } from "../CreateVaultReview";
import userEvent from "@testing-library/user-event";

describe("CreateVaultReview", () => {
  it("renders the vault summary and token-styled address details", () => {
    const successAddress = ACCOUNT_A;
    const failureAddress = ACCOUNT_B;
    const verifierAddress = ACCOUNT_C;

    render(
      <CreateVaultReview
        amount="100.1234567"
        deadline="2030-01-01T00:00"
        successAddress={successAddress}
        failureAddress={failureAddress}
        verifierAddress={verifierAddress}
        milestones={[
          {
            title: "Design approved",
            criteria: "Verifier signs the design handoff",
          },
          {
            title: "Launch ready",
            criteria: "Deployment checklist is complete",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /review vault details/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("100.1234567")).toBeInTheDocument();
    expect(screen.getByText("2030-01-01T00:00")).toBeInTheDocument();
    expect(screen.getByTitle(successAddress)).toBeInTheDocument();
    expect(screen.getByTitle(failureAddress)).toBeInTheDocument();
    expect(screen.getByText("Verifier address")).toBeInTheDocument();
    expect(screen.getByText("Milestones")).toBeInTheDocument();
    expect(screen.getByText("Design approved")).toBeInTheDocument();
    expect(
      screen.getByText("Verifier signs the design handoff"),
    ).toBeInTheDocument();
    expect(screen.getByText("Launch ready")).toBeInTheDocument();
    expect(
      screen.getByText("Deployment checklist is complete"),
    ).toBeInTheDocument();
  });

  it("keeps the legacy single milestone prop rendering", () => {
    render(
      <CreateVaultReview
        amount="100"
        deadline="2030-01-01T00:00"
        successAddress={ACCOUNT_A}
        failureAddress={ACCOUNT_B}
        milestone="Deliverables approved"
      />,
    );

    expect(screen.getByText("Milestones")).toBeInTheDocument();
    expect(screen.getByText("Deliverables approved")).toBeInTheDocument();
  });

  it("disables buttons and sets aria-disabled and aria-busy when isSubmitting is true", () => {
    render(
      <CreateVaultReview
        amount="100"
        deadline="2030-01-01T00:00"
        successAddress={ACCOUNT_A}
        failureAddress={ACCOUNT_B}
        isSubmitting={true}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: /submitting\.\.\./i });
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn).toHaveAttribute("aria-disabled", "true");
    
    const backBtn = screen.getByRole("button", { name: /back to edit/i });
    expect(backBtn).toBeDisabled();
    expect(backBtn).toHaveAttribute("aria-disabled", "true");

    const container = confirmBtn.closest("div[aria-busy='true']");
    expect(container).toBeInTheDocument();
  });

  it("shows error alert with assertive aria-live when error prop is provided", () => {
    const errorMsg = "Wrong network";
    render(
      <CreateVaultReview
        amount="100"
        deadline="2030-01-01T00:00"
        successAddress={ACCOUNT_A}
        failureAddress={ACCOUNT_B}
        error={errorMsg}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(errorMsg);
    expect(alert).toHaveAttribute("aria-live", "assertive");
  });

  it("renders invariant error when required data is missing", () => {
    render(
      <CreateVaultReview
        amount=""
        deadline=""
        successAddress=""
        failureAddress=""
      />
    );

    expect(screen.getByRole("heading", { name: /incomplete vault details/i })).toBeInTheDocument();
    expect(screen.getByText(/missing required vault details/i)).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(screen.getByRole("button", { name: /back to edit/i })).toBeInTheDocument();
  });

  it("calls onConfirm and onBack correctly", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    
    render(
      <CreateVaultReview
        amount="100"
        deadline="2030-01-01T00:00"
        successAddress={ACCOUNT_A}
        failureAddress={ACCOUNT_B}
        onConfirm={onConfirm}
        onBack={onBack}
      />
    );

    await user.click(screen.getByRole("button", { name: /confirm vault/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /back to edit/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
