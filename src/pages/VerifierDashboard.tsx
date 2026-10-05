import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { Text } from '../components/Text';
import { useVerifierStore, type ValidationTask } from '../Zustand/Store';
import VerifierMetrics from '../components/VerifierMetrics';
import { StatusChip } from '../components/StatusChip';
import { daysRemaining } from '../utils/dashboard';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { CRITICAL_DAYS_THRESHOLD } from '../utils/verifierMetrics';
import { mapValidationStatusToChipStatus } from '../utils/verifierStatus';

/**
 * Invariants enforced by this dashboard:
 * - Only tasks with a valid, non-empty `id` are rendered; malformed entries are
 *   filtered out so duplicate React keys or broken navigation targets cannot
 *   silently corrupt the UI.
 * - `pendingValidations` and `validationHistory` are treated as untrusted
 *   inputs: non-array values fall back to an empty list rather than throwing.
 * - A task must never appear in both lists simultaneously. If a task id is
 *   present in history, it is removed from the pending view so a stale store
 *   cannot present an already-decided task as actionable.
 * - Duplicate ids within a list are de-duplicated (first occurrence wins) to
 *   keep rendering deterministic and avoid React key collisions.
 */
function sanitizeTasks(value: unknown): ValidationTask[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ValidationTask[] = [];
  for (const task of value) {
    if (!task || typeof task !== 'object') continue;
    const id = (task as ValidationTask).id;
    if (typeof id !== 'string' || id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(task as ValidationTask);
  }
  return result;
}

export default function VerifierDashboard() {
  const navigate = useNavigate();
  const now = useCurrentTime();
  
  // Defensive coalescing: a partially hydrated or malformed store snapshot
  // (undefined/null slices) must render empty states instead of crashing the
  // dashboard. This mirrors the null-tolerance already enforced by
  // `computeVerifierMetrics` in ../utils/verifierMetrics.ts.
  const pendingValidations =
    useVerifierStore((state) => state.pendingValidations) ?? [];
  const validationHistory =
    useVerifierStore((state) => state.validationHistory) ?? [];

  const safeHistory = useMemo(() => sanitizeTasks(validationHistory), [validationHistory]);
  const safePending = useMemo(() => {
    const historyIds = new Set(safeHistory.map((task) => task.id));
    return sanitizeTasks(pendingValidations).filter((task) => !historyIds.has(task.id));
  }, [pendingValidations, safeHistory]);

  const totalPending = safePending.length;
  const totalCompleted = safeHistory.length;
  const totalAssigned = totalPending + totalCompleted;

  return (
    <div className="flex flex-col gap-6 p-6">
      <VerifierMetrics />
      <header className="mb-4">
        <Text role="display" as="h1">Verifier Dashboard</Text>
        <Text role="body" as="p" className="mt-1" style={{ color: 'var(--muted)' }}>
          Overview of your assigned vaults and validation activity.
        </Text>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 border rounded-lg shadow-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
          <Text role="body" as="p" className="mb-2" style={{ color: 'var(--muted)' }}>Total Assigned</Text>
          <Text role="display" as="h1">{totalAssigned}</Text>
        </div>
        <div className="p-6 border rounded-lg shadow-sm border-l-4" style={{ background: 'var(--bg)', borderColor: 'var(--border)', borderLeftColor: 'var(--accent)' }}>
          <Text role="body" as="p" className="mb-2" style={{ color: 'var(--muted)' }}>Pending Validations</Text>
          <Text role="display" as="h1">{totalPending}</Text>
        </div>
        <div className="p-6 border rounded-lg shadow-sm border-l-4" style={{ background: 'var(--bg)', borderColor: 'var(--border)', borderLeftColor: 'var(--success)' }}>
          <Text role="body" as="p" className="mb-2" style={{ color: 'var(--muted)' }}>Completed</Text>
          <Text role="display" as="h1">{totalCompleted}</Text>
        </div>
      </section>

      <section className="flex gap-4 mt-4">
        <button
          onClick={() => navigate('/verifier/queue')}
          className="px-6 py-3 font-medium rounded transition focus-visible:outline focus-visible:outline-[var(--focus-ring-width)] focus-visible:outline-offset-[var(--focus-ring-offset)] focus-visible:outline-[var(--focus-ring-color)]"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          View Pending Queue
        </button>
        <button
          onClick={() => navigate('/verifier/history')}
          className="px-6 py-3 border font-medium rounded transition focus-visible:outline focus-visible:outline-[var(--focus-ring-width)] focus-visible:outline-offset-[var(--focus-ring-offset)] focus-visible:outline-[var(--focus-ring-color)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'transparent' }}
        >
          View History
        </button>
      </section>

      <section className="mt-8">
        <Text role="display" as="h2" className="mb-4">Urgent Pending Validations</Text>
        <div className="flex flex-col gap-3">
          {safePending.length === 0 ? (
            <div className="p-8 border rounded shadow-sm text-center" style={{ color: 'var(--muted)', background: 'var(--surface)' }}>
              <Text role="body" as="p">You have no pending validations at this time.</Text>
            </div>
          ) : (
            safePending.slice(0, 3).map((task) => {
              const remaining = daysRemaining(task.deadline, now);
              return (
                <div
                  key={task.id}
                  className="p-4 border rounded shadow-sm flex flex-col md:flex-row justify-between md:items-center transition gap-4"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
                >
                  <div>
                    <Text role="body" as="h3">{task.vaultName}</Text>
                    <Text role="body" as="p" className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                      Milestone: {task.milestone}
                    </Text>
                  </div>
                  <div className="text-left md:text-right">
                    <Text
                      role="body"
                      as="p"
                      className="font-bold"
                      style={{ color: remaining <= CRITICAL_DAYS_THRESHOLD ? 'var(--danger)' : 'var(--text)' }}
                    >
                      {remaining <= CRITICAL_DAYS_THRESHOLD && (
                        <span aria-hidden="true">⚠ </span>
                      )}
                      {remaining} days left
                      {remaining <= CRITICAL_DAYS_THRESHOLD && (
                        <span className="sr-only"> (urgent)</span>
                      )}
                    </Text>
                    <button
                      onClick={() => navigate(`/verifier/queue/${task.id}`)}
                      aria-label={`Review ${task.vaultName}`}
                      className="font-medium text-sm mt-2 transition focus-visible:outline focus-visible:outline-[var(--focus-ring-width)] focus-visible:outline-offset-[var(--focus-ring-offset)] focus-visible:outline-[var(--focus-ring-color)]"
                      style={{ color: 'var(--accent)' }}
                    >
                      Review Now &rarr;
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-8" aria-label="Recent Decisions">
        <Text role="display" as="h2" className="mb-4">Recent Decisions</Text>
        <div className="flex flex-col gap-3">
          {safeHistory.length === 0 ? (
            <div className="p-8 border rounded shadow-sm text-center" style={{ color: 'var(--muted)', background: 'var(--surface)' }}>
              <Text role="body" as="p">No recent decisions found.</Text>
            </div>
          ) : (
            safeHistory.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className="p-4 border rounded shadow-sm flex flex-col md:flex-row justify-between md:items-center transition gap-4"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Text role="body" as="h3">{task.vaultName}</Text>
                    <StatusChip status={mapValidationStatusToChipStatus(task.status)} size="sm" />
                  </div>
                  <Text role="body" as="p" className="text-sm" style={{ color: 'var(--muted)' }}>
                    Milestone: {task.milestone}
                  </Text>
                </div>
                <div className="text-left md:text-right flex flex-col md:items-end justify-center">
                  <Text role="body" as="p" className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
                    {task.decidedAt || task.deadline}
                  </Text>
                  <button
                    onClick={() => navigate('/verifier/history')}
                    aria-label={`View ${task.vaultName} in History`}
                    className="font-medium text-sm mt-2 transition text-left md:text-right focus-visible:outline focus-visible:outline-[var(--focus-ring-width)] focus-visible:outline-offset-[var(--focus-ring-offset)] focus-visible:outline-[var(--focus-ring-color)]"
                    style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    View in History &rarr;
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
