# Frontend Architecture

This document gives a concise, accurate overview of how the Disciplr frontend is
wired together: routing, provider/context nesting, global stores, the utility
layer, and the data seam where mock data will be swapped for a real backend.

It is meant as a map. For deeper detail on specific subsystems, follow the
cross-links to the focused docs.

## Application Entry & Provider Nesting

The app boots from [`src/main.tsx`](../src/main.tsx), which renders
[`src/App.tsx`](../src/App.tsx). `App.tsx` defines the provider tree and the
route table.

Provider/wrapper nesting, outermost to innermost (verified against
[`src/App.tsx`](../src/App.tsx) and [`src/components/Layout.tsx`](../src/components/Layout.tsx)):

```text
ThemeProvider                  (src/context/ThemeContext.tsx)
  WalletProvider               (src/context/WalletContext.tsx)
    AppConfigProvider          (src/context/AppConfigContext.tsx)
      BrowserRouter              (react-router-dom)
        ErrorBoundary            (src/components/ErrorBoundary.tsx)
          Layout                 (src/components/Layout.tsx) — header, nav, TrustlineBanner, <main>
            Routes               (route table below)
              Route element      lazy routes are individually wrapped in <Suspense>
```

`Layout` renders the shared chrome (site header, desktop nav, mobile drawer,
notification bell, wallet connect button, and the `TrustlineBanner`) and renders
the active route inside `<main>` via its `children` prop.

## Route Table

All routes are mounted in [`src/App.tsx`](../src/App.tsx). Most page components
are **eagerly** imported at the top of the file. `Analytics` and `Notification`
are **lazy** (`React.lazy(() => import(...))`) and each is wrapped in its own
`<Suspense>` with a full-height `Skeleton` fallback.

| Path | Page component | Loading | Purpose |
| --- | --- | --- | --- |
| `/` | `Home` | eager | Landing overview and vault entry points |
| `/dashboard` | `Dashboard` | eager | Vault and activity dashboard |
| `/vaults` | `Vaults` | eager | Vault listing |
| `/vaults/create` | `CreateVault` | eager | Vault creation form |
| `/vaults/:id` | `VaultDetail` | eager | Milestones, addresses, status, transactions for one vault |
| `/vaults/:id/transactions` | `VaultTransactions` | eager | Per-vault transaction explorer |
| `/transactions` | `VaultTransactions` | eager | All-vaults transaction explorer (same component) |
| `/verifier` | `VerifierDashboard` | eager | Verifier overview |
| `/verifier/queue` | `PendingValidations` | eager | Pending validation queue |
| `/verifier/queue/:vaultId` | `ValidationDetail` | eager | Validation decision details |
| `/verifier/history` | `ValidationHistory` | eager | Historical validation records |
| `/analytics` | `Analytics` | **lazy** | Analytics charts and export workflows |
| `/notifications` | `Notification` | **lazy** | Notification feed |
| `*` | `NotFound` | eager | Catch-all fallback |

Note that `/vaults/:id/transactions` and `/transactions` both render the same
`VaultTransactions` page component.

### Pages present but not mounted

- [`src/pages/NotificationSettings.tsx`](../src/pages/NotificationSettings.tsx)
  exists but is not registered as a route in `App.tsx`. The `Notification` page
  links to `/notification/settings`, which currently has no matching route.

## Contexts

Two React contexts hold app-wide state that is not appropriate for Zustand
(theme and wallet session).

### ThemeContext — [`src/context/ThemeContext.tsx`](../src/context/ThemeContext.tsx)

- State: `theme` (`'light' | 'dark'`), plus `toggleTheme()` and
  `setTheme(theme)`.
- Initial theme reads `localStorage` (`disciplr-theme` key), falling back to the
  OS `prefers-color-scheme`. Storage failures fall back to an in-memory value.
- Writes the active theme to `document.documentElement[data-theme]` and persists
  it. Auto-follows the system theme only while the user has not made a manual
  choice.
- Consume via the `useTheme()` hook (throws outside the provider).

### WalletContext — [`src/context/WalletContext.tsx`](../src/context/WalletContext.tsx)

- State: `address`, `network` (`'TESTNET' | 'PUBLIC'`), `balance`,
  `balanceStatus` (`idle | loading | success | no_trustline | error`),
  `balanceError`, `isConnecting`, `error`.
- Actions: `connect()`, `disconnect()`, `checkConnection()`.
- Integrates Freighter through `@stellar/freighter-api` (`isAllowed`,
  `setAllowed`, `requestAccess`, `getAddress`, `getNetworkDetails`) and fetches
  the USDC balance via [`src/utils/horizon.ts`](../src/utils/horizon.ts).
  In-flight balance fetches are cancelled with an `AbortController`.
- Consume via the `useWallet()` hook (throws outside the provider).

## Stores (Zustand)

