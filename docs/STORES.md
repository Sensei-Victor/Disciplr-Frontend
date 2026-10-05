# Zustand Store Contracts

Disciplr utilizes Zustand to manage global client-side state across three main stores:
1. `useVerifierStore`: Manages validation tasks (pending queue and verification history) for verifiers.
2. `useNotification`: Manages user notifications, unread status, and batch read operations.
3. `useToastStore`: Manages the transient toast/snackbar queue (push, dismiss, auto-expiry).

This document describes the state structures, the transition mechanics, and recommendations for React components consuming these stores.

---

## 1. Verifier Store (`useVerifierStore`)

The verifier store is defined in [Store.ts](../src/Zustand/Store.ts) and manages verification workflows.

### State Shapes

#### `ValidationTask`
Each validation task conforms to the following type structure:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for the validation task. |
| `vaultName` | `string` | Name of the vault associated with the validation. |
| `owner` | `string` | Address or identity of the vault owner. |
| `amount` | `string` | Formatted amount locked or requested (e.g., `'50,000 USDC'`). |
| `deadline` | `string` | ISO Date string representing the task deadline. |
| `daysRemaining` | `number` | Computed days remaining until the deadline. |
| `status` | `'pending' \| 'approved' \| 'rejected'` | Current verification status. |
| `milestone` | `string` | Name or description of the milestone. |
| `evidenceUrl` | `string` (optional) | URL pointing to validation evidence (e.g. GitHub release, Figma mockup). |
| `notes` | `string` (optional) | Explanatory notes provided by the verifier during decision. |
| `criteria` | `string[]` (optional) | An array of specific requirements that must be verified. |

#### Store State Fields
- `pendingValidations: ValidationTask[]`
  An array containing all active validation tasks. The status field of all tasks in this list is `'pending'`.
- `validationHistory: ValidationTask[]`
  An array containing historically resolved validation tasks. The status of tasks in this list is either `'approved'` or `'rejected'`.

### State Transitions (Pending ➔ History)

When a verifier resolves a validation task, the task transitions from `pendingValidations` to `validationHistory`:
1. The task is located in the `pendingValidations` queue by its `id`.
2. Its status is updated to `'approved'` or `'rejected'`, and the verifier's optional `notes` are attached.
3. The task is removed from the `pendingValidations` array.
4. The updated task is prepended to the beginning (index `0`) of the `validationHistory` array, ensuring the most recent decisions appear first.

### Mutators and Effects

#### `approveValidation(id: string, notes?: string): void`
- **Effect**: Transition the task with the given `id` from `pending` to `history` with `status: 'approved'`.
- **Edge Case**: If the ID is not found in `pendingValidations`, the operation is a no-op (no state change).

#### `rejectValidation(id: string, notes?: string): void`
- **Effect**: Transition the task with the given `id` from `pending` to `history` with `status: 'rejected'`.
- **Edge Case**: If the ID is not found in `pendingValidations`, the operation is a no-op (no state change).

#### `batchApprove(ids: string[], notes?: string): void`
- **Effect**: Resolves multiple validation tasks as `'approved'` with the specified notes.
- **Implementation & Semantics**: Batch actions iterate over the provided `ids` list and call `approveValidation` sequentially. Thus, the transition and state consistency remain identical to individual approvals.
- **Edge Cases**:
  - Any unknown or already-resolved IDs in the `ids` array are ignored (no-op).
  - An empty `ids` list is a safe no-op.

#### `batchReject(ids: string[], notes?: string): void`
- **Effect**: Resolves multiple validation tasks as `'rejected'` with the specified notes.
- **Implementation & Semantics**: Sequentially invokes `rejectValidation` for each ID in the array.
- **Edge Cases**:
  - Any unknown or already-resolved IDs in the `ids` array are ignored (no-op).
  - An empty `ids` list is a safe no-op.

---

## 2. Notification Store (`useNotification`)

The notification store manages client-side notifications and unread badges.

### State Shapes

