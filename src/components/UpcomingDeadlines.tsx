import { CountdownDeadline, timeRemaining } from './CountdownDeadline';
import { Text } from './Text';
import { deadlineUrgency, type UrgencyTier } from '../utils/vaultUrgency';
import type { Deadline } from '../utils/dashboard';
import { downloadIcsEvent, isValidIcsDeadline } from '../utils/ics';

interface UpcomingDeadlinesProps {
  deadlines: Deadline[];
}

function urgencyStyles(deadline: string) {
  const remaining = timeRemaining(deadline);

  if (remaining.tone === 'expired') {
    return {
      color: 'var(--danger)',
      background: 'var(--danger-transparent)',
      borderColor: 'var(--danger)',
      label: 'Expired',
    };
  }

  if (remaining.tone === 'invalid') {
    return {
      color: 'var(--muted)',
      background: 'var(--surface)',
      borderColor: 'var(--border)',
      label: 'Invalid',
    };
  }

  const urgency = deadlineUrgency(deadline);
  const config: Record<UrgencyTier, { color: string; background: string; borderColor: string; label: string }> = {
    critical: {
      color: 'var(--danger)',
      background: 'var(--danger-transparent)',
      borderColor: 'var(--danger)',
      label: 'Critical',
    },
    soon: {
      color: 'var(--warning)',
      background: 'var(--warning-transparent)',
      borderColor: 'var(--warning)',
      label: 'Soon',
    },
    safe: {
      color: 'var(--success)',
      background: 'var(--success-transparent)',
      borderColor: 'var(--success)',
      label: 'Safe',
    },
    expired: {
      color: 'var(--danger)',
      background: 'var(--danger-transparent)',
      borderColor: 'var(--danger)',
      label: 'Expired',
    },
  };

  return config[urgency];
}

function remainingTimeSort(deadline: string) {
  const deadlineMs = new Date(deadline).getTime();
  return Number.isNaN(deadlineMs) ? Number.POSITIVE_INFINITY : deadlineMs - Date.now();
}

export default function UpcomingDeadlines({ deadlines }: UpcomingDeadlinesProps) {
  const sortedDeadlines = [...deadlines].sort(
    (a, b) => remainingTimeSort(a.deadline) - remainingTimeSort(b.deadline)
  );

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <Text role="body" as="h2" style={{ margin: 0, fontWeight: 600 }}>
          Upcoming Deadlines
        </Text>
      </div>

      {sortedDeadlines.length === 0 ? (
        <Text role="caption" as="div" style={{ color: 'var(--muted)' }}>
          No upcoming deadlines.
        </Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sortedDeadlines.map((item) => {
            const styles = urgencyStyles(item.deadline);

            return (
              <div
                key={item.id}
                data-testid={`upcoming-deadline-${item.id}`}
                style={{
                  background: 'var(--bg)',
                  border: `1px solid ${styles.borderColor}`,
                  borderLeft: `3px solid ${styles.borderColor}`,
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 2,
                  }}
                >
                  <Text role="caption" as="div" style={{ fontWeight: 600 }}>
                    {item.name}
                  </Text>
                  <span
                    style={{
                      color: styles.color,
                      background: styles.background,
                      border: `1px solid ${styles.borderColor}`,
                      borderRadius: 'var(--radius-full)',
                      fontSize: 12,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      padding: '2px 8px',
                    }}
                  >
                    {styles.label}
                  </span>
                </div>
                <Text role="caption" as="div" style={{ color: 'var(--muted)', marginBottom: 2 }}>
                  {item.amount.toLocaleString()} USDC
                </Text>
                <CountdownDeadline deadline={item.deadline} />
                <button
                  onClick={() =>
                    downloadIcsEvent({
                      title: item.name,
                      deadline: item.deadline,
                      description: `Vault deadline: ${item.amount.toLocaleString()} USDC`,
                      uid: item.id,
                    })
                  }
                  disabled={!isValidIcsDeadline(item.deadline)}
                  aria-label={`Export ${item.name} deadline to calendar`}
                  style={{
                    marginTop: '0.5rem',
                    padding: '3px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    cursor: isValidIcsDeadline(item.deadline) ? 'pointer' : 'not-allowed',
                    opacity: isValidIcsDeadline(item.deadline) ? 1 : 0.4,
                  }}
                >
                  Add to Calendar
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
