# disciplr-frontend

Frontend for Disciplr, a Stellar-oriented vault application for programmable,
time-locked capital, verifier workflows, wallet connection, analytics, and
notification surfaces.

> Architecture overview: see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for
> routing, provider/context nesting, stores, the utility layer, and the data
> seam.

## What It Does

- Create and inspect USDC vaults with deadlines, success destinations, failure
  destinations, milestones, and transaction history.
- Connect a Stellar wallet through Freighter using `@stellar/freighter-api`.
- Support verifier review flows for pending validations, decision details, and
  validation history.
- Provide dashboard and analytics pages for vault status, activity, and export
  workflows.
- Maintain a separate `design-system/` package for tokens, validators, and
  design documentation.

## Tech Stack

- React 18 and TypeScript
- Vite with `@vitejs/plugin-react`
- React Router for client-side routes
- Vitest and Testing Library for frontend tests
- Freighter wallet integration through `@stellar/freighter-api`
- Zustand for notification and verifier state (see [docs/STORES.md](docs/STORES.md))
- Recharts and jsPDF for analytics/charting and export-related UI
- Lucide React and React Icons for icons
- A local `design-system/` package with Jest-tested token utilities
- `src/utils/windowRange.ts` for list virtualization (see [docs/WINDOW_RANGE.md](docs/WINDOW_RANGE.md))

## Route And Page Map

Routes mounted in `src/App.tsx`:

| Path | Page | Purpose |
| --- | --- | --- |
| `/` | `Home` | Landing overview and vault entry points |
| `/dashboard` | `Dashboard` | Vault and activity dashboard |
| `/vaults` | `Vaults` | Vault listing and state handling |
| `/vaults/create` | `CreateVault` | Vault creation form — see [`docs/CREATE_VAULT_VALIDATION.md`](docs/CREATE_VAULT_VALIDATION.md) for the full validation contract |
| `/vaults/:id` | `VaultDetail` | Milestones, addresses, status, and transactions for one vault |
| `/vaults/:id/transactions` | `VaultTransactions` | Transaction filters, summaries, and export actions |
| `/verifier` | `VerifierDashboard` | Verifier overview |
| `/verifier/queue` | `PendingValidations` | Pending validation queue |
| `/verifier/queue/:vaultId` | `ValidationDetail` | Validation decision details |
| `/verifier/history` | `ValidationHistory` | Historical validation records |
| `/notifications` | `Notification` | Notification list, filters, and preferences link |
| `/notifications/settings` | `NotificationSettings` | Email, push, frequency, and quiet-hours preferences |
| `*` | `NotFound` | Catch-all fallback |

Implemented pages that are present in `src/pages/` but are not currently mounted
by `src/App.tsx`:

- `Analytics.tsx` and `analyticsTheme.ts`; the global layout links to
  `/analytics`, but `App.tsx` does not currently register that route.

## Wallet Integration

Wallet state lives in `src/context/WalletContext.tsx` and is consumed by the
wallet UI in `src/components/Wallet/`.

- `WalletConnectButton.tsx` opens the wallet modal when disconnected and shows a
  truncated address plus network badge when connected.
- `WalletSelectionModal.tsx` calls Freighter through `setAllowed`,
  `requestAccess`, `getAddress`, and `getNetworkDetails`.
- `WalletDropdown.tsx` shows the connected address, mock USDC balance, explorer
  link, switch action, copy action, and disconnect action.
- Supported wallet network labels come from `WalletNetwork`: `TESTNET` and
  `PUBLIC`.

**For detailed documentation on the wallet connection flow, balance state machine, USDC issuer selection, and error codes, see [docs/WALLET_INTEGRATION.md](docs/WALLET_INTEGRATION.md).**

For Horizon endpoint URLs, USDC issuer addresses per network, explorer base
URLs, the Testnet fallback behaviour, and a step-by-step checklist for adding
or changing a network, see [`docs/NETWORK_CONFIG.md`](docs/NETWORK_CONFIG.md).
## Design System

The `design-system/` package contains Disciplr's token source and validation
utilities.

- `design-system/tokens/` stores colors, spacing, typography, borders, shadows,
  motion, and breakpoint-related token data.
- `design-system/src/utils/token-loader.ts` loads token data.
- `design-system/src/utils/validators.ts` validates color, accessibility, chart,
  and token naming rules.
- `design-system/documentation/` contains focused guidance for breakpoints,
  chart palettes, fields, confirmation modals, analytics charts, and
  notification settings.
- `design-system/README.md` is the entry point for package-specific design
  system documentation.
- `.kiro/specs/design-system-brand-foundation/` contains the brand foundation
  requirements, design notes, and task plan.

## Local Setup

### Prerequisites

- Node.js 18+
- npm

### Install And Run

```bash
npm install
npm run dev
```

The Vite dev server runs on `http://localhost:5173`. Requests to `/api` are
proxied to `http://localhost:3000` through `vite.config.ts`.

## Scripts

Root package scripts:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Run TypeScript build mode and create a Vite production build |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint across the frontend |
| `npm run test` | Run the Vitest suite with coverage (CI) |
| `npm run test:watch` | Run Vitest in watch mode for interactive development |

Design-system package scripts:

