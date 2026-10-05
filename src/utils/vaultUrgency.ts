/**
 * Classification of vault deadline urgency based on remaining time.
 */
export type UrgencyTier = 'safe' | 'soon' | 'critical' | 'expired';

/**
 * Vaults with remaining time less than or equal to 24 hours are classified as critical.
 */
export const URGENCY_CRITICAL_MS = 24 * 60 * 60 * 1000;

/**
 * Vaults with remaining time greater than 24 hours and less than or equal to 7 days are classified as soon.
 */
export const URGENCY_SOON_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Evaluates the urgency tier of a deadline relative to a reference time.
 *
 * @param deadline - ISO timestamp or parseable date string representing the target deadline.
 * @param now - Reference timestamp or Date instance (defaults to Date.now()).
 * @returns UrgencyTier: 'expired', 'critical', 'soon', or 'safe'. Returns 'safe' if deadline is unparseable.
 */
export function deadlineUrgency(deadline: string, now: Date | number = Date.now()): UrgencyTier {
  const deadlineMs = new Date(deadline).getTime();
  const nowMs = typeof now === 'number' ? now : now.getTime();

  if (Number.isNaN(deadlineMs)) {
    return 'safe';
  }

  const msRemaining = deadlineMs - nowMs;
  if (msRemaining <= 0) {
    return 'expired';
  }
  if (msRemaining <= URGENCY_CRITICAL_MS) {
    return 'critical';
  }
  if (msRemaining <= URGENCY_SOON_MS) {
    return 'soon';
  }
  return 'safe';
}
