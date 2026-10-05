import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import type { PaginationResult } from "@/utils/paginate";
import { FULL_PAGE_LIST_LIMIT, getPageControls } from "@/utils/paginationWindow";

interface PaginationProps {
  pagination: Pick<
    PaginationResult<unknown>,
    "currentPage" | "pageCount" | "totalItems"
  >;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
  className?: string;
  /**
   * Offers a "Jump to page" field once the dataset is large enough to be
   * windowed (more than `FULL_PAGE_LIST_LIMIT` pages). Off by default: small
   * lists keep the exact same markup as before. Without it, landing on a page in
   * the middle of a windowed range takes one click per page.
   */
  showJumpToPage?: boolean;
}

export function Pagination({
  pagination,
  onPageChange,
  ariaLabel = "Pagination",
  className = "",
  showJumpToPage = false,
}: PaginationProps) {
  const { currentPage, pageCount, totalItems } = pagination;
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= pageCount;
  const pages = getPageControls(currentPage, pageCount);

  const jumpInputId = `${useId()}-jump-page`;
  const jumpErrorId = `${jumpInputId}-error`;
  const [jumpValue, setJumpValue] = useState("");
  const [jumpError, setJumpError] = useState<string | null>(null);
  const showJumpToPageControl =
    showJumpToPage && pageCount > FULL_PAGE_LIST_LIMIT;

  const handleJumpSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requested = Number(jumpValue.trim());

    if (
      !Number.isInteger(requested) ||
      requested < 1 ||
      requested > pageCount
    ) {
      setJumpError(`Enter a page number between 1 and ${pageCount}.`);
      return;
    }

    setJumpError(null);
    setJumpValue("");
    if (requested !== currentPage) {
      onPageChange(requested);
    }
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <p className="text-sm text-gray-600" aria-live="polite">
        Page {currentPage} of {pageCount}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={isFirstPage}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex items-center gap-1 rounded bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Go to previous page"
        >
          <ChevronLeft aria-hidden="true" size={16} />
          Previous
        </button>

        <div className="flex flex-wrap justify-center gap-1">
          {pages.map((page, index) =>
            page === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="inline-flex h-9 min-w-9 items-center justify-center rounded px-3 text-sm text-gray-500"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={page}
                type="button"
                onClick={() => onPageChange(page)}
                aria-label={`Go to page ${page}`}
                aria-current={page === currentPage ? "page" : undefined}
                className={`h-9 min-w-9 rounded px-3 text-sm font-medium ${
                  page === currentPage
                    ? "bg-[var(--accent)] text-[var(--bg)]"
                    : "bg-[var(--surface)] text-[var(--text)] ring-1 ring-gray-300 hover:bg-gray-100"
                }`}
              >
                {page}
              </button>
            ),
          )}
        </div>

        <button
          type="button"
          disabled={isLastPage}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex items-center gap-1 rounded bg-[var(--accent)] px-3 py-2 text-sm text-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Go to next page"
        >
          Next
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>

      {/*
       * `noValidate`: native constraint validation would otherwise block the
       * submit for out-of-range input and show a browser tooltip instead of our
       * own screen-reader-announced error, leaving the handler unreachable.
       */}
      {showJumpToPageControl && (
        <form
          className="flex flex-wrap items-center justify-center gap-2"
          noValidate
          onSubmit={handleJumpSubmit}
        >
          <label className="text-sm text-gray-600" htmlFor={jumpInputId}>
            Jump to page
          </label>
          <input
            id={jumpInputId}
            type="number"
            min={1}
            max={pageCount}
            inputMode="numeric"
            value={jumpValue}
            onChange={(event) => {
              setJumpValue(event.target.value);
              setJumpError(null);
            }}
            aria-invalid={jumpError ? true : undefined}
            aria-describedby={jumpError ? jumpErrorId : undefined}
            className="h-9 w-20 rounded bg-[var(--surface)] px-2 text-sm text-[var(--text)] ring-1 ring-gray-300"
          />
          <button
            type="submit"
            className="h-9 rounded bg-[var(--surface)] px-3 text-sm font-medium text-[var(--text)] ring-1 ring-gray-300 hover:bg-gray-100"
          >
            Go
          </button>
          {jumpError && (
            <p
              id={jumpErrorId}
              role="alert"
              className="w-full text-center text-sm text-red-600"
            >
              {jumpError}
            </p>
          )}
        </form>
      )}

      <span className="sr-only">{totalItems} total items</span>
    </nav>
  );
}
