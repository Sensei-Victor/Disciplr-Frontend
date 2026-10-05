import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { vi } from 'vitest';

function TestComponent() {
  const { theme, preference, toggleTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="preference">{preference}</span>
      <button onClick={toggleTheme}>Toggle</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('system')}>Set System</button>
      <button onClick={() => setTheme('light')}>Set Light</button>
    </div>
  );
}

describe('ThemeContext safe storage', () => {
  beforeEach(() => {
    // Mock matchMedia to simulate a light OS preference
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList));
    vi.spyOn(Storage.prototype, 'getItem');
    vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('falls back to system preference when getItem throws', () => {
    vi.mocked(window.localStorage.getItem).mockImplementation(() => {
      throw new Error('storage blocked');
    });
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    const themeSpan = screen.getByTestId('theme');
    const preferenceSpan = screen.getByTestId('preference');
    expect(themeSpan).toHaveTextContent('light');
    expect(preferenceSpan).toHaveTextContent('system');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  test('toggles theme even when setItem throws', () => {
    vi.mocked(window.localStorage.setItem).mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    // Default is system; cycle: system → light → dark
    fireEvent.click(screen.getByText('Toggle')); // system → light
    fireEvent.click(screen.getByText('Toggle')); // light → dark
    const themeSpan = screen.getByTestId('theme');
    const preferenceSpan = screen.getByTestId('preference');
    expect(themeSpan).toHaveTextContent('dark');
    expect(preferenceSpan).toHaveTextContent('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  test('defaults to system preference when no stored value', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });
});

describe('ThemeContext tri-state preference', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList));
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('cycles preference: light → dark → system → light', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Default is system
    expect(screen.getByTestId('preference')).toHaveTextContent('system');

    // system → light
    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('preference')).toHaveTextContent('light');

    // light → dark
    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');

    // dark → system
    fireEvent.click(screen.getByText('Toggle'));
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
  });

  test('data-theme is always concrete light or dark', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // system mode with light OS
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    // switch to dark
    fireEvent.click(screen.getByText('Toggle')); // system → light
    fireEvent.click(screen.getByText('Toggle')); // light → dark
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    // switch to system with light OS
    fireEvent.click(screen.getByText('Toggle')); // dark → system
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  test('persists preference to localStorage', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText('Set Dark'));
    expect(localStorage.getItem('disciplr-theme')).toBe('dark');

    fireEvent.click(screen.getByText('Set System'));
    expect(localStorage.getItem('disciplr-theme')).toBe('system');

    fireEvent.click(screen.getByText('Set Light'));
    expect(localStorage.getItem('disciplr-theme')).toBe('light');
  });

  test('setTheme accepts system preference', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText('Set Dark'));
    fireEvent.click(screen.getByText('Set System'));
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
  });

  test('restores stored system preference', () => {
    localStorage.setItem('disciplr-theme', 'system');
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    expect(screen.getByTestId('preference')).toHaveTextContent('system');
  });

  test('restores stored dark preference', () => {
    localStorage.setItem('disciplr-theme', 'dark');
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  test('restores stored light preference', () => {
    localStorage.setItem('disciplr-theme', 'light');
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });
});

