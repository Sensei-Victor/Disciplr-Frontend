import { describe, expect, it } from 'vitest';
import { mapValidationStatusToChipStatus } from '../verifierStatus';

describe('mapValidationStatusToChipStatus', () => {
  it('maps pending status to pending_validation', () => {
    expect(mapValidationStatusToChipStatus('pending')).toBe('pending_validation');
  });

  it('maps approved status to approved', () => {
    expect(mapValidationStatusToChipStatus('approved')).toBe('approved');
  });

  it('maps rejected status to rejected', () => {
    expect(mapValidationStatusToChipStatus('rejected')).toBe('rejected');
  });
});
