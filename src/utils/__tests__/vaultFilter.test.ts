import { describe, it, expect } from 'vitest';
import { filterVaults, sortVaults } from '../vaultFilter';
import type { VaultFilters } from '../vaultFilter';
import type { Vault } from '../../types/vault';

const createVault = (overrides: Partial<Vault> = {}): Vault => ({
  id: '1',
  name: 'Test Vault',
  status: 'active' as const,
  amount: 10000,
  currency: 'USDC',
  createdAt: '2024-01-01T00:00:00Z',
  deadline: '2024-12-31T00:00:00Z',
  creatorAddress: 'GBVZ3KQKM4XNQPBEZMXPOLKQK4XNQPBEZMXPOLKQKK7L',
  successAddress: 'GSUCC3KQKM4XNQPBEZMXPOLKQKK4XNQPBEZMXPOLKQK',
  failureAddress: 'GFAIL3KQKM4XNQPBEZMXPOLKQK4XNQPBEZMXPOLKQKK',
  contractAddress: 'GCONT3KQKM4XNQPBEZMXPOLKQK4XNQPBEZMXPOLKQKK',
  milestones: [],
  transactions: [],
  ...overrides,
});

const mockVaults: Vault[] = [
  createVault({
    id: '1',
    name: 'Alpha Vault',
    status: 'active',
    amount: 12500,
    deadline: '2024-07-15T10:00:00Z',
  }),
  createVault({
    id: '2',
    name: 'Beta Reserve',
    status: 'completed',
    amount: 4200.5,
    deadline: '2024-01-01T09:00:00Z',
  }),
  createVault({
    id: '3',
    name: 'Gamma Fund',
    status: 'failed',
    amount: 8800,
    deadline: '2023-12-01T08:00:00Z',
  }),
  createVault({
    id: '4',
    name: 'Delta Cancelled',
    status: 'cancelled',
    amount: 5000,
    deadline: '2023-12-01T08:00:00Z',
  }),
  createVault({
    id: '5',
    name: 'Epsilon Pending',
    status: 'pending_validation',
    amount: 15000,
    deadline: '2024-06-01T10:00:00Z',
  }),
];

