import { describe, it, expect } from 'vitest';
import { dateBucket, groupNotificationsByDate } from '../groupNotifications';

describe('groupNotifications utility', () => {
  describe('dateBucket', () => {
    it('returns "Today" for a timestamp exactly at midnight of "today"', () => {
      const now = new Date('2023-10-15T12:00:00Z');
      const midnightToday = new Date('2023-10-15T00:00:00Z').toISOString();
      expect(dateBucket(midnightToday, now)).toBe('Today');
    });

    it('returns "Yesterday" for a timestamp exactly 24 hours ago', () => {
      const now = new Date('2023-10-15T00:00:00Z');
      const yesterday = new Date('2023-10-14T00:00:00Z').toISOString();
      expect(dateBucket(yesterday, now)).toBe('Yesterday');
    });

    it('returns "Earlier" for a timestamp several days old', () => {
      const now = new Date('2023-10-15T10:00:00Z');
      const earlier = new Date('2023-10-10T10:00:00Z').toISOString();
      expect(dateBucket(earlier, now)).toBe('Earlier');
    });
  });

  describe('groupNotificationsByDate', () => {
    it('omits empty buckets from the result', () => {
      const now = new Date('2023-10-15T12:00:00Z');
      const items = [
        { id: 1, timestamp: new Date('2023-10-15T10:00:00Z').toISOString() }, // Today
        { id: 2, timestamp: new Date('2023-10-10T10:00:00Z').toISOString() }  // Earlier
      ];

      const result = groupNotificationsByDate(items, now);

      // 'Yesterday' bucket should be missing entirely
      expect(result).toHaveLength(2);
      expect(result[0].bucket).toBe('Today');
      expect(result[1].bucket).toBe('Earlier');
      expect(result[0].items).toEqual([items[0]]);
      expect(result[1].items).toEqual([items[1]]);
    });
  });
});
