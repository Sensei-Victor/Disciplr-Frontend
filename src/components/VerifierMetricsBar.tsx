import React from 'react';
import { Text } from './Text';
import { type VerifierMetrics } from '../utils/verifierMetrics';

export interface VerifierMetricsBarProps {
  metrics: VerifierMetrics;
}

type Tone = 'success' | 'info' | 'warning' | 'danger';

const TONE_COLOR: Record<Tone, string> = {
  success: 'var(--success)',
  info: 'var(--text)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
};

interface MetricCellProps {
  label: string;
  value: string;
  tone: Tone;
  description?: string;
}

function MetricCell({ label, value, tone, description }: MetricCellProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-col px-4 py-3 flex-1 min-w-0"
    >
      <Text role="caption" as="span" style={{ color: 'var(--muted)' }}>
        {label}
      </Text>
      <Text
        role="title"
        as="span"
        className="font-semibold mt-1"
        style={{ color: TONE_COLOR[tone] }}
      >
        {value}
      </Text>
      {description && (
        <Text
          role="caption"
          as="span"
          className="mt-1"
          style={{ color: 'var(--muted)' }}
        >
          {description}
        </Text>
      )}
    </div>
  );
}

function overdueTone(overdueCount: number): Tone {
  return overdueCount > 0 ? 'danger' : 'success';
}

function criticalTone(criticalCount: number): Tone {
  return criticalCount > 0 ? 'warning' : 'success';
}

function approvalTone(rate: number): Tone {
  if (rate >= 0.75) return 'success';
  if (rate >= 0.5) return 'info';
  return 'warning';
}

/**
 * Compact metrics strip rendered above the verifier queue.
 *
 * Presentational: receives already-computed metrics so it can be tested
 * independently of the Zustand store and reused on the VerifierDashboard.
 */
export const VerifierMetricsBar: React.FC<VerifierMetricsBarProps> = ({ metrics }) => {
  const approvedPct = Math.round(metrics.approvalRate * 100);
  const criticalDescription =
    metrics.criticalCount > 0
      ? `≤ ${3} days to deadline`
      : 'No urgent deadlines';

  return (
    <section
      aria-label="Verifier queue metrics"
      data-testid="verifier-metrics-bar"
      className="border rounded-lg shadow-sm flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <MetricCell
        label="Pending"
        value={String(metrics.pendingCount)}
        tone="info"
      />
      <MetricCell
        label="Overdue"
        value={String(metrics.overdueCount)}
        tone={overdueTone(metrics.overdueCount)}
      />
      <MetricCell
        label={`Critical (≤${3}d)`}
        value={String(metrics.criticalCount)}
        tone={criticalTone(metrics.criticalCount)}
        description={criticalDescription}
      />
      <MetricCell
        label="Approval rate"
        value={`${approvedPct}%`}
        tone={approvalTone(metrics.approvalRate)}
        description={
          metrics.approvalRate === 0 && metrics.pendingCount === 0
            ? 'No history yet'
            : undefined
        }
      />
    </section>
  );
};
