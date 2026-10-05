import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Text } from './Text';
import { VaultProgressBar } from './VaultProgressBar';
import { CountdownDeadline } from './CountdownDeadline';
import { Badge } from './Badge';
import { StatusChip } from './StatusChip';
import { deadlineUrgency, type UrgencyTier } from '../utils/vaultUrgency';
import type { BadgeTone } from './Badge';
import type { VaultStatus } from '../types/vault';

export type { VaultStatus };

export interface VaultCardProps {
  id: string;
  name: string;
  amount: number;
  currency: string;
  status: VaultStatus;
  deadline: string;
  progressPct: number;
  linkTo?: string;
}

const URGENCY_BADGE_CONFIG: Record<
  Exclude<UrgencyTier, 'safe'>,
  { label: string; tone: BadgeTone; ariaLabel: string }
> = {
  critical: {
    label: 'Expires soon!',
    tone: 'danger',
    ariaLabel: 'Critical: expires within 24 hours',
  },
  soon: {
    label: 'Due soon',
    tone: 'warning',
    ariaLabel: 'Deadline approaching: due within 7 days',
  },
  expired: {
    label: 'Overdue',
    tone: 'danger',
    ariaLabel: 'Overdue: deadline has passed',
  },
} as const;

function UrgencyBadge({ tier }: { tier: UrgencyTier }) {
  if (tier === 'safe') return null;
  const config = URGENCY_BADGE_CONFIG[tier];
  return (
    <Badge tone={config.tone} size="sm" aria-label={config.ariaLabel}>
      {config.label}
    </Badge>
  );
}

const VaultCard = memo(function VaultCard({
  id,
  name,
  amount,
  currency,
  status,
  deadline,
  progressPct,
  linkTo,
}: VaultCardProps) {
  const link = linkTo ?? `/vaults/${id}`;
  const isTerminal = status === 'completed' || status === 'failed';
  const urgency = isTerminal ? 'safe' : deadlineUrgency(deadline);
  const borderColor = urgency === 'critical' || urgency === 'expired'
    ? 'var(--danger)'
    : urgency === 'soon'
      ? 'var(--warning)'
      : 'var(--border)';

  return (
    <Link to={link} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          background: 'var(--bg)',
          border: `1px solid ${borderColor}`,
          borderRadius: 'var(--radius)',
          padding: '0.875rem 1rem',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: '0.75rem',
          marginBottom: 4,
          boxShadow: 'var(--shadow-level-2)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Text role="body" as="div" style={{ fontWeight: 600, marginBottom: 2 }}>
            {name}
          </Text>
          <Text role="caption" as="div" style={{ color: 'var(--accent)', fontWeight: 700 }}>
            {amount.toLocaleString()} {currency}
          </Text>
          <Text role="caption" as="div" style={{ color: 'var(--muted)' }}>
            Deadline:{' '}
            <CountdownDeadline deadline={deadline} />
          </Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UrgencyBadge tier={urgency} />
          <StatusChip status={status} size="sm" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <VaultProgressBar value={progressPct} label={`${name} progress`} />
        </div>
      </div>
    </Link>
  );
});

export default VaultCard;

