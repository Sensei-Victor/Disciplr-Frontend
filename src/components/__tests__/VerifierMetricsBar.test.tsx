import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VerifierMetricsBar } from '../VerifierMetricsBar';
import { CRITICAL_DAYS_THRESHOLD, type VerifierMetrics } from '../../utils/verifierMetrics';

const baseMetrics: VerifierMetrics = {
  pendingCount: 5,
  overdueCount: 1,
  criticalCount: 2,
  approvalRate: 0.8,
};

// Find the cell with the given accessible label and return its value text node.
// The Text component renders as a span, so the cell contains three spans in
// order: caption label, value, optional description.
function valueEl(label: string | RegExp): HTMLElement {
  const cell = screen.getByRole('group', { name: label });
  const spans = cell.querySelectorAll('span');
  // First span is the label, second is the value.
  return spans[1] as HTMLElement;
}

function cellValue(label: string | RegExp): string {
  return valueEl(label).textContent ?? '';
}

describe('VerifierMetricsBar', () => {
  // ── labels ───────────────────────────────────────────────────────────────
  it('renders a label for each of the four metrics', () => {
    render(<VerifierMetricsBar metrics={baseMetrics} />);
    expect(screen.getByRole('group', { name: 'Pending' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Overdue' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Critical/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Approval rate' })).toBeInTheDocument();
  });

  // ── values ───────────────────────────────────────────────────────────────
  it('renders the numeric value of each metric', () => {
    render(<VerifierMetricsBar metrics={baseMetrics} />);
    expect(cellValue('Pending')).toBe('5');
    expect(cellValue('Overdue')).toBe('1');
    expect(cellValue(/Critical/)).toBe('2');
    expect(cellValue('Approval rate')).toBe('80%');
  });

  it('rounds the approval rate to a whole percentage', () => {
    render(<VerifierMetricsBar metrics={{ ...baseMetrics, approvalRate: 0.6667 }} />);
    expect(cellValue('Approval rate')).toBe('67%');
  });

  it('rounds 0.5 up to a whole percentage', () => {
    render(<VerifierMetricsBar metrics={{ ...baseMetrics, approvalRate: 0.5 }} />);
    expect(cellValue('Approval rate')).toBe('50%');
  });

  it('renders 0% when approval rate is 0', () => {
    render(<VerifierMetricsBar metrics={{ ...baseMetrics, approvalRate: 0 }} />);
    expect(cellValue('Approval rate')).toBe('0%');
  });

  it('renders 100% when approval rate is 1', () => {
    render(<VerifierMetricsBar metrics={{ ...baseMetrics, approvalRate: 1 }} />);
    expect(cellValue('Approval rate')).toBe('100%');
  });

  // ── accessibility landmark ───────────────────────────────────────────────
  it('exposes a section landmark with an accessible name', () => {
    render(<VerifierMetricsBar metrics={baseMetrics} />);
    expect(
      screen.getByRole('region', { name: /Verifier queue metrics/i }),
    ).toBeInTheDocument();
  });

  // ── design tokens ────────────────────────────────────────────────────────
  it('uses design tokens for the container background and border', () => {
    const { container } = render(<VerifierMetricsBar metrics={baseMetrics} />);
    const section = container.querySelector('section')!;
    const style = section.getAttribute('style') ?? '';
    expect(style).toContain('var(--bg)');
    expect(style).toContain('var(--border)');
  });

  // ── overdue tone ─────────────────────────────────────────────────────────
  it('uses a danger token when overdue count is positive', () => {
    render(
      <VerifierMetricsBar metrics={{ ...baseMetrics, overdueCount: 3 }} />,
    );
    expect(valueEl('Overdue').getAttribute('style')).toContain('var(--danger)');
  });

  it('uses a success token when overdue count is 0', () => {
    render(
      <VerifierMetricsBar metrics={{ ...baseMetrics, overdueCount: 0 }} />,
    );
    expect(valueEl('Overdue').getAttribute('style')).toContain('var(--success)');
  });

  // ── critical tone ────────────────────────────────────────────────────────
  it('uses a warning token when at least one task is critical but none overdue', () => {
    render(
      <VerifierMetricsBar
        metrics={{ ...baseMetrics, overdueCount: 0, criticalCount: 1 }}
      />,
    );
    expect(valueEl(/Critical/)).toHaveStyle({ color: 'var(--warning)' });
  });

  it('uses a success token for critical when the queue is calm', () => {
    render(
      <VerifierMetricsBar
        metrics={{
          pendingCount: 2,
          overdueCount: 0,
          criticalCount: 0,
          approvalRate: 0.9,
        }}
      />,
    );
    expect(valueEl(/Critical/)).toHaveStyle({ color: 'var(--success)' });
  });

  // ── approval-rate tone ───────────────────────────────────────────────────
  it('uses a success tone for approval rate at or above 75%', () => {
    render(
      <VerifierMetricsBar metrics={{ ...baseMetrics, approvalRate: 0.8 }} />,
    );
    expect(valueEl('Approval rate')).toHaveStyle({ color: 'var(--success)' });
  });

  it('uses an info (text) tone for approval rate between 50% and 75%', () => {
    render(
      <VerifierMetricsBar metrics={{ ...baseMetrics, approvalRate: 0.6 }} />,
    );
    expect(valueEl('Approval rate')).toHaveStyle({ color: 'var(--text)' });
  });

  it('uses a warning tone for approval rate below 50%', () => {
    render(
      <VerifierMetricsBar metrics={{ ...baseMetrics, approvalRate: 0.3 }} />,
    );
    expect(valueEl('Approval rate')).toHaveStyle({ color: 'var(--warning)' });
  });

  // ── all-zero snapshot ────────────────────────────────────────────────────
  it('handles an all-zero snapshot (empty queue / empty history)', () => {
    const m: VerifierMetrics = {
      pendingCount: 0,
      overdueCount: 0,
      criticalCount: 0,
      approvalRate: 0,
    };
    render(<VerifierMetricsBar metrics={m} />);
    expect(cellValue('Pending')).toBe('0');
    expect(cellValue('Overdue')).toBe('0');
    expect(cellValue(/Critical/)).toBe('0');
    expect(cellValue('Approval rate')).toBe('0%');
  });

  // ── no-color-alone cue for critical cell ─────────────────────────────────
  it('shows a textual description for the critical cell so colour is not load-bearing', () => {
    render(<VerifierMetricsBar metrics={baseMetrics} />);
    expect(screen.getByText(new RegExp(`≤ ${CRITICAL_DAYS_THRESHOLD} days to deadline`))).toBeInTheDocument();
  });

  // ── threshold tracking ───────────────────────────────────────────────────
  it('updates copy when threshold changes', async () => {
    vi.doMock('../../utils/verifierMetrics', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../utils/verifierMetrics')>();
      return {
        ...actual,
        CRITICAL_DAYS_THRESHOLD: 5,
      };
    });
    // VerifierMetricsBar (and the real verifierMetrics module) were already
    // evaluated and cached by the static imports at the top of this file, so
    // the module cache must be reset for the dynamic re-import below to
    // actually pick up the mocked threshold.
    vi.resetModules();

    const { VerifierMetricsBar: MockedBar } = await import('../VerifierMetricsBar');
    render(<MockedBar metrics={{ ...baseMetrics, criticalCount: 1 }} />);

    expect(screen.getByText(/≤ 5 days to deadline/)).toBeInTheDocument();
    expect(screen.getByText(/Critical \(≤5d\)/)).toBeInTheDocument();

    vi.doUnmock('../../utils/verifierMetrics');
    vi.resetModules();
  });

  it('renders the calm-description when no tasks are critical', () => {
    render(
      <VerifierMetricsBar
        metrics={{ pendingCount: 3, overdueCount: 0, criticalCount: 0, approvalRate: 0.9 }}
      />,
    );
    expect(screen.getByText(/No urgent deadlines/)).toBeInTheDocument();
  });
});
