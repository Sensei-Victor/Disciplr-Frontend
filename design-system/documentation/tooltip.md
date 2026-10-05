# Tooltip component

The `Tooltip` component provides accessible, non-blocking contextual information for interactive elements across the Disciplr application.

## Stacking Context & Token Architecture

The tooltip bubble is integrated directly into the application's design system z-index scale defined in `design-system/tokens/z-index.json` and mirrored in `src/index.css`.

| Token | CSS Variable | Value | Role in Stacking Hierarchy |
| :--- | :--- | :--- | :--- |
| `zIndex.base` | `--z-index-base` | `0` | Default document flow and surface content |
| `zIndex.header` | `--z-index-header` | `100` | Sticky navigation bar and header elements |
| `zIndex.tooltip` | `--z-index-tooltip` | `150` | Contextual popups; renders above triggers and headers |
| `zIndex.drawer` | `--z-index-drawer` | `200` | Sliding panels and mobile navigation drawers |
| `zIndex.modal` | `--z-index-modal` | `300` | Blocking dialogs and confirmation modals |
| `zIndex.toast` | `--z-index-toast` | `400` | Ephemeral viewport notifications |

The tooltip bubble styles use:
```tsx
zIndex: "var(--z-index-tooltip)"
```

This guarantees that tooltips:
1. Always stack above their trigger's surrounding content and the sticky site header.
2. Never bleed through or obstruct higher-priority overlay surfaces (sliding drawers, modal dialogs, and toast viewports).
3. Update automatically if the design system token scale is adjusted in `design-system/tokens/z-index.json`.

## Accessibility (a11y) Invariants

The `Tooltip` component enforces the following accessibility standards:
- **ARIA Linkage**: Dynamically generates a unique `id` via React `useId()` and attaches it to the trigger element via `aria-describedby` when the tooltip is active.
- **ARIA Role**: The bubble element uses `role="tooltip"`.
- **Visibility State**: The bubble element is flagged with `aria-hidden={!visible}` when hidden to prevent screen-reader confusion.
- **Keyboard Dismissal**: Pressing the `Escape` key immediately dismisses the visible tooltip.
- **Trigger Activation**: Displays on both pointer hover (`mouseenter`/`mouseleave`) and keyboard focus (`focus`/`blur`).
- **Motion Sensitivity**: Respects OS-level motion preference via `usePrefersReducedMotion()`, disabling CSS transitions when `prefers-reduced-motion: reduce` is detected.

## Component API

Component path: `src/components/Tooltip.tsx`

```tsx
import { Tooltip } from "@/components/Tooltip";

<Tooltip content="Milestone verification deadline" position="top">
  <button type="button">Deadline Info</button>
</Tooltip>
```

### Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `content` | `string` | *(required)* | Text content to display inside the tooltip bubble. |
| `position` | `"top" \| "bottom"` | `"top"` | Tooltip placement relative to the trigger. |
| `children` | `React.ReactElement` | *(required)* | Single interactive trigger element that activates the tooltip. |
| `className` | `string` | `""` | Optional CSS class name passed to the outer wrapper `span`. |
