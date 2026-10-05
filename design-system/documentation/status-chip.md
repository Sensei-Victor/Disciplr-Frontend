# StatusChip

The `StatusChip` component is the single source of truth for rendering status badges across the application. It normalizes all validation and vault states to an accessible badge driven purely by design system semantic tokens.

## Usage

```tsx
import { StatusChip } from '../components/StatusChip';

// Default rendering (uses pre-configured label and semantic token)
<StatusChip status="pending_validation" />

// Overriding label text while preserving semantic meaning
<StatusChip status="pending_validation" label="Pending" size="sm" />
```

## Props

- `status` (`ChipStatus`): The current status. Maps directly to a semantic token and default label.
  - Allowed values: `'active'`, `'pending_validation'`, `'completed'`, `'failed'`, `'cancelled'`, `'approved'`, `'rejected'`.
- `label` (`string`, optional): An optional override for the default text label.
- `tooltip` (`string`, optional): Custom tooltip content. When provided, the chip becomes keyboard-focusable to allow users to trigger the tooltip. Without a custom tooltip, the chip uses the default description and is not focusable (reducing unnecessary tab stops on list-heavy pages).
- `size` (`'sm' | 'md' | 'lg'`, optional): Controls the padding and font size of the chip. Defaults to `'md'`.
- `className` (`string`, optional): Additional classes to apply to the chip.

## Status to Token Mapping

The chip uses `color-mix` to automatically generate transparent background colors based on existing root tokens. No new hex values are introduced.

| Status | Default Label | Color Token | Background Generation |
| :--- | :--- | :--- | :--- |
| `active` | Active | `var(--accent)` | `var(--accent-transparent)` |
| `completed` | Completed | `var(--success)` | `color-mix(in srgb, var(--success) 10%, transparent)` |
| `failed` | Failed | `var(--danger)` | `color-mix(in srgb, var(--danger) 10%, transparent)` |
| `cancelled` | Cancelled | `var(--muted)` | `color-mix(in srgb, var(--muted) 10%, transparent)` |
| `pending_validation` | Pending Validation | `var(--warning)` | `color-mix(in srgb, var(--warning) 10%, transparent)` |
| `approved` | Approved | `var(--success)` | `color-mix(in srgb, var(--success) 10%, transparent)` |
| `rejected` | Rejected | `var(--danger)` | `color-mix(in srgb, var(--danger) 10%, transparent)` |

### Unknown Status Fallback

When an unmapped status value outside `ChipStatus` is passed at runtime:
- The chip renders as a neutral gray chip using `var(--muted)` and `color-mix(in srgb, var(--muted) 10%, transparent)`.
- The default label and aria-label display the raw status string (or `'Unknown'` if empty).
- A warning is emitted via `logger.warn` to make mapping issues immediately visible rather than silently falling back to `'Cancelled'`.

## Shared status types (`src/types/vault.ts`)

The status unions consumed by `StatusChip` and the vault pages live in a single
module, `src/types/vault.ts`, so they can no longer drift apart:

- `VaultStatus` — `'active' | 'pending_validation' | 'completed' | 'failed' | 'cancelled'`.
  Every member is a valid `ChipStatus`, so any `VaultStatus` can be passed
  straight to `<StatusChip status={...} />` without a fallback.
- `MilestoneStatus` — `'pending' | 'validated' | 'failed'`.
- `TxType` — `'create' | 'validate' | 'release' | 'redirect'`.
- `TxStatus` — `'confirmed' | 'pending' | 'failed'`.
- `VAULT_STATUS_ORDER` — a `readonly VaultStatus[]` giving the canonical display
  order (most to least active) for consistent sorting. It contains every
  `VaultStatus` member exactly once.

```tsx
import type { VaultStatus } from '../types/vault';
import { VAULT_STATUS_ORDER } from '../types/vault';

// Sort vaults by their canonical status order.
vaults.sort(
  (a, b) =>
    VAULT_STATUS_ORDER.indexOf(a.status) - VAULT_STATUS_ORDER.indexOf(b.status),
);
```

