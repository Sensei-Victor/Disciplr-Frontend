import { describe, expect, it } from 'vitest';
import {
  createVaultPrefillFromVault,
  getCreateVaultPrefill,
} from '../vaultPrefill';
import type { Vault } from '../../types/vault';

describe('vaultPrefill utils', () => {
  it('should handle a full round trip (vault -> prefill state -> parsed-back prefill)', () => {
    const mockVault: Vault = {
      id: 'vault-123',
      name: 'Test Vault',
      status: 'active',
      amount: 100,
      currency: 'USDC',
      createdAt: '2023-01-01T00:00:00Z',
      deadline: '2023-12-31T00:00:00Z',
      creatorAddress: '0x123',
      successAddress: '0xabc',
      failureAddress: '0xdef',
      contractAddress: '0xcontract',
      milestones: [
        {
          id: 'm1',
          title: 'Milestone 1',
          description: 'Desc',
          criteria: 'Criteria 1',
          status: 'pending',
        },
      ],
      transactions: [],
    };

    const locationState = createVaultPrefillFromVault(mockVault);
    
    // Check createVaultPrefillFromVault shape
    expect(locationState).toEqual({
      createVaultPrefill: {
        sourceVaultId: 'vault-123',
        sourceVaultName: 'Test Vault',
        amount: '100',
        successAddress: '0xabc',
        failureAddress: '0xdef',
        milestones: [
          {
            title: 'Milestone 1',
            criteria: 'Criteria 1',
          },
        ],
      },
    });

    const parsedPrefill = getCreateVaultPrefill(locationState);
    
    // Check parsed back shape
    expect(parsedPrefill).toEqual(locationState.createVaultPrefill);
  });

  it('should return undefined for missing/undefined state', () => {
    expect(getCreateVaultPrefill(undefined)).toBeUndefined();
    expect(getCreateVaultPrefill(null)).toBeUndefined();
    expect(getCreateVaultPrefill('string state')).toBeUndefined();
  });

  it('should return undefined for a state object without a createVaultPrefill key', () => {
    expect(getCreateVaultPrefill({ someOtherKey: true })).toBeUndefined();
    expect(getCreateVaultPrefill({})).toBeUndefined();
  });

  it('should filter out non-object entries in the milestones array via the isRecord guard', () => {
    const stateWithBadMilestones = {
      createVaultPrefill: {
        sourceVaultId: 'vault-123',
        milestones: [
          { title: 'Valid 1', criteria: 'Crit 1' },
          null,
          'string-milestone',
          42,
          undefined,
          { title: 'Valid 2', criteria: 'Crit 2' },
        ],
      },
    };

    const parsedPrefill = getCreateVaultPrefill(stateWithBadMilestones);

    expect(parsedPrefill?.milestones).toEqual([
      { title: 'Valid 1', criteria: 'Crit 1' },
      { title: 'Valid 2', criteria: 'Crit 2' },
    ]);
  });
});