Global client state that is shared across unrelated routes lives in Zustand
stores. See [`docs/STORES.md`](./STORES.md) for the full store contracts.

### [`src/Zustand/Store.ts`](../src/Zustand/Store.ts)

- `useNotification` — the notification feed: `notification[]`, and `setNotification`, `markRead(id)`, `markAllRead()`. Seeded
  from `getNotifications()` example data. The unread count is derived via the
  `useUnreadCount` selector (`notification.filter(n => !n.isRead).length`) rather
  than being stored as a separate field, preventing drift between the count and
  the array.
- `useVerifierStore` — verifier workflow state: `pendingValidations[]` and
  `validationHistory[]` (`ValidationTask` records), with `approveValidation`,
  `rejectValidation`, and the `batchApprove` / `batchReject` mutators. Batch
  mutators are implemented in terms of the single-task mutators. Seeded with mock
  pending/history data.
- Re-exports everything from `notificationPreferences.ts`.

### [`src/Zustand/notificationPreferences.ts`](../src/Zustand/notificationPreferences.ts)

- `useNotificationPreferences` — user notification settings (`email`, `push`,
  `frequency`, `quietHours`) with per-field setters and `reset()`. Uses Zustand's
  `persist` middleware (`localStorage` key `notification-preferences`).

## Utility Layer — [`src/utils/`](../src/utils/)

Pure helpers and small framework-agnostic modules. Notable ones:

- [`horizon.ts`](../src/utils/horizon.ts) — Stellar Horizon access: per-network
  Horizon URLs and USDC issuers, plus `fetchUsdcBalance` (with the
  `HorizonBalanceError` type for account-not-found / request / response errors).
- [`csv.ts`](../src/utils/csv.ts) — CSV export helpers for validation tasks,
  transactions, and analytics rows, including numeric-cell normalization and
  cell escaping.
- [`paginate.ts`](../src/utils/paginate.ts) — validation-history filtering
  (status / query / date range / milestone) and generic pagination
  (`PaginationResult<T>`).
- [`windowRange.ts`](../src/utils/windowRange.ts) — lightweight virtual-list math
  (`windowRange`); windowing only engages past `WINDOW_THRESHOLD` (50) rows,
  rendering at most `WINDOW_SIZE` (40) rows.
- [`vaultValidation.ts`](../src/utils/vaultValidation.ts) — create-vault form
  validation: Stellar address, USDC amount, and future-deadline checks
  (`validateCreateVault`).

Other helpers in this folder cover charting/typography, motion/reduced-motion,
explorer links, address formatting, and logging.

## Data Seam

Page components do not read mock data directly. They depend on a single,
Promise-based service so the mock backend can later be replaced with real
Soroban/Horizon calls without touching the pages.

- [`src/services/vaultService.ts`](../src/services/vaultService.ts) — exposes
  `listVaults()`, `getVault(id)`, `getTransactions(id)`, and
  `listAllActivity()`. Mock datasets live in
  [`src/fixtures/vaults.ts`](../src/fixtures/vaults.ts) (`MASTER_VAULTS`) and
  [`src/fixtures/transactions.ts`](../src/fixtures/transactions.ts)
  (`MASTER_ACTIVITY`) and are imported by the service; each function is marked
  with a `SEAM` comment indicating the Soroban/Horizon call that should replace
  its internals.
- Shared domain types live in [`src/types/vault.ts`](../src/types/vault.ts)
  (`Vault`, `VaultStatus`, `MilestoneStatus`, `TxType`, `TxStatus`, etc.).

See [`docs/VAULT_DATA_LAYER.md`](./VAULT_DATA_LAYER.md) for the full data-layer
contract and migration guide.

## Directory Structure (`src/`)

```text
src/
|-- App.tsx              # Provider tree + route table
|-- main.tsx             # ReactDOM entry point
|-- context/            # React contexts (ThemeContext, WalletContext)
|-- Zustand/            # Global stores (Store.ts, notificationPreferences.ts)
|-- pages/              # Route-level page components
|-- components/         # Reusable UI (Layout, Wallet/, Notification/, etc.)
|-- services/           # vaultService.ts — the data seam
|-- types/              # Shared domain types (vault.ts)
`-- utils/             # Pure helpers (horizon, csv, paginate, windowRange, ...)
```

## Related Documentation

- [`docs/STORES.md`](./STORES.md) — Zustand store contracts.
- [`docs/VAULT_DATA_LAYER.md`](./VAULT_DATA_LAYER.md) — data layer and backend
  migration guide.
- [`docs/TESTING.md`](./TESTING.md) — contributor testing guide (Vitest + Jest).
- [`design-system/documentation/getting-started.md`](../design-system/documentation/getting-started.md)
  — design-system tokens and how the app consumes them.
- [`design-system/README.md`](../design-system/README.md) — design-system
  package entry point.
</content>
</invoke>
