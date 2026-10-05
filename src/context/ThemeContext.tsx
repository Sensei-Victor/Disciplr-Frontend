import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react';

// In-memory fallback when localStorage fails
let memoryPreference: UserPreference | null = null;

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? null;
  } catch {
    // fallback to in-memory preference when storage is unavailable
    return memoryPreference;
  }
}

function safeSetItem(key: string, value: UserPreference): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // persist in-memory when storage is unavailable; value is already
    // typed as UserPreference so no cast is required here.
    memoryPreference = value;
  }
}


type Theme = 'light' | 'dark';
type UserPreference = Theme | 'system';

interface ThemeContextType {
  /** The resolved concrete theme applied to data-theme ('light' | 'dark') */
  theme: Theme;
  /** The user's stored preference ('light' | 'dark' | 'system') */
  preference: UserPreference;
  /** Cycle through light → dark → system → light */
  toggleTheme: () => void;
  /** Set a specific user preference */
  setTheme: (preference: UserPreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'disciplr-theme';

const NEXT_PREFERENCE: Record<UserPreference, UserPreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    // MatchMedia unavailable (e.g. jsdom without mock) — default to light
    return 'light';
  }
}

function isValidPreference(value: unknown): value is UserPreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function getStoredPreference(): UserPreference | null {
  if (typeof window === 'undefined') return null;
  const stored = safeGetItem(THEME_STORAGE_KEY);
  if (isValidPreference(stored)) return stored;
  return null;
}

function resolveTheme(preference: UserPreference): Theme {
  if (preference === 'system') return getSystemTheme();
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<UserPreference>(() => {
    const stored = getStoredPreference();
    if (stored) return stored;
    // Default to system when no stored preference exists
    return 'system';
  });

  // Counter bumped on every OS change to force re-computation of resolved theme
  const [osTick, setOsTick] = useState(0);

  const theme = useMemo(() => resolveTheme(preference), [preference, osTick]);

  // Apply data-theme and persist preference whenever it changes
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    safeSetItem(THEME_STORAGE_KEY, preference);
  }, [theme, preference]);

  // Listen for OS preference changes when in system mode
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (preference === 'system') {
        // Bump osTick to force re-computation of resolved theme
        setOsTick((t) => t + 1);
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preference]);

  const toggleTheme = useCallback(() => {
    setPreferenceState((prev) => NEXT_PREFERENCE[prev]);
  }, []);

  // Validate input at the boundary: ignore invalid preferences rather than
  // corrupting state or persisting an unsafe value. This keeps the public
  // interface stable while enforcing the invariant that only light/dark/system
  // can ever reach state or storage.
  const setTheme = useCallback((newPreference: UserPreference) => {
    if (!isValidPreference(newPreference)) {
      if (process.env.NODE_ENV !== 'production') {
        // Diagnosable without exposing the raw value in production logs.
        // eslint-disable-next-line no-console
        console.warn('useTheme.setTheme ignored an invalid theme preference');
      }
      return;
    }
    setPreferenceState(newPreference);
    safeSetItem(THEME_STORAGE_KEY, newPreference);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, preference, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
