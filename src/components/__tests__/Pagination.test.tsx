import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "../Pagination";
import { paginate } from "@/utils/paginate";
import { FULL_PAGE_LIST_LIMIT, MAX_PAGE_CONTROLS } from "@/utils/paginationWindow";

const items = Array.from({ length: 12 }, (_, index) => index);

/** Page-number buttons only (excludes Previous/Next and the jump control). */
const pageButtons = () =>
  screen.getAllByRole("button", { name: /^Go to page \d+$/ });

describe("Pagination", () => {
  it("renders page status and numbered controls", () => {
    render(
      <Pagination
        pagination={paginate(items, 2, 5)}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Go to page 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Go to page 3" })).toBeEnabled();
  });

  it("calls onPageChange for previous, next, and numbered pages", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        pagination={paginate(items, 2, 5)}
        onPageChange={onPageChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Go to previous page" }));
    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    fireEvent.click(screen.getByRole("button", { name: "Go to page 3" }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
    expect(onPageChange).toHaveBeenNthCalledWith(3, 3);
  });

  it("disables previous on the first page and next on the last page", () => {
    const { rerender } = render(
      <Pagination
        pagination={paginate(items, 1, 5)}
        onPageChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Go to previous page" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeEnabled();

    rerender(
      <Pagination
        pagination={paginate(items, 3, 5)}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Go to previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeDisabled();
  });

  it("keeps controls bounded for empty and single-page results", () => {
    render(
      <Pagination
        pagination={paginate([], 10, 5)}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to previous page" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeDisabled();
    expect(screen.getByText("0 total items")).toBeInTheDocument();
  });

  it("renders a bounded window for large page counts", () => {
    render(
      <Pagination
        pagination={{ currentPage: 100, pageCount: 200, totalItems: 4000 }}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Go to page 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to page 200" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go to page 50" })).not.toBeInTheDocument();
    expect(pageButtons()).toHaveLength(5);
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("never renders more than the bound, however large the dataset", () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pagination
        pagination={{ currentPage: 1, pageCount: 8, totalItems: 40 }}
        onPageChange={onPageChange}
      />,
    );

    for (const pageCount of [8, 50, 200, 1_000, 5_000, 250_000]) {
      const currentPage = Math.ceil(pageCount / 2);

      rerender(
        <Pagination
          pagination={{ currentPage, pageCount, totalItems: pageCount * 5 }}
          onPageChange={onPageChange}
        />,
      );

      expect(screen.getByText(`Page ${currentPage} of ${pageCount}`)).toBeInTheDocument();
      // Page buttons + Previous/Next only. Nothing scales with pageCount.
      expect(pageButtons().length).toBeLessThanOrEqual(MAX_PAGE_CONTROLS);
      expect(screen.getAllByRole("button").length).toBeLessThanOrEqual(
        MAX_PAGE_CONTROLS + 2,
      );
      // Both ends remain one click away.
      expect(screen.getByRole("button", { name: "Go to page 1" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Go to page ${pageCount}` }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Go to page ${currentPage}` }),
      ).toHaveAttribute("aria-current", "page");
    }
  });

  it("hides the windowed placeholders from assistive technology", () => {
    render(
      <Pagination
        pagination={{ currentPage: 100, pageCount: 200, totalItems: 4000 }}
        onPageChange={vi.fn()}
      />,
    );

    for (const ellipsis of screen.getAllByText("…")) {
      expect(ellipsis).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("marks only the active page as current at both ends of a window", () => {
    const { rerender } = render(
      <Pagination
        pagination={{ currentPage: 1, pageCount: 200, totalItems: 1000 }}
        onPageChange={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("button", { current: "page" }),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Go to page 1" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    rerender(
      <Pagination
        pagination={{ currentPage: 200, pageCount: 200, totalItems: 1000 }}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { current: "page" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Go to page 200" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("Pagination jump to page", () => {
  const largePagination = {
    currentPage: 100,
    pageCount: 200,
    totalItems: 4000,
  };

  it("is not rendered unless it is explicitly requested", () => {
    render(<Pagination pagination={largePagination} onPageChange={vi.fn()} />);

    expect(screen.queryByLabelText("Jump to page")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
  });

  it("stays hidden while the list fits inside a single window", () => {
    const { rerender } = render(
      <Pagination
        pagination={{ currentPage: 1, pageCount: FULL_PAGE_LIST_LIMIT, totalItems: 35 }}
        onPageChange={vi.fn()}
        showJumpToPage
      />,
    );

    expect(screen.queryByLabelText("Jump to page")).not.toBeInTheDocument();

    rerender(
      <Pagination
        pagination={{ currentPage: 2, pageCount: 3, totalItems: 12 }}
        onPageChange={vi.fn()}
        showJumpToPage
      />,
    );

    expect(screen.queryByLabelText("Jump to page")).not.toBeInTheDocument();
  });

  it("renders a labelled, range-constrained field for large page counts", () => {
    render(
      <Pagination
        pagination={largePagination}
        onPageChange={vi.fn()}
        showJumpToPage
      />,
    );

    const input = screen.getByLabelText("Jump to page");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("max", "200");
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });

  it("jumps straight to a mid-range page that the window cannot reach", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        pagination={largePagination}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );

    const input = screen.getByLabelText("Jump to page");
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(150);
    expect(input).toHaveValue(null);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("accepts both boundary pages", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        pagination={largePagination}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );

    const input = screen.getByLabelText("Jump to page");

    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 200);
  });

  it("does not re-emit the page that is already active", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        pagination={largePagination}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );

    const input = screen.getByLabelText("Jump to page");
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(onPageChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submits on Enter without clicking Go", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <Pagination
        pagination={largePagination}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );

    await user.type(screen.getByLabelText("Jump to page"), "150{Enter}");

    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(150);
  });

  it.each([
    ["an out-of-range page", "500", "Enter a page number between 1 and 200."],
    ["zero", "0", "Enter a page number between 1 and 200."],
    ["a negative page", "-3", "Enter a page number between 1 and 200."],
    ["a fraction", "2.5", "Enter a page number between 1 and 200."],
    ["an empty value", "", "Enter a page number between 1 and 200."],
  ])("rejects %s with an accessible error", (_label, value, message) => {
    const onPageChange = vi.fn();
    render(
      <Pagination
        pagination={largePagination}
        onPageChange={onPageChange}
        showJumpToPage
      />,
    );

    const input = screen.getByLabelText("Jump to page");
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(message);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("clears the error as soon as the user edits the field", () => {
    render(
      <Pagination
        pagination={largePagination}
        onPageChange={vi.fn()}
        showJumpToPage
      />,
    );

    const input = screen.getByLabelText("Jump to page");
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "150" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});
