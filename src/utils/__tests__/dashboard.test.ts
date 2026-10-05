import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  daysRemaining,
  urgencyColor,
  relativeTime,
  formatSummary,
  processDeadlines,
  processActivity,
  computeDashboardSummary,
  type Deadline,
  type Activity,
} from '../dashboard';
import type { Vault, VaultStatus } from '../../types/vault';

describe('Dashboard Utility Helpers', () => {
  // A fixed timestamp representing 2026-06-27T12:00:00Z
  const MOCK_NOW = new Date('2026-06-27T12:00:00Z').getTime();

  describe('daysRemaining', () => {
    it('returns positive days when deadline is in the future', () => {
      // 2026-06-29T12:00:00Z is exactly 2 days in the future
      const deadline = '2026-06-29T12:00:00Z';
      expect(daysRemaining(deadline, MOCK_NOW)).toBe(2);
    });

    it('returns 0 when deadline is exactly now, negative when in the past', () => {
      const deadlineNow = '2026-06-27T12:00:00Z';
      const deadlinePast = '2026-06-25T12:00:00Z';
      expect(daysRemaining(deadlineNow, MOCK_NOW)).toBe(0);
      expect(daysRemaining(deadlinePast, MOCK_NOW)).toBe(-2);
    });

    it('rounds up partial days remaining', () => {
      // 1.1 days in the future should round up to 2
      const deadline = '2026-06-28T14:24:00Z';
      expect(daysRemaining(deadline, MOCK_NOW)).toBe(2);
    });

    it('returns NaN for an invalid deadline string', () => {
      expect(Number.isNaN(daysRemaining('not-a-date', MOCK_NOW))).toBe(true);
    });

    it('returns NaN for an empty deadline string', () => {
      expect(Number.isNaN(daysRemaining('', MOCK_NOW))).toBe(true);
    });

    it('treats a boundary deadline just over 24 hours as 2 days', () => {
      // 24 h| 1 ms in the future -> ceil to 2 days
      const deadline = new Date(MOCK_NOW + 24 * 60 * 60 * 1000 + 1).toISOString();
      expect(daysRemaining(deadline, MOCK_NOW)).toBe(2);
    });
  });

  describe('urgencyColor', () => {
    it('returns danger color when days remaining is 7 or less', () => {
      expect(urgencyColor(0)).toBe('var(--danger)');
      expect(urgencyColor(5)).toBe('var(--danger)');
      expect(urgencyColor(7)).toBe('var(--danger)');
    });

    it('returns warning color when days remaining is between 8 and 30', () => {
      expect(urgencyColor(8)).toBe('var(--warning)');
      expect(urgencyColor(15)).toBe('var(--warning)');
      expect(urgencyColor(30)).toBe('var(--warning)');
    });

    it('returns success color when days remaining is greater than 30', () => {
      expect(urgencyColor(31)).toBe('var(--success)');
      expect(urgencyColor(100)).toBe('var(--success)');
    });

    it('returns danger color for negative days remaining (overdue)', () => {
      expect(urgencyColor(-1)).toBe('var(--danger)');
      expect(urgencyColor(-100)).toBe('var(--danger)');
    });

    it('returns danger color for NaN (fail-closed)', () => {
      expect(urgencyColor(NaN)).toBe('var(--danger)');
    });
  });

  // relativeTime delegates to the shared Intl.RelativeTimeFormat-based
  // formatRelativeTime() utility (see src/utils/relativeTime.ts), which
  // produces spelled-out units ("30 minutes ago") rather than abbreviations.
  describe('relativeTime', () => {
    it('returns a minutes-ago string when difference is less than an hour', () => {
      // 30 minutes ago
      const iso = new Date(MOCK_NOW - 30 * 60 * 1000).toISOString();
      expect(relativeTime(iso, MOCK_NOW)).toBe('30 minutes ago');
    });

    it('returns "X hours ago" when difference is between 1 and 24 hours', () => {
      // 5 hours ago
      const iso = new Date(MOCK_NOW - 5 * 60 * 60 * 1000).toISOString();
      expect(relativeTime(iso, MOCK_NOW)).toBe('5 hours ago');
    });

    it('returns "X days ago" when difference is 24 hours or more', () => {
      // 3 days ago
      const iso = new Date(MOCK_NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
      expect(relativeTime(iso, MOCK_NOW)).toBe('3 days ago');
    });

    it('returns an empty string for an invalid timestamp', () => {
      expect(relativeTime('not-a-date', MOCK_NOW)).toBe('');
    });

    it('returns an empty string for an empty timestamp', () => {
      expect(relativeTime('', MOCK_NOW)).toBe('');
    });
  });

  describe('formatSummary', () => {
    it('formats summary numbers and rates properly', () => {
      const summary = {
        totalLocked: 1250500,
        activeVaults: 15,
        pendingMilestones: 4,
        completionRate: 85,
      };

      const formatted = formatSummary(summary);
      expect(formatted).toEqual({
        totalLocked: '$1,250,500',
        activeVaults: '15',
        pendingMilestones: '4',
        completionRate: '85%',
      });
    });

    it('formats zero values without throwing', () => {
      const formatted = formatSummary({
        totalLocked: 0,
        activeVaults: 0,
        pendingMilestones: 0,
        completionRate: 0,
      });
      expect(formatted).toEqual({
        totalLocked: '$0',
        activeVaults: '0',
        pendingMilestones: '0',
        completionRate: '0%',
      });
    });

    it('formats fractional amounts without losing precision', () => {
      const formatted = formatSummary({
        totalLocked: 1234.56,
        activeVaults: 1,
        pendingMilestones: 1,
        completionRate: 50,
      });
      expect(formatted.totalLocked).toBe(Number(1234.56).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
    });
  });

  describe('processDeadlines', () => {
    it('returns an empty array when given an empty list', () => {
      expect(processDeadlines([], MOCK_NOW)).toEqual([]);
    });

    it('sorts deadlines in ascending order of deadline date and formats items', () => {
      const deadlines: Deadline[] = [
        { id: '2', name: 'Later Vault', deadline: '2026-07-10T12:00:00Z', amount: 1000 },
        { id: '1', name: 'Earlier Vault', deadline: '2026-06-30T12:00:00Z', amount: 5000 },
      ];

      const processed = processDeadlines(deadlines, MOCK_NOW);
      expect(processed).toHaveLength(2);

      // Check sorting order (Earlier Vault first)
      expect(processed[0].id).toBe('1');
      expect(processed[1].id).toBe('2');

      // Check formatted properties
      expect(processed[0].daysRemaining).toBe(3);
      expect(processed[0].urgencyColor).toBe('var(--danger)'); // <= 7 days
      expect(processed[0].formattedDays).toBe('3d');
      expect(processed[0].formattedAmount).toBe('5,000 USDC');
      expect(processed[0].formattedDate).toBe(Number('2026-06-30T12:00:00Z').toLocaleString('en-US', { month: 'short', day: 'numeric' }));

      expect(processed[1].daysRemaining).toBe(13);
      expect(processed[1].urgencyColor).toBe('var(--warning)'); // <= 30 days
      expect(processed[1].formattedDays).toBe('13d');
      expect(processed[1].formattedAmount).toBe('1,000 USDC');
      expect(processed[1].formattedDate).toBe(Number('2026-07-10T12:00:00Z').toLocaleString('en-US', { month: 'short', day: 'numeric' }));
    });

    it('handles a single deadline item correctly', () => {
      const deadlines: Deadline[] = [
        { id: '1', name: 'Single Vault', deadline: '2026-06-27T12:00:00Z', amount: 250 },
      ];
      const processed = processDeadlines(deadlines, MOCK_NOW);
      expect(processed).toHaveLength(1);
      expect(processed[0].formattedDays).toBe('Today');
    });

    it('formats overdue deadlines with signed daysRemaining and holds urgency at danger', () => {
      const deadlines: Deadline[] = [
        { id: '1', name: 'Overdue Vault', deadline: '2026-06-20T12:00:00Z', amount: 500 },
      ];
      const processed = processDeadlines(deadlines, MOCK_NOW);
      expect(processed[0].daysRemaining).toBe(-7);
      expect(processed[0].formattedDays).toBe('7d overdue');
      expect(processed[0].urgencyColor).toBe('var(--danger)');
    });

    it('does not mutate the input array or items', () => {
      const deadlines: Deadline[] = [
        { id: '2', name: 'Later Vault', deadline: '2026-07-10T12:00:00Z', amount: 1000 },
        { id: '1', name: 'Earlier Vault', deadline: '2026-06-30T12:00:00Z', amount: 5000 },
      ];
      const snapshot = JSON.parse(JSON.stringify(deadlines));
      processDeadlines(deadlines, MOCK_NOW);
      expect(deadlines).toEqual(snapshot);
    });

    it('produces deterministic output for duplicate ids', () => {
      const deadlines: Deadline[] = [
        { id: '1', name: 'A', deadline: '2026-06-30T12:00:00Z', amount: 100 },
        { id: '1', name: 'B', deadline: '2026-06-28T12:00:00Z', amount: 200 },
      ];
      const first = processDeadlines(deadlines, MOCK_NOW);
      const second = processDeadlines(deadlines, MOCK_NOW);
      expect(first).toEqual(second);
      expect(first).toHaveLength(2);
    });

    it('survives an invalid deadline without throwing', () => {
      const deadlines: Deadline[] = [
        { id: '1', name: 'Bad', deadline: 'not-a-date', amount: 100 },
      ];
      expect(() => processDeadlines(deadlines, MOCK_NOW)).not.toThrow();
    });
  });

  describe('processActivity', () => {
    it('returns an empty array when given an empty list', () => {
      expect(processActivity([], MOCK_NOW)).toEqual([]);
    });

    it('sorts activities in descending order of timestamp (newest first) and formats items', () => {
      const activities: Activity[] = [
        { id: 'a2', type: 'created', vault: 'Alpha Vault', timestamp: '2026-06-25T12:00:00Z', amount: 2000 },
        { id: 'a1', type: 'validated', vault: 'Beta Vault', timestamp: '2026-06-26T12:00:00Z' },
      ];

      const processed = processActivity(activities, MOCK_NOW);
      expect(processed).toHaveLength(2);

      // Check sorting order (newest timestamp first, which is a1)
      expect(processed[0].id).toBe('a1');
      expect(processed[1].id).toBe('a2');

      // Check formatting
      expect(processed[0].relativeTime).toBe('1 day ago'); // 2026-06-27T12:00:00 - 2026-06-26T12:00:00 = 24h
      expect(processed[0].formattedAmount).toBeUndefined();

      expect(processed[1].relativeTime).toBe('2 days ago'); // 48h
      expect(processed[1].formattedAmount).toBe('2,000 USDC');
    });

    it('handles a single activity item correctly', () => {
      const activities: Activity[] = [
        { id: 'a1', type: 'created', vault: 'Beta Vault', timestamp: '2026-06-27T11:45:00Z' },
      ];
      const processed = processActivity(activities, MOCK_NOW);
      expect(processed).toHaveLength(1);
      expect(processed[0].relativeTime).toBe('15 minutes ago');
    });

    it('does not mutate the input array or items', () => {
      const activities: Activity[] = [
        { id: 'a2', type: 'created', vault: 'Alpha Vault', timestamp: '2026-06-25T12:00:00Z', amount: 2000 },
        { id: 'a1', type: 'validated', vault: 'Beta Vault', timestamp: '2026-06-26T12:00:00Z' },
      ];
      const snapshot = JSON.parse(JSON.stringify(activities));
      processActivity(activities, MOCK_NOW);
      expect(activities).toEqual(snapshot);
    });

    it('produces deterministic output for duplicate ids', () => {
      const activities: Activity[] = [
        { id: 'a1', type: 'created', vault: 'A', timestamp: '2026-06-25T12:00:00Z' },
        { id: 'a1', type: 'validated', vault: 'B', timestamp: '2026-06-26T12:00:00Z' },
      ];
      const first = processActivity(activities, MOCK_NOW);
      const second = processActivity(activities, MOCK_NOW);
      expect(first).toEqual(second);
      expect(first).toHaveLength(2);
    });

    it('survives an invalid timestamp without throwing', () => {
      const activities: Activity[] = [
        { id: 'a1', type: 'created', vault: 'Bad', timestamp: 'not-a-date' },
      ];
      expect(() => processActivity(activities, MOCK_NOW)).not.toThrow();
    });
  });

  describe('computeDashboardSummary', () => {
    const makeVault = (
      id: string,
      status: VaultStatus,
      amount: number,
      pendingMilestoneCount: number = 0,
    ): Vault => ({
      id,
      name: `Vault ${id}`,
      amount,
      currency: 'USDC',
      status,
      createdAt: '2026-01-01T00:00:00Z',
      deadline: '2026-12-31T00:00:00Z',
      creatorAddress: 'GCREATOR',
      successAddress: 'GSUCCESS',
      failureAddress: 'GFAILURE',
      contractAddress: 'GCONTRACT',
      milestones: Array.from({ length: pendingMilestoneCount }, (_, i) => ({
        id: `m${i}`,
        title: `Milestone ${i}`,
        description: 'Test milestone',
        criteria: 'Test criteria',
        status: 'pending' as const,
      })),
      transactions: [],
    });

    it('returns all zeros for an empty vault list', () => {
      expect(computeDashboardSummary([])).toEqual({
        totalLocked: 0,
        activeVaults: 0,
        pendingMilestones: 0,
        completionRate: 0,
      });
    });

    it('sums amounts only for active and pending_validation vaults', () => {
      const vaults = [
        makeVault('1', 'active', 1000),
        makeVault('2', 'pending_validation', 500),
        makeVault('3', 'completed', 200),
        makeVault('4', 'failed', 300),
      ];
      const result = computeDashboardSummary(vaults);
      expect(result.totalLocked).toBe(1500);
      expect(result.activeVaults).toBe(2);
    });

    it('counts pending milestones across all vaults', () => {
      const vaults = [
        makeVault('1', 'active', 1000, 3),
        makeVault('2', 'active', 500, 2),
        makeVault('3', 'completed', 200, 0),
      ];
      const result = computeDashboardSummary(vaults);
      expect(result.pendingMilestones).toBe(5);
    });

    it('computes completionRate as completed/(completed+failed+cancelled)*100', () => {
      const vaults = [
        makeVault('1', 'completed', 100),
        makeVault('2', 'completed', 100),
        makeVault('3', 'failed', 100),
      ];
      const result = computeDashboardSummary(vaults);
      // 2 completed / 3 terminal = 66.67 → rounded to 67
      expect(result.completionRate).toBe(67);
    });

    it('returns completionRate 0 when no terminal vaults (divide-by-zero guard)', () => {
      const vaults = [makeVault('1', 'active', 500)];
      expect(computeDashboardSummary(vaults).completionRate).toBe(0);
    });

    it('returns completionRate 100 when all terminal vaults are completed', () => {
      const vaults = [
        makeVault('1', 'completed', 100),
        makeVault('2', 'completed', 200),
      ];
      expect(computeDashboardSummary(vaults).completionRate).toBe(100);
    });

    it('returns completionRate 0 when all terminal vaults are failed', () => {
      const vaults = [
        makeVault('1', 'failed', 100),
        makeVault('2', 'cancelled', 50),
      ];
      expect(computeDashboardSummary(vaults).completionRate).toBe(0);
    });

    it('handles mixed statuses correctly end-to-end', () => {
      const vaults = [
        makeVault('1', 'active', 1000, 2),
        makeVault('2', 'active', 2000, 1),
        makeVault('3', 'pending_validation', 500, 3),
        makeVault('4', 'completed', 0, 0),
        makeVault('5', 'failed', 0, 0),
        makeVault('6', 'cancelled', 0, 0),
      ];
      const result = computeDashboardSummary(vaults);
      expect(result.totalLocked).toBe(3500);
      expect(result.activeVaults).toBe(3);
      expect(result.pendingMilestones).toBe(6);
      // 1 completed / 3 terminal = 33.33 → rounded to 33
      expect(result.completionRate).toBe(33);
    });

    it('treats unknown status as non-active and non-terminal', () => {
      const vaults = [
        makeVault('1', 'active', 1000),
        makeVault('2', 'unknown' as VaultStatus, 9999),
      ];
      const result = computeDashboardSummary(vaults);
      expect(result.totalLocked).toBe(1000);
      expect(result.activeVaults).toBe(1);
      expect(result.completionRate).toBe(0);
    });

    it('ignores negative and NaN amounts in totalLocked', () => {
      const vaults = [
        makeVault('1', 'active', 1000),
        makeVault('2', 'active', -500),
        makeVault('3', 'active', NaN),
      ];
      const result = computeDashboardSummary(vaults);
      expect(Number.isFinite(result.totalLocked)).toBe(true);
      expect(result.totalLocked).toBe(1000);
    });

    it('is deterministic across repeated invocations', () => {
      const vaults = [
        makeVault('1', 'active', 1000, 2),
        makeVault('2', 'completed', 0, 0),
      ];
      expect(computeDashboardSummary(vaults)).toEqual(computeDashboardSummary(vaults));
    });

    it('does not mutate the input vault list', () => {
      const vaults = [makeVault('1', 'active', 1000, 2)];
      const snapshot = JSON.parse(JSON.stringify(vaults));
      computeDashboardSummary(vaults);
      expect(vaults).toEqual(snapshot);
    });
  });
});