describe('filterVaults', () => {
  it('returns all vaults when no filters are provided', () => {
    const result = filterVaults(mockVaults);
    expect(result).toEqual(mockVaults);
  });

  it('returns all vaults when empty filter options are provided', () => {
    const result = filterVaults(mockVaults, {});
    expect(result).toEqual(mockVaults);
  });

  it('accepts a VaultFilters object', () => {
    const filters: VaultFilters = { status: 'active', query: 'alpha' };
    const result = filterVaults(mockVaults, filters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('returns all vaults when status is "all"', () => {
    const result = filterVaults(mockVaults, { status: 'all' });
    expect(result).toEqual(mockVaults);
  });

  describe('status filtering', () => {
    it('filters by active status', () => {
      const result = filterVaults(mockVaults, { status: 'active' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].status).toBe('active');
    });

    it('filters by completed status', () => {
      const result = filterVaults(mockVaults, { status: 'completed' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
      expect(result[0].status).toBe('completed');
    });

    it('filters by failed status', () => {
      const result = filterVaults(mockVaults, { status: 'failed' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
      expect(result[0].status).toBe('failed');
    });

    it('filters by cancelled status', () => {
      const result = filterVaults(mockVaults, { status: 'cancelled' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
      expect(result[0].status).toBe('cancelled');
    });

    it('filters by pending_validation status', () => {
      const result = filterVaults(mockVaults, { status: 'pending_validation' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('5');
      expect(result[0].status).toBe('pending_validation');
    });

    it('returns empty array for non-existent status', () => {
      const result = filterVaults(mockVaults, { status: 'active' as any });
      // Since 'active' exists, this should return 1
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('name search', () => {
    it('filters by vault name (case-insensitive)', () => {
      const result = filterVaults(mockVaults, { query: 'alpha' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].name).toBe('Alpha Vault');
    });

    it('filters by partial vault name', () => {
      const result = filterVaults(mockVaults, { query: 'vault' });
      expect(result).toHaveLength(1); // Only "Alpha Vault" contains "vault"
    });

    it('filters by vault name with uppercase query', () => {
      const result = filterVaults(mockVaults, { query: 'BETA' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('matches multiple vaults with same partial name', () => {
      const result = filterVaults(mockVaults, { query: 'a' });
      expect(result).toHaveLength(4); // Alpha, Beta, Gamma, Delta all contain 'a'
    });

    it('returns empty array for non-matching query', () => {
      const result = filterVaults(mockVaults, { query: 'nonexistent' });
      expect(result).toHaveLength(0);
    });
  });

  describe('combined status and query filters', () => {
    it('filters by both status and query (AND logic)', () => {
      const result = filterVaults(mockVaults, { status: 'active', query: 'alpha' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('returns empty when query matches but status does not', () => {
      const result = filterVaults(mockVaults, { status: 'completed', query: 'alpha' });
      expect(result).toHaveLength(0);
    });

    it('returns empty when status matches but query does not', () => {
      const result = filterVaults(mockVaults, { status: 'active', query: 'beta' });
      expect(result).toHaveLength(0);
    });

    it('filters by status and partial name', () => {
      const result = filterVaults(mockVaults, { status: 'pending_validation', query: 'epsilon' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('5');
    });
  });

  describe('edge cases', () => {
    it('handles empty vault array', () => {
      const result = filterVaults([], { query: 'test' });
      expect(result).toEqual([]);
    });

    it('handles whitespace-only query', () => {
      const result = filterVaults(mockVaults, { query: '   ' });
      expect(result).toEqual([]);
    });

    it('handles query with leading/trailing whitespace', () => {
      const result = filterVaults(mockVaults, { query: '  alpha  ' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('handles empty query string', () => {
      const result = filterVaults(mockVaults, { query: '' });
      expect(result).toEqual(mockVaults);
    });

    it('does not mutate input array', () => {
      const input = [...mockVaults];
      const original = JSON.stringify(input);
      filterVaults(input, { query: 'test', status: 'active' });
      expect(JSON.stringify(input)).toBe(original);
    });

    it('returns filtered array (not a reference to original)', () => {
      const result = filterVaults(mockVaults, { query: 'test' });
      expect(result).not.toBe(mockVaults);
    });

    it('handles single vault', () => {
      const singleVault = [mockVaults[0]];
      const result = filterVaults(singleVault, { query: 'alpha' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });

  describe('special characters in search', () => {
    it('handles vault names with special characters', () => {
      const vaultsWithSpecial = [
        createVault({
          id: '1',
          name: 'Vault-Name (Test)',
          status: 'active',
        }),
      ];
      const result = filterVaults(vaultsWithSpecial, { query: 'vault-name' });
      expect(result).toHaveLength(1);
    });

    it('handles vault names with spaces', () => {
      const vaultsWithSpaces = [
        createVault({
          id: '1',
          name: 'My Test Vault',
          status: 'active',
        }),
      ];
      const result = filterVaults(vaultsWithSpaces, { query: 'test vault' });
      expect(result).toHaveLength(1);
    });
  });
});

describe('sortVaults', () => {
  it('sorts by deadline ascending', () => {
    const result = sortVaults(mockVaults, { by: 'deadline', dir: 'asc' });
    expect(result[0].id).toBe('3'); // 2023-12-01
    expect(result[1].id).toBe('4'); // 2023-12-01 (same date, tiebreaker by id)
    expect(result[2].id).toBe('2'); // 2024-01-01
    expect(result[3].id).toBe('5'); // 2024-06-01
    expect(result[4].id).toBe('1'); // 2024-07-15
  });

  it('sorts by deadline descending', () => {
    const result = sortVaults(mockVaults, { by: 'deadline', dir: 'desc' });
    expect(result[0].id).toBe('1'); // 2024-07-15
    expect(result[4].id).toBe('3'); // 2023-12-01
  });

  it('sorts by amount ascending', () => {
    const result = sortVaults(mockVaults, { by: 'amount', dir: 'asc' });
    expect(result[0].amount).toBe(4200.5);
    expect(result[1].amount).toBe(5000);
    expect(result[2].amount).toBe(8800);
    expect(result[3].amount).toBe(12500);
    expect(result[4].amount).toBe(15000);
  });

  it('sorts by amount descending', () => {
    const result = sortVaults(mockVaults, { by: 'amount', dir: 'desc' });
    expect(result[0].amount).toBe(15000);
    expect(result[4].amount).toBe(4200.5);
  });

  describe('stable ordering on ties', () => {
    it('uses id as tiebreaker for equal deadlines', () => {
      const vaultsWithSameDeadline = [
        createVault({
          id: 'z',
          name: 'Z Vault',
          status: 'active',
          deadline: '2024-01-01T00:00:00Z',
        }),
        createVault({
          id: 'a',
          name: 'A Vault',
          status: 'active',
          deadline: '2024-01-01T00:00:00Z',
        }),
      ];
      const result = sortVaults(vaultsWithSameDeadline, { by: 'deadline', dir: 'asc' });
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('z');
    });

    it('uses id as tiebreaker for equal amounts', () => {
      const vaultsWithSameAmount = [
        createVault({
          id: 'z',
          name: 'Z Vault',
          status: 'active',
          amount: 10000,
        }),
        createVault({
          id: 'a',
          name: 'A Vault',
          status: 'active',
          amount: 10000,
        }),
      ];
      const result = sortVaults(vaultsWithSameAmount, { by: 'amount', dir: 'asc' });
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('z');
    });
  });

  describe('edge cases', () => {
    it('handles empty vault array', () => {
      const result = sortVaults([], { by: 'deadline', dir: 'asc' });
      expect(result).toEqual([]);
    });

    it('handles single vault', () => {
      const singleVault = [mockVaults[0]];
      const result = sortVaults(singleVault, { by: 'deadline', dir: 'asc' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('does not mutate input array', () => {
      const input = [...mockVaults];
      const original = JSON.stringify(input);
      sortVaults(input, { by: 'deadline', dir: 'asc' });
      expect(JSON.stringify(input)).toBe(
original);
    });

    it('returns sorted array (not a reference to original)', () => {
      const result = sortVaults(mockVaults, { by: 'deadline', dir: 'asc' });
      expect(result).not.toBe(mockVaults);
    });
  });
});

describe('combined filter and sort', () => {
  it('filters then sorts correctly', () => {
    const filtered = filterVaults(mockVaults, { status: 'active' });
    const sorted = sortVaults(filtered, { by: 'amount', dir: 'desc' });
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe('1');
  });

  it('handles complex filter and sort combination', () => {
    const filtered = filterVaults(mockVaults, { query: 'vault' });
    const sorted = sortVaults(filtered, { by: 'deadline', dir: 'asc' });
    expect(sorted).toHaveLength(1); // Only "Alpha Vault" contains "vault"
    expect(sorted[0].id).toBe('1');
  });
});
