import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Breadcrumb from '../components/Breadcrumb';
import { Text } from '../components/Text';
import { useVerifierStore } from '../Zustand/Store';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { SafeLink } from '../components/SafeLink';
import { isCriteriaGateOpen } from '../utils/criteriaGate';
import { classifyEvidenceUrl, EVIDENCE_BADGE_COLORS } from '../utils/evidenceKind';
import { clearNotesDraft, readNotesDraft, writeNotesDraft } from '../utils/notesDraft';
import { daysRemaining } from '../utils/dashboard';
import { useCurrentTime } from '../hooks/useCurrentTime';

const NOTES_DRAFT_WRITE_DELAY_MS = 300;

function useNotesDraft(taskId: string | undefined) {
  const [notes, setNotes] = useState(() => {
    if (!taskId) return '';
    try {
      return readNotesDraft(taskId);
    } catch {
      return '';
    }
  });

  useEffect(() => {
    if (!taskId) {
      setNotes('');
      return;
    }
    try {
      setNotes(readNotesDraft(taskId));
    } catch {
      setNotes('');
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        if (notes.trim().length > 0) {
          writeNotesDraft(taskId, notes);
        } else {
          clearNotesDraft(taskId);
        }
      } catch (err) {
        console.warn('[ValidationDetail] Failed to persist notes draft:', err);
      }
    }, NOTES_DRAFT_WRITE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [notes, taskId]);

  const clearDraft = () => {
    if (!taskId) return;
    try {
      clearNotesDraft(taskId);
    } catch (err) {
      console.warn('[ValidationDetail] Failed to clear notes draft:', err);
    }
    setNotes('');
  };

  return { notes, setNotes, clearDraft };
}

