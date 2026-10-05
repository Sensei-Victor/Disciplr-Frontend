/**
 * paginationWindow – bounds the page controls rendered by `components/Pagination.tsx`.
 *
 * Rendering one button per page does not scale: a 200-page result set produced
 * 200 buttons in a single flex-wrapped row, all of them re-rendered on every
 * page change. This helper collapses the list to a sliding window around the
 * active page, keeps the first and last page pinned (so both ends stay one click
 * away) and represents each skipped range with an `"ellipsis"` placeholder.
 *
 * Invariants — property-tested in `__tests__/paginationWindow.test.ts`:
 *  - the result holds at most `MAX_PAGE_CONTROLS` entries for *any* `pageCount`,
 *    so the rendered DOM stays bounded for arbitrarily large datasets;
 *  - page numbers are unique and ascending, and never duplicate a neighbour of
 *    the pinned first/last page;
 *  - the first and last page are always present when `pageCount >= 1`;
 *  - every returned page number lies inside `[1, pageCount]` — the helper is
 *    total, so non-finite or out-of-range input cannot produce a broken window.
 *
 * `paginate()` (`src/utils/paginate.ts`) already clamps `currentPage` and floors
 * `pageCount` at 1, so in practice consumers always pass sane values; the
 * sanitising here keeps the bound true even when they do not.
 */

/** Hard upper bound on entries (page numbers plus ellipsis placeholders). */
export const MAX_PAGE_CONTROLS = 7;

/**
 * Page counts at or below this value are rendered in full, with no windowing
 * (and therefore no ellipsis). Kept equal to `MAX_PAGE_CONTROLS` so the control
 * count is bounded by the same number in both regimes.
 */
export const FULL_PAGE_LIST_LIMIT = MAX_PAGE_CONTROLS;

/** Pages shown immediately before and after the active page inside the window. */
const NEIGHBOUR_RADIUS = 1;

/** Consecutive pages pinned to the edge when the active page is near an end. */
const EDGE_BLOCK_SIZE = 5;

/** A single rendered control: a page number, or a placeholder for a skipped range. */
export type PageControl = number | "ellipsis";

function sanitizePageCount(pageCount: number): number {
  if (!Number.isFinite(pageCount)) return 0;
  return Math.max(0, Math.floor(pageCount));
}

function sanitizeCurrentPage(currentPage: number, pageCount: number): number {
  if (!Number.isFinite(currentPage)) return 1;
  return Math.min(Math.max(1, Math.floor(currentPage)), pageCount);
}

function pageRange(from: number, to: number): number[] {
  const length = Math.max(0, to - from + 1);
  return Array.from({ length }, (_, index) => from + index);
}

/**
 * Returns the controls to render for `currentPage` out of `pageCount` pages.
 *
 * Three shapes are possible once windowing is active, all of which total at
 * most `MAX_PAGE_CONTROLS` entries:
 *
 *  1. near the start:  `1 2 3 4 5 … pageCount`
 *  2. near the end:    `1 … pageCount-4 … pageCount`
 *  3. in the middle:   `1 … currentPage-1 currentPage currentPage+1 … pageCount`
 *
 * @param currentPage Clamped into `[1, pageCount]` (falls back to 1).
 * @param pageCount   Floored at 0; `0` yields an empty window.
 */
export function getPageControls(
  currentPage: number,
  pageCount: number,
): PageControl[] {
  const total = sanitizePageCount(pageCount);
  if (total === 0) return [];
  if (total <= FULL_PAGE_LIST_LIMIT) return pageRange(1, total);

  const page = sanitizeCurrentPage(currentPage, total);
  const nearStart = page <= 1 + NEIGHBOUR_RADIUS * 2;
  const nearEnd = page >= total - NEIGHBOUR_RADIUS * 2;

  if (nearStart && !nearEnd) {
    return [...pageRange(1, EDGE_BLOCK_SIZE), "ellipsis", total];
  }

  if (nearEnd && !nearStart) {
    return [1, "ellipsis", ...pageRange(total - EDGE_BLOCK_SIZE + 1, total)];
  }

  return [
    1,
    "ellipsis",
    page - NEIGHBOUR_RADIUS,
    page,
    page + NEIGHBOUR_RADIUS,
    "ellipsis",
    total,
  ];
}
