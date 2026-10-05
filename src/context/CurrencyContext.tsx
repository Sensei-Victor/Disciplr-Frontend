import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

/**
 * The shape returned by /api/account/preferences that this context cares about.
 * The canonical field name is `displayCurrency` (matches preferencesSchema and
 * the PreferencesData interface in PreferencesForm.tsx).
 */
interface PreferencesResponse {
  displayCurrency?: string;
}

interface CurrencyContextType {
  /** ISO 4217 currency code resolved from Account → Preferences, e.g. "EUR". */
  currency: string;
  /** True while the preferences fetch is in-flight. */
  loading: boolean;
  /** Non-null when the fetch failed. */
  error: string | null;
}

const DEFAULT_CURRENCY = 'USD';

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

/**
 * Fetches `displayCurrency` from `/api/account/preferences` and exposes it via
 * context.  Falls back to "USD" when the field is absent or the request fails.
 *
 * The field was previously read as `data.currency`, which is not part of the
 * preferences schema and was always `undefined`, silently keeping every user on
 * the "USD" default regardless of their saved preferences.  The correct field
 * name is `data.displayCurrency`.
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrency = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/account/preferences');
      if (!response.ok) {
        throw new Error(`Preferences request failed with status ${response.status}`);
      }
      const data: PreferencesResponse = await response.json();
      // Use `data.displayCurrency` — the canonical field in preferencesSchema and
      // PreferencesData.  `data.currency` does not exist and was always undefined.
      if (data && data.displayCurrency) {
        setCurrency(data.displayCurrency);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load currency preference';
      setError(message);
      // Keep the previous currency value (default "USD") on error.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCurrency();
  }, [fetchCurrency]);

  return (
    <CurrencyContext.Provider value={{ currency, loading, error }}>
      {children}
    </CurrencyContext.Provider>
  );
}

/**
 * Returns the active currency preference.
 *
 * @throws {Error} when used outside of a `CurrencyProvider`.
 */
export function useCurrencyPreference(): CurrencyContextType {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrencyPreference must be used within a CurrencyProvider');
  }
  return context;
}