export default function ValidationDetail() {
  const { vaultId } = useParams<{ vaultId: string }>();
  const navigate = useNavigate();
  const now = useCurrentTime();
  
  const pendingValidations = useVerifierStore((state) => state.pendingValidations);
  const approveValidation = useVerifierStore((state) => state.approveValidation);
  const rejectValidation = useVerifierStore((state) => state.rejectValidation);

  const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkedCriteria, setCheckedCriteria] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Input validation & boundary handling for vaultId and store state
  const cleanVaultId = typeof vaultId === 'string' ? vaultId.trim() : '';
  const taskList = Array.isArray(pendingValidations) ? pendingValidations : [];
  const task = taskList.find((t) => Boolean(t) && t.id === cleanVaultId);
  const { notes, setNotes, clearDraft } = useNotesDraft(task?.id);

  // Deduplicate and sanitize criteria strings
  const rawCriteria = Array.isArray(task?.criteria) ? task.criteria : [];
  const sanitizedCriteria = Array.from(
    new Set(rawCriteria.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean))
  );

  const remaining = task?.deadline ? daysRemaining(task.deadline, now) : 0;
  const safeRemaining = Number.isNaN(remaining) ? 0 : remaining;

  useEffect(() => {
    setCheckedCriteria(new Set());
    setActionError(null);
    setIsSubmitting(false);
  }, [task?.id]);

  if (!task || !task.id) {
    return (
      <div className="p-12 text-center flex flex-col items-center gap-4">
        <Text role="display" as="h2">Validation Not Found</Text>
        <Text role="body" as="p" style={{ color: 'var(--muted)' }}>
          This validation task may have already been processed or doesn't exist.
        </Text>
        <button
          onClick={() => navigate('/verifier/queue')}
          className="px-6 py-2 rounded transition font-medium"
          style={{ background: 'var(--accent)', color: 'white' }}
        >
          Return to Queue
        </button>
      </div>
    );
  }

  const toggleCriterion = (criterion: string) => {
    setCheckedCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(criterion)) {
        next.delete(criterion);
      } else {
        next.add(criterion);
      }
      return next;
    });
  };

  const gateOpen = isCriteriaGateOpen(sanitizedCriteria, checkedCriteria);

  const handleOpenModal = (action: 'approve' | 'reject') => {
    if (action === 'approve' && !gateOpen) {
      setActionError('Cannot initiate approval: milestone criteria gate is not open.');
      return;
    }
    setActionError(null);
    setConfirmAction(action);
    setIsModalOpen(true);
  };

  const executeAction = (decision: 'approve' | 'reject', modalNotes: string) => {
    // Single-flight / idempotency guard
    if (isSubmitting) {
      return;
    }

    // Invariant check: Approval requires criteria gate to be open
    if (decision === 'approve' && !gateOpen) {
      setActionError('Validation gate failed: all criteria must be completed prior to approval.');
      setIsModalOpen(false);
      return;
    }

    // Invariant check: Rejection requires non-empty notes
    if (decision === 'reject' && !modalNotes.trim()) {
      setActionError('Rejection reason is required.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      const result = decision === 'approve'
        ? approveValidation(task.id, modalNotes)
        : rejectValidation(task.id, modalNotes);

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>)
          .then(() => {
            clearDraft();
            setIsModalOpen(false);
            navigate('/verifier/queue');
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : 'An error occurred while processing validation.';
            console.error('[ValidationDetail] Action execution failed:', err);
            setActionError(message);
          })
          .finally(() => {
            setIsSubmitting(false);
          });
      } else {
        clearDraft();
        setIsModalOpen(false);
        navigate('/verifier/queue');
        setIsSubmitting(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred while processing validation.';
      console.error('[ValidationDetail] Action execution failed:', err);
      setActionError(message);
      setIsSubmitting(false);
    }
  };

  const vaultName = task.vaultName || 'Unnamed Vault';
  const owner = task.owner || 'Unknown Owner';
  const amount = task.amount || '0 USDC';
  const milestone = task.milestone || 'Untitled Milestone';

  return (
    <div className="flex flex-col gap-6 p-6 relative">
      <header>
        <Breadcrumb
          segments={[
            { label: 'Home', to: '/' },
            { label: 'Verifier Queue', to: '/verifier/queue' },
            { label: vaultName },
          ]}
          style={{ marginBottom: 'var(--spacing-4)' }}
        />
        <button
          onClick={() => navigate('/verifier/queue')}
          className="mb-4 text-sm font-medium transition"
          style={{ color: 'var(--muted)' }}
        >
          &larr; Back to Queue
        </button>
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <Text role="display" as="h1">Review Milestone</Text>
            <Text role="body" as="p" className="mt-1" style={{ color: 'var(--muted)' }}>
              Task ID: {task.id}
            </Text>
          </div>
          <div
            className="px-4 py-2 rounded font-bold text-sm"
            style={{
              background: safeRemaining <= 3 ? 'var(--danger-transparent)' : 'var(--success-transparent)',
              color: safeRemaining <= 3 ? 'var(--danger)' : 'var(--success)',
            }}
          >
            Deadline: {safeRemaining} days remaining
          </div>
        </div>
      </header>

      {actionError && (
        <div
          role="alert"
          className="p-4 rounded-lg flex items-center justify-between text-sm font-medium"
          style={{
            background: 'var(--danger-transparent, rgba(239, 68, 68, 0.1))',
            color: 'var(--danger, #ef4444)',
            border: '1px solid var(--danger, #ef4444)',
          }}
        >
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="ml-4 font-bold text-xs underline cursor-pointer"
            aria-label="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <section className="p-6 border rounded-lg shadow-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            <Text role="display" as="h2" className="mb-4">Vault Summary</Text>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Text role="body" as="p" className="text-sm" style={{ color: 'var(--muted)' }}>Vault Name</Text>
                <Text role="body" as="p" className="font-medium">{vaultName}</Text>
              </div>
              <div>
                <Text role="body" as="p" className="text-sm" style={{ color: 'var(--muted)' }}>Owner Wallet</Text>
                <span className="text-xs px-2 py-1 rounded font-mono block w-max mt-1" style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}>
                  {owner}
                </span>
              </div>
              <div>
                <Text role="body" as="p" className="text-sm" style={{ color: 'var(--muted)' }}>Amount at Stake</Text>
                <Text role="body" as="p" className="font-bold" style={{ color: 'var(--success)' }}>{amount}</Text>
              </div>
              <div>
                <Text role="body" as="p" className="text-sm" style={{ color: 'var(--muted)' }}>Deadline Date</Text>
                <Text role="body" as="p" className="font-medium">{task.deadline || 'No deadline set'}</Text>
              </div>
            </div>
          </section>

          <section className="p-6 border rounded-lg shadow-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            <Text role="display" as="h2" className="mb-4">Milestone Evidence</Text>
            <div className="p-4 border rounded mb-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <Text role="body" as="p" className="font-bold">Target Milestone:</Text>
              <Text role="body" as="p" className="mt-1">{milestone}</Text>
            </div>
            
            <Text role="body" as="p" className="font-bold mb-2">Submitted Proof:</Text>
            {task.evidenceUrl && typeof task.evidenceUrl === 'string' && task.evidenceUrl.trim() ? (
              <div className="p-4 border rounded-lg" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3 mb-3">
                  {(() => {
                    const info = classifyEvidenceUrl(task.evidenceUrl);
                    if (!info) return null;
                    const kindLabels: Record<typeof info.kind, string> = {
                      github: 'GitHub',
                      figma: 'Figma',
                      ipfs: 'IPFS',
                      other: 'Other'
                    };
                    const brandColor = EVIDENCE_BADGE_COLORS[info.kind];
                    const colors = {
                      bg: `color-mix(in srgb, ${brandColor} 10%, transparent)`,
                      color: brandColor,
                    };
                    return (
                      <>
                        <span
                          className="px-3 py-1 rounded-full text-xs font-semibold"
                          style={{ background: colors.bg, color: colors.color, border: `1px solid ${colors.color}` }}
                        >
                          {kindLabels[info.kind]}
                        </span>
                        <Text role="body" as="span" className="text-sm" style={{ color: 'var(--muted)' }}>
                          {info.host}
                        </Text>
                      </>
                    );
                  })()}
                </div>
                <SafeLink
                  href={task.evidenceUrl}
                  className="inline-block px-4 py-2 border rounded transition font-medium text-sm"
                  style={{
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                    background: 'var(--accent-transparent)',
                  }}
                >
                  &#128279; View Attached Evidence
                </SafeLink>
              </div>
            ) : (
              <Text role="body" as="p" className="italic" style={{ color: 'var(--muted)' }}>No evidence link provided.</Text>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="p-6 border rounded-lg shadow-sm flex flex-col h-full" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            <Text role="display" as="h2" className="mb-4">Verification Actions</Text>

            {sanitizedCriteria.length > 0 && (
              <fieldset className="mb-6 flex flex-col gap-2">
                <legend className="font-medium text-sm mb-2">
                  <Text role="body" as="span">Milestone Criteria</Text>
                </legend>
                {sanitizedCriteria.map((criterion, idx) => (
                  <label
                    key={`${criterion}-${idx}`}
                    className="flex items-start gap-2 text-sm cursor-pointer"
                    style={{ color: 'var(--text)' }}
                  >
                    <input
                      type="checkbox"
                      checked={checkedCriteria.has(criterion)}
                      onChange={() => toggleCriterion(criterion)}
                      aria-label={criterion}
                      className="mt-0.5 accent-[var(--accent)] shrink-0"
                    />
                    {criterion}
                  </label>
                ))}
              </fieldset>
            )}
            
            <label className="flex flex-col gap-2 mb-6 flex-grow">
              <Text role="body" as="span" className="font-medium text-sm">Initial Verification Notes (Optional)</Text>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Start adding your review notes here..."
                className="w-full rounded p-3 text-sm h-32 outline-none resize-none"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                }}
              />
            </label>

            <div className="flex flex-col gap-3 mt-auto">
              <button
                onClick={() => handleOpenModal('approve')}
                disabled={!gateOpen || isSubmitting}
                aria-disabled={!gateOpen || isSubmitting}
                className="w-full py-3 font-bold rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: gateOpen ? 'var(--success)' : 'var(--muted)',
                  color: 'white',
                  cursor: gateOpen && !isSubmitting ? 'pointer' : 'not-allowed',
                  opacity: gateOpen && !isSubmitting ? 1 : 0.5,
                }}
              >
                {isSubmitting && confirmAction === 'approve' ? 'Approving…' : 'Approve Milestone'}
              </button>
              <button
                onClick={() => handleOpenModal('reject')}
                disabled={isSubmitting}
                className="w-full py-3 font-bold rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--danger)', color: 'white' }}
              >
                {isSubmitting && confirmAction === 'reject' ? 'Rejecting…' : 'Reject Milestone'}
              </button>
            </div>
          </section>
        </div>
      </div>

      <ConfirmationModal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        onConfirm={executeAction}
        initialDecision={confirmAction || undefined}
        initialNotes={notes}
        evidenceUrl={task.evidenceUrl}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