| Command | Description |
| --- | --- |
| `cd design-system && npm run build` | Compile the design-system TypeScript package |
| `cd design-system && npm test` | Run the Jest token and validator tests |
| `cd design-system && npm run test:watch` | Run Jest in watch mode |
| `cd design-system && npm run lint` | Run ESLint for design-system sources |
| `cd design-system && npm run format` | Format design-system source files |

## Testing

Frontend tests use Vitest, the DOM test setup in `src/setupTests.ts`, and
Testing Library.

For contributor conventions, reusable mocking recipes, coverage guidance, and
the split between the app Vitest stack and the design-system Jest stack, see
[`docs/TESTING.md`](docs/TESTING.md).

**CI / one-off run (with coverage):**

```bash
npm test
```

**Interactive watch mode (local development):**

```bash
npm run test:watch
```

For targeted frontend checks during development, run Vitest directly:

```bash
npx vitest run src/pages/__tests__/Vaults.test.tsx
```

### Coverage

Coverage thresholds are enforced in CI via `vitest.config.ts`:
`statements: 50`, `branches: 80`, `functions: 65`, `lines: 50`. If new
code drops coverage below these floors, `npm test` exits with a
non-zero code and the CI run fails. To check current coverage locally,
run:

```bash
npm test
```

The HTML report is written to `coverage/` — open `coverage/index.html`
in a browser for a detailed view.

Design-system tests use Jest:

```bash
cd design-system
npm test
```

## Project Layout

```text
disciplr-frontend/
|-- .kiro/specs/design-system-brand-foundation/
|-- design-system/
|   |-- documentation/
|   |-- src/
|   |   |-- __tests__/
|   |   |-- types/
|   |   `-- utils/
|   |-- tokens/
|   |-- package.json
|   `-- README.md
|-- public/
|-- src/
|   |-- components/
|   |   |-- Notification/
|   |   |-- Wallet/
|   |   |-- __tests__/
|   |   |-- ConfirmationModal.tsx
|   |   |-- Field.tsx
|   |   |-- Layout.tsx
|   |   |-- MobileDrawer.tsx
|   |   |-- NavLink.tsx
|   |   |-- Skeleton.tsx
|   |   |-- Text.tsx
|   |   |-- ThemeToggle.tsx
|   |   `-- VaultCard.tsx
|   |-- context/
|   |   |-- ThemeContext.tsx
|   |   `-- WalletContext.tsx
|   |-- fixtures/
|   |   |-- dashboard.ts
|   |   |-- transactions.ts
|   |   |-- validations.ts
|   |   |-- vaults.ts
|   |   `-- index.ts
|   |-- pages/
|   |   |-- __tests__/
|   |   |-- Analytics.tsx
|   |   |-- CreateVault.tsx
|   |   |-- Dashboard.tsx
|   |   |-- Home.tsx
|   |   |-- Notification.tsx
|   |   |-- NotificationSettings.tsx
|   |   |-- PendingValidations.tsx
|   |   |-- ValidationDetail.tsx
|   |   |-- ValidationHistory.tsx
|   |   |-- VaultDetail.tsx
|   |   |-- VaultTransactions.tsx
|   |   |-- Vaults.tsx
|   |   `-- VerifierDashboard.tsx
|   |-- utils/
|   |-- Zustand/
|   |-- App.tsx
|   |-- index.css
|   |-- main.tsx
|   `-- setupTests.ts
|-- package.json
|-- tsconfig.json
|-- vite.config.ts
`-- README.md
```

## Mock Fixtures Seam

All page mock/seed data is centralized under `src/fixtures/` behind a typed
seam, so swapping in real backends touches only the data layer:

- `src/fixtures/vaults.ts` — the master vault dataset (`MASTER_VAULTS`).
- `src/fixtures/transactions.ts` — the all-vaults activity feed
  (`MASTER_ACTIVITY`).
- `src/fixtures/dashboard.ts` — Dashboard seed data (`SUMMARY`, `ACTIVITY`,
  `DEADLINES`, `CHART_DATA`).
- `src/fixtures/validations.ts` — verifier-store seed data (`initialPending`,
  `initialHistory`).
- `src/fixtures/index.ts` — barrel re-export for all of the above.

Fixture types reuse the canonical definitions in `src/types/` and
`src/services/vaultService.ts` rather than redefining them. The vault and
transaction fixtures feed the Promise-based service in
`src/services/vaultService.ts`; see
[docs/VAULT_DATA_LAYER.md](docs/VAULT_DATA_LAYER.md) for that seam and the
backend migration plan.

## Contributor Notes

- Keep route documentation aligned with `src/App.tsx`.
- Keep mock/seed data in `src/fixtures/` and cross-reference
  [docs/VAULT_DATA_LAYER.md](docs/VAULT_DATA_LAYER.md).
- Keep wallet documentation aligned with `src/context/WalletContext.tsx` and
  `src/components/Wallet/`.
- Keep token and validator documentation aligned with the `design-system/`
  package.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dual Vitest + Jest test setup, branch naming, and PR conventions.

- Keep store contracts documentation aligned with [docs/STORES.md](docs/STORES.md) and [src/Zustand/Store.ts](src/Zustand/Store.ts).
