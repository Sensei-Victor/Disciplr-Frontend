# Contributor Testing Guide

Disciplr currently has two separate test stacks. Use the root Vitest stack for
the React app in `src/`, and use the Jest stack inside `design-system/` for
token and validator utilities.

## Test Commands

| Area | Stack | Command | Applies to |
| --- | --- | --- | --- |
| Frontend app | Vitest + React Testing Library + jsdom | `npm test` | `src/**/*.test.{ts,tsx}` |
| Frontend app watch mode | Vitest | `npm run test:watch` | Interactive local app testing |
| Targeted frontend file | Vitest | `npx vitest run src/pages/__tests__/Vaults.test.tsx` | One app test file |
| Design system | Jest + ts-jest | `cd design-system && npm test` | `design-system/src/**/*.test.ts` |
| Design system watch mode | Jest | `cd design-system && npm run test:watch` | Interactive token and validator testing |

The root `npm test` script runs `vitest run --coverage`. Vitest is configured in
`vitest.config.ts` with `jsdom`, global test APIs, `src/setupTests.ts`, and
coverage reporters for text and HTML. The design-system package has its own
`design-system/jest.config.js` with `ts-jest`, a Node test environment, and
coverage thresholds of 80% for branches, functions, lines, and statements when
Jest coverage is enabled.

## Coverage Expectations

For app tests, read the terminal summary from `npm test` first. When you need to
inspect missed branches or lines, open the generated HTML report in
`coverage/index.html`.

For design-system coverage, run `cd design-system && npm test -- --coverage`.
Jest then applies the package thresholds in `design-system/jest.config.js` and
writes its HTML report to `design-system/coverage/lcov-report/index.html`. If a
design-system change drops coverage, add a focused test in
`design-system/src/__tests__/` instead of lowering the threshold.

Treat coverage as a guardrail, not the goal. New tests should prove behavior the
user can observe or the token invariant the utility is responsible for.

## Frontend Vitest And RTL Patterns

Frontend tests should usually render the component through React Testing Library
and assert on accessible text, roles, labels, or state changes. Representative
examples:

- `src/pages/__tests__/Notification.test.tsx` renders a routed page, interacts
  with filter and pagination controls, and resets the Zustand store before each
  test.
- `src/pages/__tests__/PendingValidations.test.tsx` mocks a Zustand selector and
  freezes system time for deadline sorting.
- `src/components/__tests__/CountdownDeadline.test.tsx` uses fake timers and
  verifies accessible deadline output.
- `src/utils/__tests__/horizon.test.ts` injects a fake `fetcher` so Horizon
  behavior is tested without a live network request.
- `src/pages/__tests__/Analytics.test.tsx` stubs browser APIs and heavy chart or
  export dependencies that jsdom cannot faithfully run.

### Mock `window.matchMedia`

jsdom does not implement `window.matchMedia`. Add the stub near the top of a
test file or inside `beforeAll` before importing code that reads media queries.
`src/pages/__tests__/Analytics.test.tsx` uses this pattern:

```ts
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})
```

Use this when testing components or contexts that read reduced-motion or color
scheme media queries.

### Mock `framer-motion`

Animation wrappers should not make page tests depend on animation timing.
`src/pages/__tests__/Notification.test.tsx` replaces `motion.div` with a plain
`div` and renders `AnimatePresence` children directly:

```ts
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))
```

Keep the mock small. It should preserve children and the props the test needs,
not reimplement animation behavior.

### Mock `jsPDF` And `recharts`

Chart layout and PDF export are browser-heavy paths. In jsdom tests, stub them
at the module boundary and keep assertions focused on Disciplr behavior.
`src/pages/__tests__/Analytics.test.tsx` mocks Recharts primitives and `jsPDF`:

```ts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
}))

vi.mock('jspdf', () => ({
  default: class {
    text() {}
    save() {}
    addImage() {}
  },
}))
```

If a new assertion needs to prove the export was called, replace the no-op
methods with `vi.fn()` methods local to that test.

### Use Fake Timers

Use fake timers for deadline, countdown, polling, and delayed lazy-loading
tests. Always return to real timers in `afterEach` so later tests do not inherit
the fake clock.

`src/components/__tests__/CountdownDeadline.test.tsx` shows the component-level
pattern:

```ts
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('updates on an interval and cleans up when unmounted', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-18T12:00:00Z'))

  // render, advance timers with act(...), then assert cleanup
})
```

`src/pages/__tests__/PendingValidations.test.tsx` uses `vi.setSystemTime(...)`
when sorting depends on a stable "today".

### Inject A `fetcher` For Horizon Tests

Do not call Stellar Horizon from tests. `fetchUsdcBalance` accepts a `fetcher`
argument, and `src/utils/__tests__/horizon.test.ts` passes a `vi.fn()` response
factory:

