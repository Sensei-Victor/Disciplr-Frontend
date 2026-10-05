// VaultCard component unit tests
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import VaultCard, {
  VaultCardProps,
} from '../../components/VaultCard';
import {
  deadlineUrgency,
  URGENCY_CRITICAL_MS,
  URGENCY_SOON_MS,
} from '../../utils/vaultUrgency';
import type { VaultStatus } from '../../types/vault';

// Freeze time for consistent deadline calculations
const fixedNow = new Date('2024-07-01T00:00:00Z');
vi.useFakeTimers();
vi.setSystemTime(fixedNow);

describe('deadlineUrgency', () => {
  const now = fixedNow;

  it('returns critical when <= 24 h remain', () => {
    const deadline = new Date(now.getTime() + URGENCY_CRITICAL_MS - 1000).toISOString();
    expect(deadlineUrgency(deadline, now)).toBe('critical');
  });

  it('returns soon when > 24 h and <= 7 d remain', () => {
    const justOverCritical = new Date(now.getTime() + URGENCY_CRITICAL_MS + 60_000).toISOString();
    const justUnderSafe = new Date(now.getTime() + URGENCY_SOON_MS - 60_000).toISOString();
    expect(deadlineUrgency(justOverCritical, now)).toBe('soon');
    expect(deadlineUrgency(justUnderSafe, now)).toBe('soon');
  });

  it('returns safe when > 7 d remain', () => {
    const deadline = new Date(now.getTime() + URGENCY_SOON_MS + 60_000).toISOString();
    expect(deadlineUrgency(deadline, now)).toBe('safe');
  });

  it('returns expired for overdue deadlines', () => {
    expect(deadlineUrgency('2024-06-01T00:00:00Z', now)).toBe('expired');
  });

  it('returns safe for invalid deadline strings', () => {
    expect(deadlineUrgency('not-a-date', now)).toBe('safe');
  });
});

describe('VaultCard', () => {
  const baseProps: VaultCardProps = {
    id: '1',
    name: 'Alpha Vault',
    amount: 12500,
    currency: 'USDC',
    status: 'active',
    deadline: '2024-07-15T10:00:00Z',
    progressPct: 0,
  };

  const renderCard = (props = baseProps) =>
    render(
      <MemoryRouter>
        <VaultCard {...props} />
      </MemoryRouter>
    );

  it('renders vault name and amount', () => {
    renderCard();
    expect(screen.getByText('Alpha Vault')).toBeInTheDocument();
    expect(screen.getByText('12,500 USDC')).toBeInTheDocument();
  });

  it('renders live countdown deadline', () => {
    renderCard();
    expect(screen.getByLabelText(/Deadline Jul 15, 2024/)).toHaveTextContent('14d 10h remaining');
  });

  it('displays the shared status chip', () => {
    renderCard();
    const badge = screen.getByText('Active');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('status-chip');
    expect(badge).toHaveStyle({ color: 'var(--accent)' });
  });

  it.each(['active', 'pending_validation', 'completed', 'failed', 'cancelled'] as const)(
    'renders a shared status chip for %s',
    (status) => {
      const labels: Record<VaultStatus, string> = {
        active: 'Active',
        pending_validation: 'Pending Validation',
        completed: 'Completed',
        failed: 'Failed',
        cancelled: 'Cancelled',
      };

      renderCard({ ...baseProps, status });
      const chip = screen.getByLabelText(labels[status]);
      expect(chip).toHaveClass('status-chip');
      expect(chip).toHaveTextContent(labels[status]);
    }
  );

  it('uses the shared cancelled chip styling', () => {
    renderCard({ ...baseProps, status: 'cancelled' });
    const chip = screen.getByLabelText('Cancelled');
    expect(chip).toHaveStyle({
      background: 'color-mix(in srgb, var(--muted) 10%, transparent)',
    });
  });

  it('renders an accessible vault progress bar', () => {
    renderCard({ ...baseProps, progressPct: 42 });

    expect(
      screen.getByRole('progressbar', { name: 'Alpha Vault progress' })
    ).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('shows no urgency badge when deadline is safe (> 7 d)', () => {
    renderCard({ ...baseProps, deadline: '2024-07-15T10:00:00Z' });
    expect(screen.queryByLabelText(/Critical|Deadline approaching|Overdue/)).not.toBeInTheDocument();
  });

  it('shows "Due soon" badge with warning color for soon deadlines (1-7 d)', () => {
    const deadline = new Date(fixedNow.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    renderCard({ ...baseProps, deadline });
    const badge = screen.getByLabelText('Deadline approaching: due within 7 days');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Due soon');
    expect(badge).toHaveStyle({ color: 'var(--warning)' });
  });

  it('shows "Expires soon!" badge with danger color for critical deadlines (<= 24 h)', () => {
    const deadline = new Date(fixedNow.getTime() + 6 * 60 * 60 * 1000).toISOString();
    renderCard({ ...baseProps, deadline });
    const badge = screen.getByLabelText('Critical: expires within 24 hours');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Expires soon!');
    expect(badge).toHaveStyle({ color: 'var(--danger)' });
  });

  it('shows "Overdue" badge with danger color for expired deadlines', () => {
    const deadline = '2024-06-01T00:00:00Z';
    renderCard({ ...baseProps, deadline });
    const badge = screen.getByLabelText('Overdue: deadline has passed');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Overdue');
    expect(badge).toHaveStyle({ color: 'var(--danger)' });
  });

  it.each(['completed', 'failed'] as const)(
    'shows no urgency badge for terminal status "%s"',
    (status) => {
      const deadline = new Date(fixedNow.getTime() + 6 * 60 * 60 * 1000).toISOString();
      renderCard({ ...baseProps, status, deadline });
      expect(screen.queryByLabelText(/Critical|Deadline approaching|Overdue/)).not.toBeInTheDocument();
    }
  );

  it('does not re-render when parent component re-renders with unchanged props (React.memo)', () => {
    const spy = vi.spyOn(VaultCard, 'type');

    function ParentWrapper() {
      const [count, setCount] = React.useState(0);
      return (
        <div>
          <button onClick={() => setCount((c) => c + 1)}>Trigger Parent Re-render ({count})</button>
          <VaultCard {...baseProps} />
        </div>
      );
    }

    render(
      <MemoryRouter>
        <ParentWrapper />
      </MemoryRouter>
    );

    expect(spy).toHaveBeenCalledTimes(1);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Because VaultCard is wrapped in React.memo, the parent state update does NOT trigger a VaultCard re-render
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});



