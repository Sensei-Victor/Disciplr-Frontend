import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FULL_PAGE_LIST_LIMIT,
  MAX_PAGE_CONTROLS,
  getPageControls,
  type PageControl,
} from '../paginationWindow';

/**
 * The implementation that shipped before this helper was extracted, kept here as
 * a reference oracle so the exhaustive test below proves the windowing shape is
 * unchanged for every valid input.
 */
function referenceGetPageControls(
  currentPage: number,
  pageCount: number,
): PageControl[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const leftSibling = Math.max(currentPage - 1, 2);
  const rightSibling = Math.min(currentPage + 1, pageCount - 1);
  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < pageCount - 1;

  if (!showLeftDots && showRightDots) {
    return [1, 2, 3, 4, 5, 'ellipsis', pageCount];
  }

  if (showLeftDots && !showRightDots) {
    return [
      1,
      'ellipsis',
      pageCount - 4,
      pageCount - 3,
      pageCount - 2,
      pageCount - 1,
      pageCount,
    ];
  }

  return [
    1,
    'ellipsis',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis',
    pageCount,
  ];
}

const pageNumbers = (controls: PageControl[]): number[] =>
  controls.filter((control): control is number => typeof control === 'number');

const sanitizedPageCount = (pageCount: number): number =>
  Number.isFinite(pageCount) ? Math.max(0, Math.floor(pageCount)) : 0;

/** Any number a JS caller could hand us, ignoring TypeScript. */
const anyNumber = fc.oneof(
  fc.integer({ min: -10_000, max: 1_000_000 }),
  fc.double(),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
  fc.constant(1.5),
  fc.constant(-0.5),
);

describe('getPageControls', () => {
  it('matches the previous inline windowing implementation for every in-range page', () => {
    for (let pageCount = 1; pageCount <= 300; pageCount += 1) {
      for (let currentPage = 1; currentPage <= pageCount; currentPage += 1) {
        expect(
          getPageControls(currentPage, pageCount),
          `page ${currentPage} of ${pageCount}`,
        ).toEqual(referenceGetPageControls(currentPage, pageCount));
      }
    }
  });

  it('renders every page in full while the list is small enough', () => {
    for (let pageCount = 1; pageCount <= FULL_PAGE_LIST_LIMIT; pageCount += 1) {
      const controls = getPageControls(1, pageCount);
      expect(controls).toEqual(
        Array.from({ length: pageCount }, (_, index) => index + 1),
      );
      expect(controls).not.toContain('ellipsis');
    }
  });

  it('describes a stable window at each boundary of a large page count', () => {
    const pageCount = 200;

    expect(getPageControls(1, pageCount)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 200]);
    expect(getPageControls(3, pageCount)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 200]);
    expect(getPageControls(4, pageCount)).toEqual([1, 'ellipsis', 3, 4, 5, 'ellipsis', 200]);
    expect(getPageControls(100, pageCount)).toEqual([
      1,
      'ellipsis',
      99,
      100,
      101,
      'ellipsis',
      200,
    ]);
    expect(getPageControls(197, pageCount)).toEqual([
      1,
      'ellipsis',
      196,
      197,
      198,
      'ellipsis',
      200,
    ]);
    expect(getPageControls(198, pageCount)).toEqual([
      1,
      'ellipsis',
      196,
      197,
      198,
      199,
      200,
    ]);
    expect(getPageControls(200, pageCount)).toEqual([
      1,
      'ellipsis',
      196,
      197,
      198,
      199,
      200,
    ]);
  });

  it('returns an empty window when there are no pages', () => {
    expect(getPageControls(1, 0)).toEqual([]);
    expect(getPageControls(5, 0)).toEqual([]);
    expect(getPageControls(1, -20)).toEqual([]);
    expect(getPageControls(1, Number.NaN)).toEqual([]);
  });

  it('clamps an out-of-range current page instead of emitting a broken window', () => {
    expect(getPageControls(-5, 200)).toEqual(getPageControls(1, 200));
    expect(getPageControls(0, 200)).toEqual(getPageControls(1, 200));
    expect(getPageControls(9_999, 200)).toEqual(getPageControls(200, 200));
    expect(getPageControls(Number.NaN, 200)).toEqual(getPageControls(1, 200));
  });

  it('is total: no input can make it throw or emit an out-of-range page', () => {
    fc.assert(
      fc.property(anyNumber, anyNumber, (currentPage, pageCount) => {
        const controls = getPageControls(currentPage, pageCount);
        const total = sanitizedPageCount(pageCount);

        expect(controls.length).toBeLessThanOrEqual(MAX_PAGE_CONTROLS);

        for (const control of controls) {
          if (control === 'ellipsis') continue;
          expect(Number.isInteger(control)).toBe(true);
          expect(control).toBeGreaterThanOrEqual(1);
          expect(control).toBeLessThanOrEqual(total);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('keeps every window bounded and well formed for arbitrary page counts', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: -50_000, max: 2_000_000 }),
        (pageCount, currentPage) => {
          const controls = getPageControls(currentPage, pageCount);
          const numbers = pageNumbers(controls);
          const ellipses = controls.filter((control) => control === 'ellipsis');

          // Bounded regardless of pageCount — the point of the windowing.
          expect(controls.length).toBeLessThanOrEqual(MAX_PAGE_CONTROLS);
          expect(numbers.length).toBeLessThanOrEqual(MAX_PAGE_CONTROLS);

          // Unique and ascending, so keys and the visual order are stable.
          expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
          expect(new Set(numbers).size).toBe(numbers.length);

          // Both ends stay one click away.
          expect(numbers).toContain(1);
          expect(numbers).toContain(pageCount);

          // Placeholders only ever stand in for skipped ranges.
          expect(ellipses.length).toBeLessThanOrEqual(2);
          expect(controls[0]).not.toBe('ellipsis');
          expect(controls[controls.length - 1]).not.toBe('ellipsis');
          for (let index = 1; index < controls.length; index += 1) {
            expect(
              controls[index] === 'ellipsis' && controls[index - 1] === 'ellipsis',
            ).toBe(false);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('never renders more buttons than the bound, however large the dataset', () => {
    for (const pageCount of [8, 200, 1_000, 12_345, 1_000_000, 5_000_000]) {
      for (const currentPage of [1, 2, 3, 4, Math.ceil(pageCount / 2), pageCount - 3, pageCount - 2, pageCount - 1, pageCount]) {
        const numbers = pageNumbers(getPageControls(currentPage, pageCount));
        expect(numbers.length).toBeLessThanOrEqual(MAX_PAGE_CONTROLS);
      }
    }
  });
});

describe('paginationWindow constants', () => {
  it('publishes a single bound shared by both regimes', () => {
    expect(MAX_PAGE_CONTROLS).toBe(7);
    expect(FULL_PAGE_LIST_LIMIT).toBe(MAX_PAGE_CONTROLS);
  });
});
