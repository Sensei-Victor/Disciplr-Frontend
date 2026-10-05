import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Text } from "../components/Text";
import { Field } from "../components/Field";
import type {
  CreateVaultErrors,
  CreateVaultMilestoneInput,
} from "../utils/vaultValidation";
import {
  exceedsBalance,
  hasCreateVaultErrors,
  validateCreateVault,
} from "../utils/vaultValidation";
import { EvidenceUpload } from "../components/EvidenceUpload";
import { CreateVaultReview } from "../components/CreateVaultReview";
import { formatUsdcInput, parseUsdcInput } from "../utils/usdcInput";
import { logger } from "../utils/logger";
import { useWallet } from "../context/WalletContext";
import {
  DEADLINE_PRESETS,
  computeFutureDeadline,
  getPresetDays,
  getPresetLabel,
} from "../utils/deadlinePresets";
import { getCreateVaultPrefill } from "../utils/vaultPrefill";
import { createVault } from "../services/vaultService";
import { isNetworkMismatch, APP_EXPECTED_NETWORK } from "../utils/networkMismatch";
import { isValidStellarAddress } from "../utils/stellarAddress";

interface MilestoneFormRow extends CreateVaultMilestoneInput {
  id: string;
}

function createMilestoneRow(index: number): MilestoneFormRow {
  return {
    id: `milestone-${Date.now()}-${index}`,
    title: index === 0 ? "Milestone 1" : "",
    criteria: index === 0 ? "Default milestone criteria" : "",
  };
}

