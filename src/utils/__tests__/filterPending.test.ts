import { describe, it, expect } from 'vitest';
import { filterPending, PendingTask } from '../filterPending';

const createTask = (overrides: Partial<PendingTask> = {}): PendingTask => ({
  id: 'v-1',
  vaultName: 'Test Vault',
  owner: '0xAAAA',
  amount: '10,000 USDC',
  deadline: '2026-07-01',
  status: 'pending' as const,
  milestone: 'Phase 1',
  ...overrides,
});

const mockTasks: PendingTask[] = [
  createTask({
    id: 'v-1',
    vaultName: 'Alpha Vault',
    owner: '0xAAAA',
    milestone: 'Phase 1',
  }),
  createTask({
    id: 'v-2',
    vaultName: 'Beta Vault',
    owner: '0xBBBB',
    milestone: 'Phase 2',
  }),
  createTask({
    id: 'v-3',
    vaultName: 'Gamma Vault',
    owner: '0xCCCC',
    milestone: 'Phase 1',
  }),
  createTask({
    id: 'v-4',
    vaultName: 'Delta Vault',
    owner: '0xDDDD',
    milestone: 'Phase 3',
  }),
];

describe('filterPending', () => {
  it('returns all tasks when no filters are provided', () => {
    const result = filterPending(mockTasks);
    expect(result).toEqual(mockTasks);
  });

  it('returns all tasks when empty filter options are provided', () => {
    const result = filterPending(mockTasks, {});
    expect(result).toEqual(mockTasks);
  });

  it('returns all tasks when empty query and empty milestone are provided', () => {
    const result = filterPending(mockTasks, { query: '', milestone: '' });
    expect(result).toEqual(mockTasks);
  });

  describe('search by vault name', () => {
    it('filters by vault name (case-insensitive)', () => {
      const result = filterPending(mockTasks, { query: 'alpha' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-1');
      expect(result[0].vaultName).toBe('Alpha Vault');
    });

    it('filters by partial vault name', () => {
      const result = filterPending(mockTasks, { query: 'vault' });
      expect(result).toHaveLength(4);
    });

    it('filters by vault name with uppercase query', () => {
      const result = filterPending(mockTasks, { query: 'BETA' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-2');
    });

    it('matches multiple vaults with same partial name', () => {
      const result = filterPending(mockTasks, { query: 'a' });
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((t) => t.id === 'v-1')).toBe(true); // Alpha
      expect(result.some((t) => t.id === 'v-3')).toBe(true); // Gamma
      expect(result.some((t) => t.id === 'v-4')).toBe(true); // Delta
    });
  });

  describe('search by owner', () => {
    it('filters by owner address (case-insensitive)', () => {
      const result = filterPending(mockTasks, { query: '0xaaaa' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-1');
      expect(result[0].owner).toBe('0xAAAA');
    });

    it('filters by partial owner address', () => {
      const result = filterPending(mockTasks, { query: '0x' });
      expect(result).toHaveLength(4);
    });

    it('filters by owner with uppercase query', () => {
      const result = filterPending(mockTasks, { query: '0xBBBB' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-2');
    });

    it('matches partial owner address', () => {
      const result = filterPending(mockTasks, { query: 'bbbb' });
      expect(result).toHaveLength(1);
      expect(result[0].owner).toBe('0xBBBB');
    });
  });

  describe('search across vault and owner', () => {
    it('matches query against vault name OR owner (union)', () => {
      const tasksWithOwner = [
        createTask({ id: 'v-1', vaultName: 'Test Vault', owner: '0xALICE' }),
        createTask({ id: 'v-2', vaultName: 'Alice Vault', owner: '0xBOB' }),
      ];
      const result = filterPending(tasksWithOwner, { query: 'alice' });
      expect(result).toHaveLength(2); // both match (vault name and owner)
    });
  });

  describe('filter by milestone', () => {
    it('filters by milestone', () => {
      const result = filterPending(mockTasks, { milestone: 'Phase 1' });
      expect(result).toHaveLength(2);
      expect(result.map((t) => t.id)).toEqual(['v-1', 'v-3']);
    });

    it('filters by milestone Phase 2', () => {
      const result = filterPending(mockTasks, { milestone: 'Phase 2' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-2');
    });

    it('filters by milestone Phase 3', () => {
      const result = filterPending(mockTasks, { milestone: 'Phase 3' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-4');
    });

    it('returns empty array for non-existent milestone', () => {
      const result = filterPending(mockTasks, { milestone: 'Non-existent' });
      expect(result).toHaveLength(0);
    });

    it('is case-sensitive for milestone matching', () => {
      const result = filterPending(mockTasks, { milestone: 'phase 1' });
      expect(result).toHaveLength(0);
    });
  });

  describe('combined query and milestone filters', () => {
    it('filters by both query and milestone (AND logic)', () => {
      const result = filterPending(mockTasks, {
        query: 'alpha',
        milestone: 'Phase 1',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-1');
    });

    it('returns empty when query matches but milestone does not', () => {
      const result = filterPending(mockTasks, {
        query: 'alpha',
        milestone: 'Phase 2',
      });
      expect(result).toHaveLength(0);
    });

    it('returns empty when milestone matches but query does not', () => {
      const result = filterPending(mockTasks, {
        query: 'nonexistent',
        milestone: 'Phase 1',
      });
      expect(result).toHaveLength(0);
    });

    it('filters by milestone and owner query', () => {
      const result = filterPending(mockTasks, {
        query: '0xBBBB',
        milestone: 'Phase 2',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-2');
    });

    it('filters by milestone and partial vault name', () => {
      const result = filterPending(mockTasks, {
        query: 'gamma',
        milestone: 'Phase 1',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-3');
    });
  });

  describe('edge cases', () => {
    it('handles empty task array', () => {
      const result = filterPending([], { query: 'test' });
      expect(result).toEqual([]);
    });

    it('handles whitespace-only query', () => {
      const result = filterPending(mockTasks, { query: '   ' });
      expect(result).toEqual(mockTasks);
    });

    it('handles empty query', () => {
      const result = filterPending(mockTasks, { query: '' });
      expect(result).toEqual(mockTasks);
    });

    it('handles tab character query', () => {
      const result = filterPending(mockTasks, { query: '\t' });
      expect(result).toEqual(mockTasks);
    });

    it('handles newline character query', () => {
      const result = filterPending(mockTasks, { query: '\n' });
      expect(result).toEqual(mockTasks);
    });

    it('handles multiple whitespace characters query', () => {
      const result = filterPending(mockTasks, { query: ' \t\n \t' });
      expect(result).toEqual(mockTasks);
    });

    it('handles query with leading/trailing whitespace', () => {
      const result = filterPending(mockTasks, { query: '  alpha  ' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-1');
    });

    it('does not mutate input array', () => {
      const input = [...mockTasks];
      const original = JSON.stringify(input);
      filterPending(input, { query: 'test', milestone: 'Phase ' });
      expect(JSON.stringify(input)).toBe(original);
    });

    it('returns filtered array (not a reference to original)', () => {
      const result = filterPending(mockTasks, { query: 'test' });
      expect(result).not.toBe(mockTasks);
    });
  });

  describe('special characters in search', () => {
    it('matches owner with special hex characters', () => {
      const tasksWithSpecial = [
        createTask({
          id: 'v-1',
          owner: '0xaAbBbCcDeEfF',
        }),
      ];
      const result = filterPending(tasksWithSpecial, { query: '0xaabbcc' });
      expect(result).toHaveLength(1);
    });

    it('handles vault names with special characters', () => {
      const tasksWithSpecial = [
        createTask({
          id: 'v-1',
          vaultName: 'Vault-Name (Test)',
        }),
      ];
      const result = filterPending(tasksWithSpecial, { query: 'vault-name' });
      expect(result).toHaveLength(1);
    });
  });

  describe('no-match scenarios', () => {
    it('returns empty array when query does not match any vault name or owner', () => {
      const result = filterPending(mockTasks, { query: 'zzznomatch' });
      expect(result).toHaveLength(0);
    });

    it('returns empty array when milestone does not match any task', () => {
      const result = filterPending(mockTasks, { milestone: 'Phase 99' });
      expect(result).toHaveLength(0);
    });

    it('returns empty array when both filters narrow to nothing', () => {
      const result = filterPending(mockTasks, { query: 'alpha', milestone: 'Phase 3' });
      expect(result).toHaveLength(0);
    });

    it('returns empty array when tasks list is empty and milestone is provided', () => {
      const result = filterPending([], { milestone: 'Phase 1' });
      expect(result).toHaveLength(0);
    });
  });

  describe('owner-only match assertions', () => {
    it('returns task matched by owner alone when vault name does not match', () => {
      const tasks = [
        createTask({ id: 'v-1', vaultName: 'Unrelated Name', owner: '0xUNIQUEOWNER' }),
      ];
      const result = filterPending(tasks, { query: 'uniqueowner' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-1');
    });

    it('does not return task when only vault name would match but query is owner-specific', () => {
      const tasks = [
        createTask({ id: 'v-1', vaultName: 'SomeVault', owner: '0xAAAA' }),
        createTask({ id: 'v-2', vaultName: 'OtherVault', owner: '0xSPECIAL' }),
      ];
      const result = filterPending(tasks, { query: '0xspecial' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('v-2');
    });

    it('matches owner case-insensitively with mixed-case query', () => {
      const tasks = [
        createTask({ id: 'v-1', owner: '0xAbCdEf' }),
      ];
      const resultLower = filterPending(tasks, { query: '0xabcdef' });
      const resultUpper = filterPending(tasks, { query: '0XABCDEF' });
      const resultMixed = filterPending(tasks, { query: '0xAbCdEf' });
      expect(resultLower).toHaveLength(1);
      expect(resultUpper).toHaveLength(1);
      expect(resultMixed).toHaveLength(1);
    });
  });

  describe('milestone partial match and edge cases', () => {
    it('does not perform partial milestone matching (exact match only)', () => {
      // milestone filter uses strict equality, not substring
      const result = filterPending(mockTasks, { milestone: 'Phase' });
      expect(result).toHaveLength(0);
    });

    it('milestone filter with empty string returns all tasks', () => {
      const result = filterPending(mockTasks, { milestone: '' });
      expect(result).toHaveLength(mockTasks.length);
    });

    it('milestone filter is case-sensitive — uppercase mismatch returns empty', () => {
      const result = filterPending(mockTasks, { milestone: 'PHASE 1' });
      expect(result).toHaveLength(0);
    });

    it('milestone filter is case-sensitive — exact case returns correct tasks', () => {
      const result = filterPending(mockTasks, { milestone: 'Phase 1' });
      expect(result.every((t) => t.milestone === 'Phase 1')).toBe(true);
    });
  });

  describe('combined filter narrowing', () => {
    it('combined query+milestone narrows more than either alone', () => {
      const phase1Results = filterPending(mockTasks, { milestone: 'Phase 1' });
      const queryResults = filterPending(mockTasks, { query: 'alpha' });
      const combined = filterPending(mockTasks, { query: 'alpha', milestone: 'Phase ' });
      expect(combined.length).toBeLessThanOrEqual(phase1Results.length);
      expect(combined.length).toBeLessThanOrEqual(queryResults.length);
      expect(combined).toHaveLength(1);
    });
  });
});