#### `NotificationItem`
Derived from example notifications, each item has the following structure:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique identifier for the notification. |
| `type` | `string` | The notification category (e.g. `'vault_deadline_approaching'`, `'funds_released'`, `'verification_requested'`). |
| `isUrgent` | `boolean` | Flag indicating whether this requires immediate attention. |
| `title` | `string` | Header text/subject of the notification. |
| `message` | `string` | Detailed message description. |
| `timestamp` | `string` | ISO 8601 formatted timestamp of the event. |
| `timeAgo` | `string` | Short relative time label (e.g., `'2m ago'`, `'Yesterday'`). |
| `isRead` | `boolean` | Tracking status indicating whether the notification was read. |
| `category` | `string` | Broad categorization tag (e.g. `'vault'`, `'funds'`, `'verification'`, `'system'`). |

#### Store State Fields
- `notification: NotificationItem[]`
  The list of all notifications currently loaded into memory.

> **Derived value — not stored state:** The unread count is not persisted as a
> separate field. Use the `useUnreadCount` selector instead:
> ```ts
> import { useUnreadCount } from '@/Zustand/Store';
> const unreadCount = useUnreadCount(); // notification.filter(n => !n.isRead).length
> ```
> This eliminates the risk of the count drifting out of sync with the
> notification array after any mutator.

### Mutators and Effects

#### `setNotification(value: NotificationItem[]): void`
- **Effect**: Replaces the notification list entirely. The unread count is
  automatically up-to-date via `useUnreadCount` — no manual recompute needed.

#### `markRead(id: string): void`
- **Effect**: Locates the notification by its `id`. If found and `isRead` is `false`, it sets `isRead` to `true`.
- **Idempotence**: Calling `markRead` multiple times for the same `id` has no additional effect.
- **Edge Cases**: If the ID is not found, it is a safe no-op.

#### `markAllRead(): void`
- **Effect**: Iterates through all notifications, updating any item with `isRead: false` to `isRead: true`.
- **Idempotence**: Can be called repeatedly; if all notifications are already read, state remains unchanged.

---

## 3. Toast Store (`useToastStore`)

The toast store is defined in [toastStore.ts](../src/Zustand/toastStore.ts) and powers
transient feedback (wallet connect, copy-to-clipboard, validation messages). The visual
surface is `ToastViewport`, mounted once in `Layout`. See
[toast.md](../design-system/documentation/toast.md) for full API and token mapping.

### State Shapes

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Generated id returned by `push`. |
| `message` | `string` | User-facing copy. |
| `variant` | `'info' \| 'success' \| 'error'` | Maps to semantic color tokens. |
| `createdAt` | `number` | `Date.now()` at push time. |

### Mutators

- `push({ message, variant?, durationMs? }): string` — enqueue, schedule auto-dismiss, FIFO-evict when over `TOAST_MAX_VISIBLE`.
- `dismiss(id): void` — remove one toast and cancel its timer.
- `clear(): void` — remove all toasts and cancel all timers.

---

## 4. Best Practices & React Component Consumption

To avoid unnecessary component re-renders when using Zustand, always select specific state slices rather than consuming the entire store object.

### Recommended: Slice Selection
Use selector functions to extract only the state and actions required by the component. This ensures the component only re-renders when the selected slice changes.

```tsx
import React from 'react';
import { useVerifierStore } from '@/Zustand/Store';

export const PendingQueueCount: React.FC = () => {
  // Good: Re-renders only when pendingValidations.length changes
  const pendingCount = useVerifierStore((state) => state.pendingValidations.length);

  return (
    <div className="badge">
      Pending Tasks: {pendingCount}
    </div>
  );
};

export const ApproveButton: React.FC<{ taskId: string }> = ({ taskId }) => {
  // Good: Component never re-renders when store state changes because actions are stable references
  const approveValidation = useVerifierStore((state) => state.approveValidation);

  return (
    <button onClick={() => approveValidation(taskId, "Looks good!")}>
      Approve Task
    </button>
  );
};
```

### Avoid: Full Store Destructuring
Avoid destructuring the hook call without selectors, as it causes the component to re-render on any change within the store, even if the fields you destructured didn't change:

```tsx
// ⚠️ Avoid this pattern:
const { pendingValidations, approveValidation } = useVerifierStore();
// This component will re-render whenever *any* field changes (e.g. validationHistory, unreadCount, etc.)
```