export default function CreateVault() {
  const location = useLocation();
  const navigate = useNavigate();
  const prefill = getCreateVaultPrefill(location.state);
  const { balance, balanceStatus, address, network } = useWallet();
  const amountRef = useRef<HTMLInputElement>(null);
  const deadlineRef = useRef<HTMLInputElement>(null);
  const successAddressRef = useRef<HTMLInputElement>(null);
  const failureAddressRef = useRef<HTMLInputElement>(null);
  const milestoneTitleRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const milestoneCriteriaRefs = useRef<Record<string, HTMLInputElement | null>>(
    {},
  );
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [deadline, setDeadline] = useState("");
  const [successAddress, setSuccessAddress] = useState(
    prefill?.successAddress ?? "",
  );
  const [failureAddress, setFailureAddress] = useState(
    prefill?.failureAddress ?? "",
  );
  const [milestones, setMilestones] = useState<MilestoneFormRow[]>(() => {
    if (prefill?.milestones && prefill.milestones.length > 0) {
      return prefill.milestones.map((m, index) => ({
        id: `milestone-${Date.now()}-${index}`,
        title: m.title,
        criteria: m.criteria,
      }));
    }
    return [createMilestoneRow(0)];
  });
  const [errors, setErrors] = useState<CreateVaultErrors>({});
  const [evidenceUrl, setEvidenceUrl] = useState<string | undefined>();
  const [showReview, setShowReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [submissionUncertain, setSubmissionUncertain] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const errorFieldOrder: Array<
    "amount" | "deadline" | "successAddress" | "failureAddress"
  > = ["amount", "deadline", "successAddress", "failureAddress"];

  const fieldRefs = {
    amount: amountRef,
    deadline: deadlineRef,
    successAddress: successAddressRef,
    failureAddress: failureAddressRef,
  };

  const errorEntries = errorFieldOrder.flatMap((field) =>
    errors[field] ? [{ key: field, message: errors[field] as string }] : [],
  );
  const milestoneErrorEntries = [
    ...(errors.milestones?.form
      ? [{ key: "milestones-form", message: errors.milestones.form }]
      : []),
    ...(errors.milestones?.rows ?? []).flatMap((row, rowIndex) =>
      row
        ? Object.values(row).map((message, errorIndex) => ({
            key: `milestone-${rowIndex}-${errorIndex}`,
            message,
          }))
        : [],
    ),
  ];
  const allErrorEntries = [...errorEntries, ...milestoneErrorEntries];

  const clearMilestoneErrors = () => {
    setErrors((current) => ({ ...current, milestones: undefined }));
  };

  const updateMilestone = (
    id: string,
    field: keyof CreateVaultMilestoneInput,
    value: string,
  ) => {
    setMilestones((current) =>
      current.map((milestone) =>
        milestone.id === id ? { ...milestone, [field]: value } : milestone,
      ),
    );
    clearMilestoneErrors();
  };

  const addMilestone = () => {
    setMilestones((current) => [
      ...current,
      createMilestoneRow(current.length),
    ]);
    clearMilestoneErrors();
  };

  const removeMilestone = (id: string) => {
    setMilestones((current) =>
      current.filter((milestone) => milestone.id !== id),
    );
    clearMilestoneErrors();
  };

  const moveMilestone = (id: string, direction: "up" | "down") => {
    setMilestones((current) => {
      const index = current.findIndex((milestone) => milestone.id === id);
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (index === -1 || targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    clearMilestoneErrors();
  };

  const focusFirstMilestoneError = (nextErrors: CreateVaultErrors) => {
    const rowIndex = nextErrors.milestones?.rows?.findIndex(Boolean) ?? -1;
    if (rowIndex < 0) return false;

    const row = nextErrors.milestones?.rows?.[rowIndex];
    const milestone = milestones[rowIndex];
    if (!row || !milestone) return false;

    if (row.title) {
      milestoneTitleRefs.current[milestone.id]?.focus();
      return true;
    }

    if (row.criteria) {
      milestoneCriteriaRefs.current[milestone.id]?.focus();
      return true;
    }

    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = validateCreateVault({
      amount,
      deadline,
      successAddress,
      failureAddress,
      milestones,
    });
    setErrors(nextErrors);

    if (hasCreateVaultErrors(nextErrors)) {
      const firstInvalidField = errorFieldOrder.find(
        (field) => nextErrors[field],
      );
      if (firstInvalidField) {
        fieldRefs[firstInvalidField].current?.focus();
      } else {
        focusFirstMilestoneError(nextErrors);
      }
      return;
    }

    setShowReview(true);
  };

  const handleConfirm = async () => {
    // A failed create call can have committed before its response was lost.
    // Without a service idempotency key, this page must not offer a retry.
    if (isSubmittingRef.current || submissionUncertain) return;

    if (!address || !isValidStellarAddress(address)) {
      setSubmitError("Wallet account unavailable. Please reconnect your wallet.");
      return;
    }

    if (!network || isNetworkMismatch(network)) {
      setSubmitError(`Wallet network unavailable or incorrect. Please switch to ${APP_EXPECTED_NETWORK}.`);
      return;
    }

    const nextErrors = validateCreateVault({
      amount,
      deadline,
      successAddress,
      failureAddress,
      milestones,
    });
    if (hasCreateVaultErrors(nextErrors)) {
      setSubmitError("Form data is invalid or was tampered with.");
      return;
    }

    if (balanceStatus === 'success' && exceedsBalance(amount, balance)) {
      setSubmitError("Amount exceeds your available USDC balance.");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    logger.debug("CreateVault confirm", { hasEvidence: Boolean(evidenceUrl) });

    try {
      const newVault = await createVault({
        name: prefill?.sourceVaultName ? `Duplicated ${prefill.sourceVaultName}` : `Vault ${amount} USDC`,
        amount: Number(amount),
        currency: "USDC",
        deadline,
        creatorAddress: address,
        successAddress,
        failureAddress,
        milestones: milestones.map(({ title, criteria }) => ({
          title,
          description: criteria,
          criteria,
        })),
      });
      
      if (!newVault || !newVault.id) {
        throw new Error("Malformed response from server.");
      }

      navigate(`/vaults/${newVault.id}`);
    } catch {
      // The service may have created the vault even when its response failed.
      // Do not expose raw service errors or silently make a second create call.
      logger.error("Vault creation outcome unknown");
      setSubmitError("Vault creation status is unknown. Check your vaults before trying again.");
      setSubmissionUncertain(true);
      // Keep the synchronous guard engaged even before React renders the error.
      setIsSubmitting(false);
    }
  };

  const handleBackToEdit = () => {
    setShowReview(false);
  };

  return (
    <div>
      <Text role="display" as="h1" style={{ marginBottom: "0.5rem" }}>
        Create Vault
      </Text>
      <Text
        role="body"
        as="p"
        style={{ color: "var(--muted)", marginBottom: "2rem" }}
      >
        Lock USDC with a deadline and milestone. Funds release on validation or
        redirect on failure.
      </Text>

      {showReview ? (
        <CreateVaultReview
          amount={amount}
          deadline={deadline}
          successAddress={successAddress}
          failureAddress={failureAddress}
          milestones={milestones}
          isSubmitting={isSubmitting}
          submissionUncertain={submissionUncertain}
          error={submitError}
          onBack={handleBackToEdit}
          onConfirm={handleConfirm}
          onCheckVaults={() => navigate("/vaults")}
        />
      ) : (
        <>
          {allErrorEntries.length > 0 && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                border: "1px solid var(--danger)",
                borderRadius: "var(--radius)",
                padding: "0.75rem",
                background:
                  "color-mix(in srgb, var(--danger) 10%, var(--surface))",
                marginBottom: "1rem",
                maxWidth: 400,
              }}
            >
              <Text
                role="caption"
                as="p"
                style={{ color: "var(--danger)", marginBottom: "0.5rem" }}
              >
                Please fix the highlighted fields before creating the vault.
              </Text>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.25rem",
                  color: "var(--danger)",
                }}
              >
                {allErrorEntries.map(({ key, message }, index) => (
                  <li key={`${key}-${index}`}>{message}</li>
                ))}
              </ul>
            </div>
          )}

          {prefill && (
            <div
              role="status"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "0.75rem",
                background: "var(--surface)",
                marginBottom: "1rem",
                maxWidth: 400,
              }}
            >
              <Text role="caption" as="p" style={{ margin: 0 }}>
                Duplicating {prefill.sourceVaultName ?? "an existing vault"}.
                Amount and destination addresses are prefilled; choose a fresh
                deadline for this new vault.
              </Text>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            noValidate
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              maxWidth: 400,
            }}
          >
            <Field
              ref={amountRef}
              id="create-vault-amount"
              label="Amount (USDC)"
              type="text"
              value={formatUsdcInput(amount)}
              onChange={(e) => {
                const raw = parseUsdcInput(e.target.value);
                setAmount(raw);
                setErrors((current) => ({ ...current, amount: undefined }));
              }}
              placeholder="1000"
              error={errors.amount}
              required
            />
            {balanceStatus === "success" && exceedsBalance(amount, balance) && (
              <p
                role="status"
                style={{
                  color: "var(--warning)",
                  margin: 0,
                  fontSize: "0.875rem",
                }}
              >
                Amount exceeds your available USDC balance ({balance}).
              </p>
            )}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {DEADLINE_PRESETS.map((preset) => {
                const days = getPresetDays(preset);
                const isActive = deadline === computeFutureDeadline(days);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setDeadline(computeFutureDeadline(days));
                      setErrors((current) => ({
                        ...current,
                        deadline: undefined,
                      }));
                    }}
                    style={{
                      padding: "0.4rem 0.875rem",
                      border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                      background: isActive
                        ? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
                        : "var(--surface)",
                      color: isActive ? "var(--accent)" : "var(--muted)",
                      borderRadius: "var(--radius)",
                      fontSize: "0.85rem",
                      fontWeight: isActive ? 600 : 400,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {getPresetLabel(preset)}
                  </button>
                );
              })}
            </div>
            <Field
              ref={deadlineRef}
              id="create-vault-deadline"
              label="Deadline (ISO date)"
              type="datetime-local"
              value={deadline}
              onChange={(e) => {
                setDeadline(e.target.value);
                setErrors((current) => ({ ...current, deadline: undefined }));
              }}
              error={errors.deadline}
              required
            />
            <Field
              ref={successAddressRef}
              id="create-vault-success-address"
              label="Success destination (Stellar address)"
              type="text"
              value={successAddress}
              onChange={(e) => {
                setSuccessAddress(e.target.value);
                setErrors((current) => ({
                  ...current,
                  successAddress: undefined,
                }));
              }}
              placeholder="G..."
              error={errors.successAddress}
              required
            />
            <Field
              ref={failureAddressRef}
              id="create-vault-failure-address"
              label="Failure destination (Stellar address)"
              type="text"
              value={failureAddress}
              onChange={(e) => {
                setFailureAddress(e.target.value);
                setErrors((current) => ({
                  ...current,
                  failureAddress: undefined,
                }));
              }}
              placeholder="G..."
              error={errors.failureAddress}
              required
            />
            <section
              aria-labelledby="create-vault-milestones-heading"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div>
                <Text
                  role="body"
                  as="h2"
                  id="create-vault-milestones-heading"
                  style={{ marginBottom: "0.25rem" }}
                >
                  Milestones
                </Text>
                <Text role="caption" as="p" style={{ color: "var(--muted)" }}>
                  Add each delivery checkpoint with clear validation criteria.
                </Text>
              </div>

              {errors.milestones?.form ? (
                <Text
                  role="caption"
                  as="p"
                  id="create-vault-milestones-error"
                  style={{ color: "var(--danger)" }}
                >
                  {errors.milestones.form}
                </Text>
              ) : null}

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.875rem",
                }}
              >
                {milestones.map((milestone, index) => {
                  const rowErrors = errors.milestones?.rows?.[index];
                  const canMoveUp = index > 0;
                  const canMoveDown = index < milestones.length - 1;

                  return (
                    <fieldset
                      key={milestone.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                        margin: 0,
                        padding: "0.875rem",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        background: "var(--bg)",
                      }}
                    >
                      <legend>
                        <Text role="caption" as="span">
                          Milestone {index + 1}
                        </Text>
                      </legend>
                      <Field
                        ref={(node) => {
                          milestoneTitleRefs.current[milestone.id] = node;
                        }}
                        id={`create-vault-milestone-${index}-title`}
                        label={`Milestone ${index + 1} title`}
                        type="text"
                        value={milestone.title}
                        onChange={(e) =>
                          updateMilestone(milestone.id, "title", e.target.value)
                        }
                        placeholder="Design approved"
                        error={rowErrors?.title}
                        required
                      />
                      <Field
                        ref={(node) => {
                          milestoneCriteriaRefs.current[milestone.id] = node;
                        }}
                        id={`create-vault-milestone-${index}-criteria`}
                        label={`Milestone ${index + 1} criteria`}
                        type="text"
                        value={milestone.criteria}
                        onChange={(e) =>
                          updateMilestone(
                            milestone.id,
                            "criteria",
                            e.target.value,
                          )
                        }
                        placeholder="Signed approval from the verifier"
                        error={rowErrors?.criteria}
                        required
                      />
                      <div
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => moveMilestone(milestone.id, "up")}
                          disabled={!canMoveUp}
                          aria-label={`Move milestone ${index + 1} up`}
                          style={{
                            padding: "0.4rem 0.75rem",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius)",
                            background: "var(--surface)",
                            color: "var(--text)",
                            cursor: canMoveUp ? "pointer" : "not-allowed",
                            opacity: canMoveUp ? 1 : 0.5,
                          }}
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveMilestone(milestone.id, "down")}
                          disabled={!canMoveDown}
                          aria-label={`Move milestone ${index + 1} down`}
                          style={{
                            padding: "0.4rem 0.75rem",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius)",
                            background: "var(--surface)",
                            color: "var(--text)",
                            cursor: canMoveDown ? "pointer" : "not-allowed",
                            opacity: canMoveDown ? 1 : 0.5,
                          }}
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMilestone(milestone.id)}
                          aria-label={`Remove milestone ${index + 1}`}
                          style={{
                            padding: "0.4rem 0.75rem",
                            border: "1px solid var(--danger)",
                            borderRadius: "var(--radius)",
                            background: "transparent",
                            color: "var(--danger)",
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </fieldset>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addMilestone}
                style={{
                  alignSelf: "flex-start",
                  padding: "0.55rem 0.875rem",
                  border: "1px solid var(--accent)",
                  borderRadius: "var(--radius)",
                  background: "transparent",
                  color: "var(--accent)",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Add milestone
              </button>
            </section>
            <EvidenceUpload onChange={setEvidenceUrl} />
            <button
              type="submit"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
                padding: "0.75rem 1.5rem",
                borderRadius: "var(--radius)",
                border: "none",
                fontWeight: 600,
                cursor: "pointer",
                marginTop: "0.5rem",
                minHeight: "44px",
                minWidth: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text role="caption" as="span">
                Create Vault
              </Text>
            </button>
          </form>
        </>
      )}
    </div>
  );
}
