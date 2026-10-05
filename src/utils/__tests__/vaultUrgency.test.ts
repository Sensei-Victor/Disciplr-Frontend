import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  deadlineUrgency,
  URGENCY_CRITICAL_MS,
  URGENCY_SOON_MS,
  type UrgencyTier,
} from '../vaultUrgency';

const fixedNow = new Date('2026-07-27T12:00:00.000Z');

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(fixedNow);
});

describe('vaultUrgency constants', () => {
  it('defines URGENCY_CRITICAL_MS as 24 hours in milliseconds', () => {
    expect(URGENCY_CRITICAL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('defines URGENCY_SOON_MS as 7 days in milliseconds', () => {
    expect(URGENCY_SOON_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('deadlineUrgency', () => {
  it('returns expired when deadline is exactly equal to current time', () => {
    const deadline = fixedNow.toISOString();
    expect(deadlineUrgency(deadline, fixedNow)).toBe('expired');
  });

  it('returns expired when deadline is in the past', () => {
    const deadline = new Date(fixedNow.getTime() - 1000).toISOString();
    expect(deadlineUrgency(deadline, fixedNow)).toBe('expired');
  });

  it('returns critical when deadline is within 24 hours', () => {
    const deadline = new Date(fixedNow.getTime() + URGENCY_CRITICAL_MS - 1000).toISOString();
    expect(deadlineUrgency(deadline, fixedNow)).toBe('critical');
  });

  it('returns critical when deadline is exactly 24 hours away', () => {
    const deadline = new Date(fixedNow.getTime() + URGENCY_CRITICAL_MS).toISOString();
    expect(deadlineUrgency(deadline, fixedNow)).toBe('critical');
  });

  it('returns soon when deadline is just over 24 hours away', () => {
    const deadline = new Date(fixedNow.getTime() + URGENCY_CRITICAL_MS + 1).toISOString();
    expect(deadlineUrgency(deadline, fixedNow)).toBe('soon');
  });

  it('returns soon when deadline is exactly 7 days away', () => {
    const deadline = new Date(fixedNow.getTime() + URGENCY_SOON_MS).toISOString();
    expect(deadlineUrgency(deadline, fixedNow)).toBe('soon');
  });

  it('returns safe when deadline is just over 7 days away', () => {
    const deadline = new Date(fixedNow.getTime() + URGENCY_SOON_MS + 1).toISOString();
    expect(deadlineUrgency(deadline, fixedNow)).toBe('safe');
  });

  it('returns safe when deadline string is invalid or non-date', () => {
    expect(deadlineUrgency('invalid-date', fixedNow)).toBe('safe');
    expect(deadlineUrgency('', fixedNow)).toBe('safe');
  });

  it('accepts numeric timestamp as reference time', () => {
    const deadline = new Date(fixedNow.getTime() + 1000).toISOString();
    expect(deadlineUrgency(deadline, fixedNow.getTime())).toBe('critical');
  });

  it('defaults reference time to current system time when omitted', () => {
    const deadline = new Date(fixedNow.getTime() + 1000).toISOString();
    expect(deadlineUrgency(deadline)).toBe('critical');
  });

  it('satisfies UrgencyTier type constraints', () => {
    const tiers: UrgencyTier[] = ['safe', 'soon', 'critical', 'expired'];
    expect(tiers).toHaveLength(4);
  });
});