```ts
const fetcher = vi.fn().mockResolvedValue(
  mockResponse(200, {
    balances: [
      {
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: USDC_ISSUERS.TESTNET,
        balance: '25.5000000',
      },
    ],
  }),
)

await expect(fetchUsdcBalance('GTEST ACCOUNT', 'TESTNET', fetcher)).resolves.toEqual({
  balance: '25.5000000',
  hasTrustline: true,
  issuer: USDC_ISSUERS.TESTNET,
  network: 'TESTNET',
})
```

Use this injection pattern for new API helper tests so failures stay local,
fast, and deterministic.

### Reset Zustand Stores

When a test changes a Zustand store, reset it before each test. The notification
tests keep an `initialNotifications` fixture and write the store state directly:

```ts
const initialNotifications = getNotifications()

function resetStore() {
  useNotification.setState({
    notification: initialNotifications,
  })
}

beforeEach(() => {
  resetStore()
})
```

> **Note:** `unreadCount` is not a stored state field — it is a computed selector
> (`useUnreadCount`) derived from `notification.filter(n => !n.isRead).length`.
> Do not include it in `setState` calls.

If you mock a Zustand hook, clear the mock and provide a fresh return value in
`beforeEach`, as shown in `src/pages/__tests__/PendingValidations.test.tsx`.

## Design-System Jest Patterns

The design-system package is tested separately because it runs token loaders and
validators in a Node-oriented package. Representative examples:

- `design-system/src/__tests__/tokens.test.ts` loads real spacing tokens and
  asserts the container ramp.
- `design-system/src/__tests__/token-loader.test.ts` mocks `fs` with Jest and
  verifies success, missing-file, malformed JSON, and warning paths.
- `design-system/src/__tests__/validators.test.ts` uses table-like fixtures to
  cover valid and invalid token shapes.
- `design-system/src/__tests__/chart-tokens.test.ts` validates loaded chart
  tokens, malformed structures, and WCAG contrast behavior.

Use Jest APIs (`jest.mock`, `jest.clearAllMocks`, `jest.spyOn`) in this package,
not Vitest APIs. `fast-check` is installed in the design-system package for
property-style validation when a new invariant benefits from generated cases,
but current tests are primarily explicit fixture tests.

## New Test Conventions

- Prefer a small, focused test next to the behavior being changed.
- Assert on user-visible output or exported utility contracts before internal
  implementation details.
- Use RTL queries by role, label, text, or other accessible affordances when a
  component renders UI.
- Mock browser-only APIs at the test boundary when jsdom does not provide them.
- Keep network, wallet, charting, PDF, and animation dependencies behind mocks
  or injected functions.
- Reset stores, mocks, and fake timers in `beforeEach` or `afterEach`.
- Add design-system tests inside `design-system/src/__tests__/` and run the
  design-system Jest command from inside that package.

## Logging Convention

All new code must use the typed logger instead of calling `console.*` directly.
This gives a single place to control log levels, suppress output in production,
and forward to an observability service in the future.

**Frontend app** (`src/`):

```ts
import { logger } from '../utils/logger';

logger.debug('Loading tokens');          // dev-only
logger.info('Wallet connected', { address }); // dev-only
logger.warn('No trustline found');       // dev-only
logger.error('Connection failed', err);  // always – errors are never suppressed
```

The frontend logger reads `import.meta.env.PROD` (set by Vite) and no-ops
`debug`, `info`, and `warn` when building for production. `error` always
propagates.

**Design system** (`design-system/`):

```ts
import { logger } from './logger';

logger.warn(`Failed to load ${file}:`, error);
```

The design-system logger reads `process.env.NODE_ENV` (Node) and applies the
same suppression rules.

### Mocking the logger in tests

Spy on the underlying `console` method rather than importing the logger:

```ts
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

// …trigger the code path that logs…

expect(warnSpy).toHaveBeenCalledWith('Failed to load colors.json:', expect.any(Error));
vi.restoreAllMocks();
```

To test production-mode suppression, override `import.meta.env.PROD` before
re-importing the module:

```ts
Object.defineProperty(import.meta.env, 'PROD', { value: true, configurable: true });
vi.resetModules();
const { logger } = await import('../logger');
// now logger.warn is a no-op
```

See `src/utils/__tests__/logger.test.ts` for the full pattern.

## Troubleshooting

- `matchMedia is not a function`: add the `window.matchMedia` stub before the
  code under test reads theme or reduced-motion state.
- Animation tests hang or assert intermediate frames: mock `framer-motion` and
  test the rendered state Disciplr owns.
- Chart or PDF tests fail in jsdom: mock `recharts` or `jspdf`; jsdom does not
  provide real layout, canvas, or PDF behavior.
- Timer-based tests leak into later tests: call `vi.useRealTimers()` in
  `afterEach`.
- ESM mock order is surprising: keep `vi.mock(...)` at the top level of the test
  module so Vitest can hoist it before imports are evaluated.
- Design-system tests cannot find globals: run them with
  `cd design-system && npm test`; the root Vitest runner is not used there.
