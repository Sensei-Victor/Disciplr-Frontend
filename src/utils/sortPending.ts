import type { ValidationTask } from '../Zustand/Store';

export type PendingSortKey = 'deadline' | 'amount' | 'vaultName';
export type SortDirection = 'asc' | 'desc';

const SORT_KEYS: readonly PendingSortKey[] = ['deadline', 'amount', 'vaultName'];

export const isSortKey = (value: unknown): value is PendingSortKey =>
  typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);

export const isSortDirection = (value: unknown): value is SortDirection =>
  value === 'asc' || value === 'desc';

/**
 * Parse a human-readable amount string into a finite number.
 *
 * Invariants:
 * - Always returns a finite number (never NaN or Infinity) so comparisons
 *   remain deterministic and totally ordered.
 * - Negative values and thousands separators are honored.
 * - Unparseable input degrades to 0 rather than throwing, so sorting a
 *   partially malformed list never fails.
 */
const parseAmount = (amount: unknown): number => {
  if (typeof amount !== 'string') {
    return 0;
  }

  const normalized = amount.replace(/,/g, '').trim();
  if (normalized.length === 0) {
    return 0;
  }

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return 0;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Parse a deadline into a comparable numeric timestamp.
 *
 * Invariants:
 * - Missing or invalid deadlines map to +Infinity so they always sort
 *   last in ascending order and never disrupt valid entries.
 * - Never returns NaN, which would make the comparator non-total.
 */
const parseDeadline = (task: ValidationTask): number => {
  const raw = task?.deadline;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
};

const normalizeVaultName = (task: ValidationTask): string =>
  typeof task?.vaultName === 'string' ? task.vaultName : '';

const compareTasks = (
  a: ValidationTask,
  b: ValidationTask,
  key: PendingSortKey,
): number => {
  switch (key) {
    case 'amount':
      return parseAmount(a?.amount) - parseAmount(b?.amount);
    case 'vaultName':
      return normalizeVaultName(a).localeCompare(normalizeVaultName(b), undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    case 'deadline':
    default:
      return parseDeadline(a) - parseDeadline(b);
  }
};

/**
 * Deterministically sort pending validation tasks.
 *
 * Invariants:
 * - Pure and non-mutating: the input array and its elements are never mutated.
 * - Stable: tasks that compare equal retain their original relative order.
 * - Total ordering: comparators always return a finite number, never NaN.
 * - Fail-safe: malformed or missing fields degrade to deterministic defaults
 *   rather than throwing or producing an unstable order.
 * - Repeatable: identical inputs always produce identical outputs.
 */
export function sortPending(
  tasks: ValidationTask[],
  key: PendingSortKey,
  dir: SortDirection,
): ValidationTask {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  const safeKey: PendingSortKey = isSortKey(key) ? key : 'deadline';
  const direction = dir === 'desc' ? -1 : 1;

  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const compared = compareTasks(a.task, b.task, safeKey);
      // Stable tie-break on original index so equal keys never reorder.
      return compared === 0 ? a.index - b.index : compared * direction;
    })
    .map(({ task }) => task);
}
