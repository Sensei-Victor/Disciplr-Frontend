/**
 * Tests for CurrencyContext.tsx
 *
 * Key regression test: CurrencyProvider must read `data.displayCurrency` from
 * /api/account/preferences — NOT the non-existent `data.currency` field that
 * caused useCurrencyPreference() to silently return "USD" forever.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CurrencyProvider, useCurrencyPreference } from '../CurrencyContext';

// ---------------------------------------------------------------------------
// Test helper — renders a component that surfaces currency context values
// ---------------------------------------------------------------------------
function CurrencyDisplay() {
  const { currency, loading, error } = useCurrencyPreference();
  return (
    <div>
      <span data-testid="currency">{currency}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error ?? 'none'}</span>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <CurrencyProvider>
      <CurrencyDisplay />
    </CurrencyProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CurrencyProvider — displayCurrency field', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('picks up a non-USD displayCurrency from the preferences endpoint', async () => {
    // Arrange: preferences endpoint returns displayCurrency = "EUR"
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ displayCurrency: 'EUR' }),
    } as Response);

    // Act
    renderWithProvider();

    // Assert: currency transitions from loading state to "EUR"
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('currency')).toHaveTextContent('EUR');
    expect(screen.getByTestId('error')).toHaveTextContent('none');
  });

  it('stays on the "USD" default when the response uses the old wrong field name "currency"', async () => {
    // Regression guard: if the response accidentally uses "currency" (the old
    // wrong field), displayCurrency is absent and we should keep the "USD" default.
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      // NOTE: intentionally using the wrong legacy field to confirm it is ignored
      json: async () => ({ currency: 'GBP' }),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('currency')).toHaveTextContent('USD');
  });

  it('uses "USD" default when displayCurrency is absent from the response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('currency')).toHaveTextContent('USD');
  });

  it('exposes loading=true before the fetch resolves', () => {
    // Never resolves during this test
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}));

    renderWithProvider();

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    expect(screen.getByTestId('currency')).toHaveTextContent('USD');
  });

  it('keeps "USD" and sets an error message when the fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'));

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('currency')).toHaveTextContent('USD');
    expect(screen.getByTestId('error')).toHaveTextContent('network error');
  });

  it('keeps "USD" and sets an error message when the API returns a non-OK status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
    } as Response);

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('currency')).toHaveTextContent('USD');
    expect(screen.getByTestId('error')).toHaveTextContent('403');
  });

  it('throws when useCurrencyPreference is used outside a CurrencyProvider', () => {
    // Suppress React's own console.error for this expected throw
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<CurrencyDisplay />)).toThrow(
      'useCurrencyPreference must be used within a CurrencyProvider',
    );

    consoleError.mockRestore();
  });
});
