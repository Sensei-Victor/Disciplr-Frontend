export interface CreateVaultFormValues {
  amount: string;
  deadline: string;
  successAddress: string;
  failureAddress: string;
  milestones?: CreateVaultMilestoneInput[];
  verifierAddress?: string;
  milestoneTitle?: string;
  milestoneCriteria?: string;
}

export interface CreateVaultMilestoneInput {
  title: string;
  criteria: string;
}

export interface CreateVaultMilestoneRowErrors {
  title?: string;
  criteria?: string;
}

export interface CreateVaultMilestoneErrors {
  form?: string;
  rows?: CreateVaultMilestoneRowErrors[];
}

type CreateVaultFieldName = Exclude<
  keyof CreateVaultFormValues,
  "milestones"
>;

export type CreateVaultErrors = Partial<
  Record<CreateVaultFieldName, string>
>
 & {
  milestones?: CreateVaultMilestoneErrors;
};

const USCC_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/;

export const MILESTONE_TITLE_MAX = 100;
export const MILESTONE_CRITERIA_MAX = 500;

import { isValidStellarAddress } from './stellarAddress';
export { isValidStellarAddress };

export function isValidUsdcAmount(amount: string): boolean {
  const normalized = amount.trim();
  if (!USCC_AMOUNT.test(normalized)) return false;
  return Number(normalized) > 0;
}

export function isFutureDeadline(deadline: string, now = new Date()): boolean {
  const timestamp = new Date(deadline).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

/**
 * Validates an array of milestone inputs.
 * Returns undefined when all milestones are valid.
 * Returns a CreateVaultMilestoneErrors object when validation fails.
 */
export function validateMilestones(
  milestones: CreateVaultMilestoneInput[] | undefined,
): CreateVaultMilestoneErrors | undefined {
  if (!milestones || milestones.length === 0) {
    return { form: "Add at least one milestone." };
  }

  // Check for duplicate titles (case-insensitive)
  const normalizedTitles = milestones.map((m) => m.title.trim().toLowerCase());
  const titleCounts: Record<string, number> = {};
  for (const t of normalizedTitles) {
    titleCounts[t] = (titleCounts[t] ?? 0) + 1;
  }
  const hasDuplicates = Object.values(titleCounts).some((count) => count > 1);

  const rowErrors: CreateVaultMilestoneRowErrors[] = milestones.map((m, i) => {
    const rowError: CreateVaultMilestoneRowErrors = {};

    if (hasDuplicates && titleCounts[normalizedTitles[i]] > 1) {
      rowError.title = "Milestone titles must be unique.";
    } else if (!m.title.trim()) {
      rowError.title = "Enter a milestone title.";
    }

    if (!m.criteria.trim()) {
      rowError.criteria = "Enter milestone criteria.";
    }

    return rowError;
  });

  const anyRowErrors = rowErrors.some(
    (r) => r.title !== undefined || r.criteria !== undefined,
  );
  if (anyRowErrors) {
    return { rows: rowErrors };
  }

  return undefined;
}

export function validateCreateVault(
  values: CreateVaultFormValues,
  now = new Date(),
): CreateVaultErrors {
  const errors: CreateVaultErrors = {};
  const successAddress = values.successAddress.trim();
  const failureAddress = values.failureAddress.trim();

  if (!isValidUsdcAmount(values.amount)) {
    errors.amount = "Enter a positive USDC amount with up to 7 decimal places.";
  }

  if (!isFutureDeadline(values.deadline, now)) {
    errors.deadline = "Choose a future deadline.";
  }

  if (!isValidStellarAddress(successAddress)) {
    errors.successAddress = "Enter a valid Stellar public key starting with G or C.";
  }

  if (!isValidStellarAddress(failureAddress)) {
    errors.failureAddress = "Enter a valid Stellar public key starting with G or C.";
  } else if (successAddress === failureAddress) {
    errors.failureAddress =
      "Failure destination must be different from success destination.";
  }

  // Validate verifierAddress only when provided and non-empty
  if (values.verifierAddress !== undefined) {
    const verifierAddress = values.verifierAddress.trim();
    if (verifierAddress) {
      if (!isValidStellarAddress(verifierAddress)) {
        errors.verifierAddress =
          "Enter a valid Stellar public key starting with G or C.";
      } else if (verifierAddress === successAddress) {
        errors.verifierAddress =
          "Verifier must be different from the success destination.";
      } else if (verifierAddress === failureAddress) {
        errors.verifierAddress =
          "Verifier must be different from the failure destination.";
      }
    }
  }

  // Validate milestones array only when the field is present
  if ("milestones" in values) {
    const milestoneErrors = validateMilestones(values.milestones);
    if (milestoneErrors) {
      errors.milestones = milestoneErrors;
    }
  }

  // Validate milestoneTitle only when the field is present
  if (values.milestoneTitle !== undefined) {
    const title = values.milestoneTitle.trim();
    if (!title) {
      errors.milestoneTitle = "Enter a milestone title.";
    } else if (title.length > MILESTONE_TITLE_MAX) {
      errors.milestoneTitle = `Milestone title must be ${MILESTONE_TITLE_MAX} characters or fewer.`;
    }
  }

  // Validate milestoneCriteria only when the field is present
  if (values.milestoneCriteria !== undefined) {
    const criteria = values.milestoneCriteria.trim();
    if (!criteria) {
      errors.milestoneCriteria = "Enter the milestone criteria.";
    } else if (criteria.length > MILESTONE_CRITERIA_MAX) {
      errors.milestoneCriteria = `Milestone criteria must be ${MILESTONE_CRITERIA_MAX} characters or fewer.`;
    }
  }

  return errors;
}

export function hasCreateVaultErrors(errors: CreateVaultErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Returns true when amount is a valid positive number that strictly exceeds the
 * available balance. Returns false when either value is not a finite number so
 * the caller can treat an unknown balance as non-blocking.
 */
export function exceedsBalance(amount: string, balance: string | null): boolean {
  if (balance === null) return false;
  const a = Number(amount);
  const b = Number(balance);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a > b;
}