describe('ThemeContext OS preference following', () => {
  let mediaEventHandlers: Map<string, (e: MediaQueryListEvent) => void>;
  let darkModeMatches: boolean;

  beforeEach(() => {
    mediaEventHandlers = new Map();
    darkModeMatches = false;
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      get matches() { return query === '(prefers-color-scheme: dark)' ? darkModeMatches : false; },
      media: query,
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (event === 'change') {
          mediaEventHandlers.set(query, handler as (e: MediaQueryListEvent) => void);
        }
      }),
      removeEventListener: vi.fn((event: string) => {
        if (event === 'change') {
          mediaEventHandlers.delete(query);
        }
      }),
    } as unknown as MediaQueryList));
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    mediaEventHandlers.clear();
    vi.restoreAllMocks();
  });

  function fireOsDarkChange(matches: boolean) {
    darkModeMatches = matches;
    const handler = mediaEventHandlers.get('(prefers-color-scheme: dark)');
    if (handler) {
      act(() => {
        handler({ matches } as MediaQueryListEvent);
      });
    }
  }

  test('follows OS changes when preference is system', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    // Simulate OS switching to dark
    fireOsDarkChange(true);

    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    // Simulate OS switching back to light
    fireOsDarkChange(false);

    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });

  test('stops following OS changes after switching to manual preference', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Start in system mode
    expect(screen.getByTestId('preference')).toHaveTextContent('system');

    // Switch to dark manually
    fireEvent.click(screen.getByText('Toggle')); // system → light
    fireEvent.click(screen.getByText('Toggle')); // light → dark
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');

    // OS changes should not affect the resolved theme
    fireOsDarkChange(false); // OS switches to light
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  test('resumes following OS changes after switching back to system', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Switch to dark manually
    fireEvent.click(screen.getByText('Toggle')); // system → light
    fireEvent.click(screen.getByText('Toggle')); // light → dark
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');

    // Switch back to system
    fireEvent.click(screen.getByText('Toggle')); // dark → system
    expect(screen.getByTestId('preference')).toHaveTextContent('system');

    // OS change to dark
    fireOsDarkChange(true);
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');

    // OS change back to light
    fireOsDarkChange(false);
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  test('removes listener on unmount', () => {
    const { unmount } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // The listener should be added on mount
    expect(mediaEventHandlers.has('(prefers-color-scheme: dark)')).toBe(true);

    unmount();

    // The listener should be removed on unmount
    expect(mediaEventHandlers.has('(prefers-color-scheme: dark)')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Issue #1266 — safeSetItem must accept only UserPreference values.
// The fix narrows the `value` parameter from `string` to `UserPreference`,
// eliminating the unsafe `as UserPreference` cast in the catch block.
//
// TypeScript enforces this at the call boundary (compile time), so the runtime
// test here confirms the in-memory fallback path only ever holds a valid
// UserPreference, never an arbitrary string.
// ---------------------------------------------------------------------------
describe('ThemeContext safeSetItem type safety (issue #1266)', () => {
  beforeEach(() => {
    // Install the storage spy FIRST so vi.mocked() can find it within each test.
    vi.spyOn(Storage.prototype, 'setItem');
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList));
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('in-memory fallback stores a valid UserPreference when setItem throws for "light"', () => {
    // Now the spy is already in place; override it to throw.
    vi.mocked(Storage.prototype.setItem).mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    // Drive ThemeProvider to call safeSetItem with 'light'.
    fireEvent.click(screen.getByText('Toggle')); // system → light

    // The component should reflect 'light' even though localStorage.setItem threw,
    // confirming the in-memory fallback received a valid UserPreference value.
    expect(screen.getByTestId('preference')).toHaveTextContent('light');
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  test('in-memory fallback stores a valid UserPreference when setItem throws for "dark"', () => {
    vi.mocked(Storage.prototype.setItem).mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Toggle')); // system → light
    fireEvent.click(screen.getByText('Toggle')); // light → dark

    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
  });

  test('in-memory fallback stores a valid UserPreference when setItem throws for "system"', () => {
    vi.mocked(Storage.prototype.setItem).mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    // Force a round-trip back to system to confirm the fallback accepts it.
    fireEvent.click(screen.getByText('Toggle')); // system → light
    fireEvent.click(screen.getByText('Toggle')); // light → dark
    fireEvent.click(screen.getByText('Toggle')); // dark → system

    expect(screen.getByTestId('preference')).toHaveTextContent('system');
  });

  test('all three valid UserPreference values are accepted by setTheme without error', () => {
    // Runtime complement to the compile-time narrowing: confirms the call sites
    // that already pass UserPreference values continue to work after the type fix.
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>,
    );

    expect(() => fireEvent.click(screen.getByText('Set Light'))).not.toThrow();
    expect(() => fireEvent.click(screen.getByText('Set Dark'))).not.toThrow();
    expect(() => fireEvent.click(screen.getByText('Set System'))).not.toThrow();
  });
});
