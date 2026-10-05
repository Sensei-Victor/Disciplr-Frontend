import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import NotificationSettings from '../NotificationSettings';
import { useNotificationPreferences } from '../../Zustand/Store';

type SourceAssertion = {
  name: string;
  pattern: RegExp;
};

const sourceAssertions: SourceAssertion[] = [
  {
    name: "uses checked state for email notifications",
    pattern: /checked=\{emailNotification(?:\s*\?\?\s*false)?\}/,
  },
  {
    name: "uses checked state for push notifications",
    pattern: /checked=\{pushNotification(?:\s*\?\?\s*false)?\}/,
  },
  {
    name: "uses tokenized surface and text colors",
    pattern: /background:\s*var\(--surface\)[\s\S]*color:\s*var\(--text\)/,
  },
  {
    name: "adopts Switch component for email toggle",
    pattern: /<Switch[\s\S]*label="Email Notification"/,
  },
  {
    name: "adopts Switch component for push toggle",
    pattern: /<Switch[\s\S]*label="Push Notification"/,
  },
  {
    name: "imports isValidQuietTime from quietHours utility",
    pattern: /import\s*{[^}]*isValidQuietTime[^}]*}\s*from\s*["'].*quietHours["']/,
  },
  {
    name: "validates quiet hours input with isValidQuietTime",
    pattern: /isValidQuietTime\(quietHours\)/,
  },
  {
    name: "renders vault notification toggles",
    pattern: /vaults\.map/,
  },
];

export function assertNotificationSettingsSource(source: string) {
  const missing = sourceAssertions
    .filter(({ pattern }) => !pattern.test(source))
    .map(({ name }) => name);

  if (missing.length > 0) {
    throw new Error(`NotificationSettings assertions failed: ${missing.join(", ")}`);
  }
}

export const notificationSettingsThemeTestCases = sourceAssertions.map(({ name }) => name);

const source = readFileSync(
  resolve(__dirname, '../NotificationSettings.tsx'),
  'utf8',
);

describe('NotificationSettings source assertions', () => {
  notificationSettingsThemeTestCases.forEach((name) => {
    it(name, () => {
      expect(() => assertNotificationSettingsSource(source)).not.toThrow();
    });
  });
});

