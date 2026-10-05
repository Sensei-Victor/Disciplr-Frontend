# Pagination

Use `Pagination` when a view shows a bounded list and already has a
`paginate(...)` result from `src/utils/paginate.ts`.

```tsx
const pagination = paginate(items, currentPage, pageSize);

<Pagination
  pagination={pagination}
  onPageChange={setCurrentPage}
  ariaLabel="Notifications pagination"
/>
```

## Large result sets

Page controls are windowed by `getPageControls` (`src/utils/paginationWindow.ts`),
so the rendered DOM never grows with the dataset. Up to
`FULL_PAGE_LIST_LIMIT` (7) pages every page is shown; above that the control list
collapses to at most `MAX_PAGE_CONTROLS` (7) entries, always keeping page 1, the
active page and the last page reachable:

```
near the start  1 2 3 4 5 … 9
in the middle   1 … 49 50 51 … 200
near the end    1 … 197 198 199 200
```

Skipped ranges render as an `…` placeholder that is hidden from assistive
technology (the page count is still announced by the visible status text).

## Jumping to a distant page

Windowing alone still means one click per page when the target is far from the
current window. Pass `showJumpToPage` to render an accessible "Jump to page"
field once `pageCount > FULL_PAGE_LIST_LIMIT`:

```tsx
<Pagination
  pagination={pagination}
  onPageChange={setCurrentPage}
  ariaLabel="Notifications pagination"
  showJumpToPage
/>
```

The field is a controlled number input capped at `pageCount` that submits on
`Enter` or via its `Go` button. Invalid entries (out of range, negative, empty or
non-integer) leave the page unchanged and announce a `role="alert"` message; the
form is `noValidate` so that this accessible message is the one users receive
instead of a browser tooltip. The control is off by default, so existing callers
render exactly the same markup as before.

## Accessibility

- The wrapper is a `nav` landmark with a configurable `aria-label`.
- Previous and next controls expose action-specific labels.
- Numbered page buttons expose `aria-label="Go to page N"`.
- The active page uses `aria-current="page"`.
- Boundary controls are disabled on the first and last pages.
- Ellipsis placeholders are `aria-hidden="true"`.
- The jump field has a linked `label` and wires `aria-invalid` plus
  `aria-describedby` to its error message when validation fails.

`paginate` clamps empty lists and out-of-range page requests to page `1`, so
consumers can safely reuse stale page state after filters or deletions.
