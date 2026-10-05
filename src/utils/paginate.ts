import type { ValidationTask } from '../Zustand/Store';

export type ValidationHistoryStatusFilter = 'all' | 'approved' | 'rejected';

export interface ValidationHistoryFilterOptions {
  status: ValidationHistoryStatusFilter;
  query: string;
  from?: string;
  to?: string;
  milestone?: string;
}

export interface PaginationResult<T> {
  items: T[];
  currentPage: number;
  pageCount: number;
  totalItems: number;
  pageSize: number;
}

export function filterValidationHistory(
  tasks: ValidationTask[],
  { status, query, from, to, milestone }: ValidationHistoryFilterOptions,
): ValidationTask[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedMilestone = milestone?.trim().toLowerCase() ?? '';

  return tasks.filter((task) => {
    const matchesStatus = status === 'all' || task.status === status;
    // `ValidationTask` types these as required strings, but the store is
    // hydrated from persisted/remote data, so they can be missing at
    // runtime. Coerce rather than calling `.toLowerCase()` directly:
    // a partially-populated task must be filtered out, not crash the page.
    const matchesQuery =
      normalizedQuery.length === 0 ||
      (task.vaultName ?? '').toLowerCase().includes(normalizedQuery) ||
      (task.owner ?? '').toLowerCase().includes(normalizedQuery);
    const matchesFrom = !from || task.deadline >= from;
    const matchesTo = !to || task.deadline <= to;
    const matchesMilestone =
      normalizedMilestone.length === 0 ||
      (task.milestone ?? '').toLowerCase().includes(normalizedMilestone);

    return matchesStatus && matchesQuery && matchesFrom && matchesTo && matchesMilestone;
  });
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginationResult<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (currentPage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    currentPage,
    pageCount,
    totalItems: items.length,
    pageSize: safePageSize,
  };
}