describe('NotificationSettings component behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    useNotificationPreferences.getState().reset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders default notification preferences from store', () => {
    render(<NotificationSettings />);

    const emailToggle = screen.getByLabelText('Email Notification');
    const pushToggle = screen.getByLabelText('Push Notification');
    const frequencySelect = screen.getByLabelText('Notification Frequency') as HTMLSelectElement;
    const quietHoursInput = screen.getByLabelText('Quiet Hours') as HTMLInputElement;

    // Switch renders a button with role="switch" and aria-checked
    expect(emailToggle).toHaveAttribute('aria-checked', 'true');
    expect(pushToggle).toHaveAttribute('aria-checked', 'false');
    expect(frequencySelect.value).toBe('1');
    expect(quietHoursInput.value).toBe('12:00');
  });

  it('updates the store when email notification toggle is clicked', () => {
    render(<NotificationSettings />);

    const emailToggle = screen.getByLabelText('Email Notification');
    fireEvent.click(emailToggle);

    expect(useNotificationPreferences.getState().email).toBe(false);
    expect(emailToggle).toHaveAttribute('aria-checked', 'false');
  });

  it('updates the store when push notification toggle is clicked', () => {
    render(<NotificationSettings />);

    const pushToggle = screen.getByLabelText('Push Notification');
    fireEvent.click(pushToggle);

    expect(useNotificationPreferences.getState().push).toBe(true);
    expect(pushToggle).toHaveAttribute('aria-checked', 'true');
  });

  it('updates the store when frequency select is changed', () => {
    render(<NotificationSettings />);

    const frequencySelect = screen.getByLabelText('Notification Frequency');
    fireEvent.change(frequencySelect, { target: { value: '2' } });

    expect(useNotificationPreferences.getState().frequency).toBe('2');
    expect(frequencySelect).toHaveValue('2');
  });

  it('updates the store when quiet hours input is changed', () => {
    render(<NotificationSettings />);

    const quietHoursInput = screen.getByLabelText('Quiet Hours');
    fireEvent.change(quietHoursInput, { target: { value: '18:30' } });

    expect(useNotificationPreferences.getState().quietHours).toBe('18:30');
    expect(quietHoursInput).toHaveValue('18:30');
  });

  it('reflects values from the store when store values are updated elsewhere (remount / external state update)', () => {
    useNotificationPreferences.getState().setEmail(false);
    useNotificationPreferences.getState().setPush(true);
    useNotificationPreferences.getState().setFrequency('3');
    useNotificationPreferences.getState().setQuietHours('09:45');

    render(<NotificationSettings />);

    const emailToggle = screen.getByLabelText('Email Notification');
    const pushToggle = screen.getByLabelText('Push Notification');
    const frequencySelect = screen.getByLabelText('Notification Frequency') as HTMLSelectElement;
    const quietHoursInput = screen.getByLabelText('Quiet Hours') as HTMLInputElement;

    // Switch renders role="switch" buttons; state is reflected via aria-checked
    expect(emailToggle).toHaveAttribute('aria-checked', 'false');
    expect(pushToggle).toHaveAttribute('aria-checked', 'true');
    expect(frequencySelect.value).toBe('3');
    expect(quietHoursInput.value).toBe('09:45');
  });

  it('resets all preferences to default values when reset button is clicked', () => {
    render(<NotificationSettings />);

    const emailToggle = screen.getByLabelText('Email Notification');
    const pushToggle = screen.getByLabelText('Push Notification');
    const frequencySelect = screen.getByLabelText('Notification Frequency') as HTMLSelectElement;
    const quietHoursInput = screen.getByLabelText('Quiet Hours') as HTMLInputElement;

    fireEvent.click(emailToggle);
    fireEvent.click(pushToggle);
    fireEvent.change(frequencySelect, { target: { value: '4' } });
    fireEvent.change(quietHoursInput, { target: { value: '23:00' } });

    // Switch state is reflected via aria-checked
    expect(emailToggle).toHaveAttribute('aria-checked', 'false');
    expect(pushToggle).toHaveAttribute('aria-checked', 'true');
    expect(frequencySelect.value).toBe('4');
    expect(quietHoursInput.value).toBe('23:00');

    const resetButton = screen.getByRole('button', { name: /Reset Preferences/i });
    fireEvent.click(resetButton);

    expect(emailToggle).toHaveAttribute('aria-checked', 'true');
    expect(pushToggle).toHaveAttribute('aria-checked', 'false');
    expect(frequencySelect.value).toBe('1');
    expect(quietHoursInput.value).toBe('12:00');

    const storeState = useNotificationPreferences.getState();
    expect(storeState.email).toBe(true);
    expect(storeState.push).toBe(false);
    expect(storeState.frequency).toBe('1');
    expect(storeState.quietHours).toBe('12:00');
  });

  // Regression test for issue #723:
  // frequency default must correspond to a valid <select> option so the
  // dropdown always shows a selected item on first render and after reset.
  it('regression #723: default frequency renders a selected option in the frequency dropdown', () => {
    render(<NotificationSettings />);

    const frequencySelect = screen.getByLabelText('Notification Frequency') as HTMLSelectElement;

    // The select must not be in an empty-value / unmatched state.
    expect(frequencySelect.value).not.toBe('');

    // The selected option must be one that actually exists in the DOM.
    const selectedOption = Array.from(frequencySelect.options).find(
      (opt) => opt.selected,
    );
    expect(selectedOption).toBeDefined();
    expect(selectedOption?.value).toBe(frequencySelect.value);
  });

  it('regression #723: frequency remains a selected option after store reset', () => {
    render(<NotificationSettings />);

    const frequencySelect = screen.getByLabelText('Notification Frequency') as HTMLSelectElement;
    fireEvent.change(frequencySelect, { target: { value: '4' } });

    const resetButton = screen.getByRole('button', { name: /Reset Preferences/i });
    fireEvent.click(resetButton);

    expect(frequencySelect.value).not.toBe('');

    const selectedOption = Array.from(frequencySelect.options).find(
      (opt) => opt.selected,
    );
    expect(selectedOption).toBeDefined();
    expect(selectedOption?.value).toBe(frequencySelect.value);
  });

  it('renders vault notification toggles and toggles individual vault on click', () => {
    render(<NotificationSettings />);

    const firstVaultToggle = screen.getByLabelText('First Vault notifications');
    const secondVaultToggle = screen.getByLabelText('Second Vault notifications');

    // All vault toggles default to off
    expect(firstVaultToggle).toHaveAttribute('aria-checked', 'false');
    expect(secondVaultToggle).toHaveAttribute('aria-checked', 'false');

    // Toggle first vault on
    fireEvent.click(firstVaultToggle);
    expect(firstVaultToggle).toHaveAttribute('aria-checked', 'true');
    expect(secondVaultToggle).toHaveAttribute('aria-checked', 'false');

    // Toggle second vault on
    fireEvent.click(secondVaultToggle);
    expect(firstVaultToggle).toHaveAttribute('aria-checked', 'true');
    expect(secondVaultToggle).toHaveAttribute('aria-checked', 'true');

    // Toggle first vault back off
    fireEvent.click(firstVaultToggle);
    expect(firstVaultToggle).toHaveAttribute('aria-checked', 'false');
    expect(secondVaultToggle).toHaveAttribute('aria-checked', 'true');
  });

  it('quiet hours input has aria-invalid when value is invalid', () => {
    useNotificationPreferences.getState().setQuietHours('invalid');

    const { unmount } = render(<NotificationSettings />);
    const quietHoursInput = screen.getByLabelText('Quiet Hours') as HTMLInputElement;
    expect(quietHoursInput).toHaveAttribute('aria-invalid', 'true');
    unmount();

    // Default "12:00" is valid
    useNotificationPreferences.getState().reset();
    render(<NotificationSettings />);
    const validInput = screen.getByLabelText('Quiet Hours') as HTMLInputElement;
    expect(validInput).toHaveAttribute('aria-invalid', 'false');
  });
});