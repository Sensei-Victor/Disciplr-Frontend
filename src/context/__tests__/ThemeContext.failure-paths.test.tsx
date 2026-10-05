import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { vi } from 'vitest';

/**
 * Failure-path and boundary coverage that the existing
 * `ThemeContext.test.tsx` does not reach.
 *
 * That suite covers the happy tri-state cycle, OS following, listener
 * teardown, and the two obvious storage throws. The gaps closed here are:
 *
 *  - the `useTheme` guard that throws outside a provider (the one error
 *    path with no coverage at all);
 *  - corrupt or wrong-cased values already sitting in `localStorage`,
 *    which `getStoredPreference` is explicitly written to reject via
 *    `isValidPreference` but which nothing asserted;
 *  - self-healing: a corrupt stored value must be overwritten by the
 *    next real write rather than surviving indefinitely;
 *  - the module-level `memoryPreference` fallback when storage is
 *    unavailable for reads *and* writes;
 *  - the invariant that `data-theme` is always concrete `light`/`dark`
 *    even when the stored preference is invalid.
 *
 * Kept in a separate file so the existing suite is untouched.
 */

function Probe() {
  const { theme, preference, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="preference">{preference}</span>
      <button onClick={toggleTheme}>Toggle</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
    </div>
  );
}

/** matchMedia stub whose result is mutable, so `system` can be driven. */
function stubMatchMedia(darkMatches: { value: boolean }) {
  return vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    get matches() {
      return query === '(prefers-color-scheme: dark)' ? darkMatches.value : false;
    },
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ThemeContext useTheme guard', () => {
  test('throws a named error when used outside a ThemeProvider', () => {
    stubMatchMedia({ value: false });
    // React logs the thrown render error; silence it for this expectation.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Probe />)).toThrow(/useTheme must be used within a ThemeProvider/);

    spy.mockRestore();
  });
});

describe('ThemeContext corrupt stored preference', () => {
  test.each([
    ['unknown word', 'purple'],
    ['empty string', ''],
    ['wrong case', 'DARK'],
    ['padded with whitespace', ' dark '],
    ['non-string JSON', '"dark"'],
    ['html', '<script>'],
  ])('rejects a stored preference that is %s', (_label, stored) => {
    stubMatchMedia({ value: false });
    localStorage.setItem('disciplr-theme', stored);

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    // An unusable value must never become the active preference, and the
    // resolved theme must still be a concrete light/dark.
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(['light', 'dark']).toContain(screen.getByTestId('theme').textContent);
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/^(light|dark)$/);
  });

  test('a corrupt stored value is overwritten by the next real write (self-healing)', () => {
    stubMatchMedia({ value: false });
    localStorage.setItem('disciplr-theme', 'not-a-theme');

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(localStorage.getItem('disciplr-theme')).toBe('system');

    fireEvent.click(screen.getByText('Set Dark'));
    expect(localStorage.getItem('disciplr-theme')).toBe('dark');
  });

  test('keeps data-theme consistent with preference after recovery from corruption', () => {
    stubMatchMedia({ value: false });
    localStorage.setItem('disciplr-theme', 'System');

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    fireEvent.click(screen.getByText('Set Dark'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });
});

describe('ThemeContext storage unavailable for reads and writes', () => {
  test('survives a session where localStorage always throws (memory fallback)', () => {
    stubMatchMedia({ value: false });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    // Must not throw, and must still resolve to a concrete theme.
    expect(['light', 'dark']).toContain(screen.getByTestId('theme').textContent);
    expect(document.documentElement.getAttribute('data-theme')).toMatch(/^(light|dark)$/);

    // And the control must remain usable despite the double failure.
    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
  });

  // Documented finding, not an endorsement: `memoryPreference` is declared at
  // module scope in ThemeContext.tsx, so the in-memory fallback is shared by
  // every ThemeProvider in the process. A provider mounted later inherits the
  // last fallback written by an earlier one. In this app that means a
  // log-out / log-in inside one session can hand the next user the previous
  // user's preference. Scoping the fallback per provider instance is a
  // behaviour change, so it is left for maintainers to decide rather than
  // folded into a test-only PR; this test pins the current behaviour so the
  // change is visible when it happens.
  test('memory fallback is shared across provider instances (documented leak)', () => {
    stubMatchMedia({ value: false });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    const first = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('Set Dark'));
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    first.unmount();

    // A brand-new provider, with a fresh mount, still sees the fallback.
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
  });

  test('remains deterministic across repeated toggles when both storage ops fail', () => {
    stubMatchMedia({ value: false });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    // Start from whatever the provider actually resolved to, rather than
    // assuming 'system': the module-level `memoryPreference` fallback is
    // shared across provider instances, so a previous test in this file can
    // legitimately seed it. (That sharing is itself called out below.)
    const CYCLE = ['light', 'dark', 'system'] as const;
    const start = screen.getByTestId('preference').textContent as (typeof CYCLE)[number];
    const startIndex = CYCLE.indexOf(start);

    // Three full laps of the cycle. Under repeated double-failure the state
    // must not drift, get stuck, or desync from the applied data-theme.
    for (let lap = 0; lap < 3; lap += 1) {
      for (let step = 1; step <= CYCLE.length; step += 1) {
        const want = CYCLE[(startIndex + step) % CYCLE.length];
        fireEvent.click(screen.getByText('Toggle'));
        expect(screen.getByTestId('preference')).toHaveTextContent(want);
        // The applied attribute must always be concrete, never 'system'.
        expect(document.documentElement.getAttribute('data-theme')).toMatch(/^(light|dark)$/);
      }
    }

    // After 3 full laps of a 3-state cycle we are back where we started.
    expect(screen.getByTestId('preference')).toHaveTextContent(start);
  });
});

describe('ThemeContext system-mode boundaries', () => {
  test('system mode tracks the OS theme both ways without a preference change', () => {
    const dark = { value: false };
    const handlers = new Map<string, (e: MediaQueryListEvent) => void>();
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      get matches() {
        return query === '(prefers-color-scheme: dark)' ? dark.value : false;
      },
      media: query,
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (event === 'change') handlers.set(query, handler as (e: MediaQueryListEvent) => void);
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList));

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');

    const fire = (matches: boolean) => {
      dark.value = matches;
      const handler = handlers.get('(prefers-color-scheme: dark)');
      act(() => handler?.({ matches } as MediaQueryListEvent));
    };

    // Rapid consecutive OS changes must each settle, with the preference
    // untouched and data-theme matching the resolved theme every time.
    for (const matches of [true, false, true, true, false]) {
      fire(matches);
      expect(screen.getByTestId('preference')).toHaveTextContent('system');
      expect(screen.getByTestId('theme')).toHaveTextContent(matches ? 'dark' : 'light');
      expect(document.documentElement).toHaveAttribute('data-theme', matches ? 'dark' : 'light');
    }
  });

  test('OS changes are ignored outside system mode', () => {
    const dark = { value: false };
    const handlers = new Map<string, (e: MediaQueryListEvent) => void>();
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      get matches() {
        return query === '(prefers-color-scheme: dark)' ? dark.value : false;
      },
      media: query,
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (event === 'change') handlers.set(query, handler as (e: MediaQueryListEvent) => void);
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList));

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    // Pin to a manual preference, then flip the OS repeatedly.
    fireEvent.click(screen.getByText('Set Dark'));

    for (const matches of [true, false, true]) {
      dark.value = matches;
      const handler = handlers.get('(prefers-color-scheme: dark)');
      act(() => handler?.({ matches } as MediaQueryListEvent));
      expect(screen.getByTestId('theme')).toHaveTextContent('dark');
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    }
  });
});