`Dashboard`, `Vaults`, `VaultDetail`, `VaultCard`, and `VaultTransactions` all
import these unions instead of declaring their own. When adding a new
`VaultStatus`, add it here and to `STATUS_CONFIG` in `StatusChip.tsx` so the
chip can render it.

## Accessibility

- The component exposes its status using an accessible `aria-label` covering the underlying meaning, regardless of whether a custom `label` string is passed in or not.
- **Keyboard focus**: By default, status chips are **not focusable** (no tab stop), reducing bloat on list-heavy pages. The chip becomes keyboard-focusable (`tabIndex={0}`) only when a custom `tooltip` prop is provided, indicating the developer wants to expose additional information that justifies a tab stop.
- Screen readers can always access the status via the `aria-label`, regardless of focusability.
- Semantic colors match contrast minimums since the root tokens (`--danger`, `--success`, etc.) have already been vetted, and the background uses a 10% opacity multiplier against white/black.

---

## Badge primitive (`src/components/Badge.tsx`)

`Badge` is the generic pill/chip primitive for **numeric counts and short tier
labels**. Use it when the content is a number, a count, or an ad-hoc tier
string (urgency, queue depth, unread count) rather than a canonical vault or
validation status.

Use `StatusChip` when you need to render a `VaultStatus` or `ChipStatus`.
Use `Badge` for everything else.

### Usage

```tsx
import { Badge } from '../components/Badge';

// Urgency tier label
<Badge tone="danger" size="sm" aria-label="Critical: expires within 24 hours">
  Expires soon!
</Badge>

// Unread notification count
<Badge tone="info" aria-label="5 unread notifications">5</Badge>

// Neutral queue count
<Badge tone="neutral" aria-label="12 items in queue">12</Badge>
```

### Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `tone` | `'neutral' \| 'info' \| 'success' \| 'warning' \| 'danger'` | `'neutral'` | Semantic color tone mapped to design system tokens. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Controls padding and font size. |
| `aria-label` | `string` | — | Human-readable description for assistive technology. Required for numeric badges. |
| `className` | `string` | `''` | Additional CSS classes forwarded to the root element. |
| `children` | `React.ReactNode` | — | Badge content: number, short label, or icon. |

### Tone to token mapping

No hardcoded colors — all tones resolve to CSS custom properties from
`src/index.css`.

| Tone | Color token | Background |
| :--- | :--- | :--- |
| `neutral` | `var(--muted)` | `color-mix(in srgb, var(--muted) 10%, transparent)` |
| `info` | `var(--info)` | `color-mix(in srgb, var(--info) 10%, transparent)` |
| `success` | `var(--success)` | `color-mix(in srgb, var(--success) 10%, transparent)` |
| `warning` | `var(--warning)` | `var(--warning-transparent)` |
| `danger` | `var(--danger)` | `var(--danger-transparent)` |

### Size styles

| Size | Padding | Font size | Min width |
| :--- | :--- | :--- | :--- |
| `sm` | `1px 6px` | `10px` | `18px` |
| `md` | `2px 8px` | `11px` | `20px` |
| `lg` | `3px 10px` | `13px` | `24px` |

### Accessibility

- Pass a descriptive `aria-label` for all numeric badges so screen readers
  can announce context, e.g. `"5 unread notifications"` instead of just `"5"`.
- Zero counts must still be rendered and labelled (e.g. `"0 pending items"`)
  so users know the queue is empty.
- The root element is a `<span>` with `display: inline-flex` and `role`
  inherited from context. Add `role="status"` at the call site if the count
  updates live and should trigger an ARIA live region.

### Adoption in VaultCard

The urgency tier badge in `VaultCard.tsx` was migrated from an inline `<span>`
to `<Badge>`. The `URGENCY_BADGE_CONFIG` map now carries a `tone: BadgeTone`
field instead of hardcoded `bg`/`fg` CSS strings:

```tsx
// Before
<span style={{ background: 'var(--danger-transparent)', color: 'var(--danger)', ... }}>
  Expires soon!
</span>

// After
<Badge tone="danger" size="sm" aria-label="Critical: expires within 24 hours">
  Expires soon!
</Badge>
```
