import type { ValidationTask } from '../Zustand/Store';
import type { ChipStatus } from '../components/StatusChip';

/**
 * Maps a validation task status from the store onto a typed StatusChip ChipStatus.
 * Enforces compile-time exhaustiveness checking to ensure all validation task statuses are handled.
 *
 * @param status - The validation task status ('pending' | 'approved' | 'rejected').
 * @returns The corresponding ChipStatus ('pending_validation' | 'approved' | 'rejected').
 */
export function mapValidationStatusToChipStatus(status: ValidationTask['status']): ChipStatus {
  switch (status) {
    case 'pending':
      return 'pending_validation';
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}
