/**
 * Filters pending validation tasks by search query and milestone.
 *
 * @param tasks - Array of pending validation tasks
 * @param options - Options for filtering
 * @param options.query - Search query to match against vaultName and owner (case-insensitive)
 * @param options.milestone - Milestone to filter by; undefined or empty string returns all milestones
 * @returns Filtered array of tasks
 */
import type { ValidationTask } from '../Zustand/Store';

export interface FilterOptions {
  query?: string;
  milestone?: string;
}

export type PendingTask = ValidationTask;

/**
 * Normalizes a filter value to a trimmed string.
 *
 * This guarantees that non-string inputs (possible at runtime from
 * untyped callers or stale persisted state) never cause a throw or a
 * silent mismatch. Null / undefined become an empty string.
 */
function normalizeFilterValue(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

/**
 * Normalizes a task field used for matching into a lowercase string.
 *
 * Tasks are expected to carry string vaults, but this guard prevents
 * a malformed/partially loaded task from crashing the filter and from
 * producing false negatives.
 */
function normalizeTaskField(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.toLowerCase();
}

/**
 * Filters pending validation tasks by search query and milestone.
 *
 * Invariants:
 * - The function is pure and deterministic: given the same inputs it
 *   always returns the same output and never mutates the input array.
 * - Order of the input array is preserved in the output.
 * - Non-string or missing options are treated as "no filter" rather than
 *   throwing, so adverse inputs cannot crash the UI.
 * - A task matches the query if either its vaultName or owner contains
 *   the trimmed, lowercased query substring.
 * - A task matches the milestone filter only when the normalized milestone
 *   is empty (no filter) or exactly equals the task's milestone.
 *
 * @param tasks - Array of pending validation tasks
 * @param options - Options for filtering
 * @param options.query - Search query to match against vaultName and owner (case-insensitive)
 * @param options.milestone - Milestone to filter by; undefined or empty string returns all milestones
 * @returns Filtered array of tasks
 */
export function filterPending(
  tasks: PendingTask[],
  options: FilterOptions = {},
): PendingTask[] {
  // Guard against null/undefined inputs from untyped callers or stale state.
  if (!Array.isArray(tasks)) {
    return [];
  }

  const safeOptions = options ?? {};
  const normalizedQuery = normalizeFilterValue(safeOptions.query).toLowerCase();
  const normalizedMilestone = normalizeFilterValue(safeOptions.milestone);

  return tasks.filter((task) => {
    if (!task || typeof task !== 'object') {
      return false;
    }

    // Filter by milestone if provided
    if (normalize`Milestone) {
      const taskMilestone = normalizeFilterValue(task.milestone);
      if (taskMilestone !== normalizedMilestone) {
        return false;
      }
    }

    // Filter by search query if provided (case-insensitive match on vaultName or owner)
    if (normalizedQuery) {
      const vaultNameMatch = normalizeTaskField(task.vaultName).includes(normalizedQuery);
      const ownerMatch = normalizeTaskField(task.owner).includes(normalizedQuery);

      if (!vaultNameMatch && !ownerMatch) {
        return false;
      }
    }

    return true;
  });
}
