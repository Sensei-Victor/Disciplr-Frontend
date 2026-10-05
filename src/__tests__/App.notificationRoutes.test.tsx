import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import App from '../App';
import { useNotification, useNotificationPreferences } from '../Zustand/Store';

// Isolate wallet lifecycle from routing; keep the real layout, bell, route
// table, notification pages, theme and app configuration providers.
vi.mock('../context/WalletContext', () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useWallet: () => ({
    address: null,
    network: null,
    isConnecting: false,
    error: null,
    balanceStatus: 'idle',
  }),
}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  window.history.replaceState({}, '', '/');
  useNotification.setState({ notification: [] });
  useNotificationPreferences.getState().reset();
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  vi.unstubAllGlobals();
});

describe('App notification routes', () => {
  it('navigates from the header bell to notification settings without a wallet', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Both desktop and mobile headers render the same bell link.
    const bells = screen.getAllByRole('link', { name: 'Notifications, 0 unread' });
    expect(bells[0]).toHaveAttribute('href', '/notifications');
    await user.click(bells[0]);
    expect(window.location.pathname).toBe('/notifications');

    const settingsLink = await screen.findByRole('link', { name: 'Notification Preferences' }, { timeout: 5000 });
    expect(settingsLink).toHaveAttribute('href', '/notifications/settings');
    await user.click(settingsLink);

    expect(await screen.findByRole('heading', { name: 'Notification Settings' }, { timeout: 5000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/notifications/settings');
    expect(screen.getByRole('switch', { name: 'Email Notification' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Push Notification' })).toBeInTheDocument();
  }, 15000);

  it('renders notification settings when opening its URL directly', async () => {
    window.history.replaceState({}, '', '/notifications/settings');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Notification Settings' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Preferences' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/notifications/settings');
  });
});
