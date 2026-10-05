import { formatRelativeTime } from "../relativeTime";

describe("formatRelativeTime", () => {
  const NOW = new Date("2024-04-28T12:00:00Z").getTime();

  describe("past dates", () => {
    it('should return "just now" for very recent timestamps', () => {
      expect(formatRelativeTime(NOW - 5000, NOW)).toBe("just now");
      expect(formatRelativeTime(NOW - 9000, NOW)).toBe("just now");
    });

    it('should return "in a moment" for very near future timestamps', () => {
      expect(formatRelativeTime(NOW + 5000, NOW)).toBe("in a moment");
      expect(formatRelativeTime(NOW + 9000, NOW)).toBe("in a moment");
    });

    it("should format seconds correctly", () => {
      expect(formatRelativeTime(NOW - 15000, NOW)).toBe("15 seconds ago");
      expect(formatRelativeTime(NOW - 30000, NOW)).toBe("30 seconds ago");
      expect(formatRelativeTime(NOW - 45000, NOW)).toBe("45 seconds ago");
    });

    it("should format minutes correctly", () => {
      expect(formatRelativeTime(NOW - 60000, NOW)).toBe("1 minute ago");
      expect(formatRelativeTime(NOW - 120000, NOW)).toBe("2 minutes ago");
      expect(formatRelativeTime(NOW - 1800000, NOW)).toBe("30 minutes ago");
      expect(formatRelativeTime(NOW - 3540000, NOW)).toBe("59 minutes ago");
    });

    it("should format hours correctly", () => {
      expect(formatRelativeTime(NOW - 3600000, NOW)).toBe("1 hour ago");
      expect(formatRelativeTime(NOW - 7200000, NOW)).toBe("2 hours ago");
      expect(formatRelativeTime(NOW - 14400000, NOW)).toBe("4 hours ago");
      expect(formatRelativeTime(NOW - 82800000, NOW)).toBe("23 hours ago");
    });

    it("should format days correctly", () => {
      expect(formatRelativeTime(NOW - 86400000, NOW)).toBe("1 day ago");
      expect(formatRelativeTime(NOW - 172800000, NOW)).toBe("2 days ago");
      expect(formatRelativeTime(NOW - 432000000, NOW)).toBe("5 days ago");
    });

    it("should format weeks correctly", () => {
      expect(formatRelativeTime(NOW - 604800000, NOW)).toBe("1 week ago");
      expect(formatRelativeTime(NOW - 1209600000, NOW)).toBe("2 weeks ago");
      expect(formatRelativeTime(NOW - 1814400000, NOW)).toBe("3 weeks ago");
    });

    it("should fall back to absolute date for dates beyond a month", () => {
      const thirtyOneDaysAgo = NOW - 2678400000; // 31 days
      const result = formatRelativeTime(thirtyOneDaysAgo, NOW);
      expect(result).toMatch(/Mar/);
    });
  });

  describe("future dates", () => {
    it('should return "in a moment" for very near future timestamps', () => {
      expect(formatRelativeTime(NOW + 5000, NOW)).toBe("in a moment");
      expect(formatRelativeTime(NOW + 9000, NOW)).toBe("in a moment");
    });

    it("should format future seconds correctly", () => {
      expect(formatRelativeTime(NOW + 15000, NOW)).toBe("in 15 seconds");
      expect(formatRelativeTime(NOW + 30000, NOW)).toBe("in 30 seconds");
    });

    it("should format future minutes correctly", () => {
      expect(formatRelativeTime(NOW + 60000, NOW)).toBe("in 1 minute");
      expect(formatRelativeTime(NOW + 120000, NOW)).toBe("in 2 minutes");
      expect(formatRelativeTime(NOW + 1800000, NOW)).toBe("in 30 minutes");
    });

    it("should format future hours correctly", () => {
      expect(formatRelativeTime(NOW + 3600000, NOW)).toBe("in 1 hour");
      expect(formatRelativeTime(NOW + 7200000, NOW)).toBe("in 2 hours");
      expect(formatRelativeTime(NOW + 14400000, NOW)).toBe("in 4 hours");
    });

    it("should format future days correctly", () => {
      expect(formatRelativeTime(NOW + 86400000, NOW)).toBe("in 1 day");
      expect(formatRelativeTime(NOW + 172800000, NOW)).toBe("in 2 days");
      expect(formatRelativeTime(NOW + 432000000, NOW)).toBe("in 5 days");
    });

    it("should format future weeks correctly", () => {
      expect(formatRelativeTime(NOW + 604800000, NOW)).toBe("in 1 week");
      expect(formatRelativeTime(NOW + 1209600000, NOW)).toBe("in 2 weeks");
    });
  });

  describe("edge cases", () => {
    it("should handle exactly 1 minute", () => {
      expect(formatRelativeTime(NOW - 60000, NOW)).toBe("1 minute ago");
      expect(formatRelativeTime(NOW + 60000, NOW)).toBe("in 1 minute");
    });

    it("should handle exactly 1 hour", () => {
      expect(formatRelativeTime(NOW - 3600000, NOW)).toBe("1 hour ago");
      expect(formatRelativeTime(NOW + 3600000, NOW)).toBe("in 1 hour");
    });

    it("should handle exactly 1 day", () => {
      expect(formatRelativeTime(NOW - 86400000, NOW)).toBe("1 day ago");
      expect(formatRelativeTime(NOW + 86400000, NOW)).toBe("in 1 day");
    });

    it("should handle exactly 1 week", () => {
      expect(formatRelativeTime(NOW - 604800000, NOW)).toBe("1 week ago");
      expect(formatRelativeTime(NOW + 604800000, NOW)).toBe("in 1 week");
    });

    it("should handle day boundaries", () => {
      // Just under 24 hours
      expect(formatRelativeTime(NOW - 82800000, NOW)).toBe("23 hours ago");
      // Just over 24 hours
      expect(formatRelativeTime(NOW - 86460000, NOW)).toBe("1 day ago");
    });

    it("should handle invalid dates", () => {
      expect(formatRelativeTime("invalid date", NOW)).toBe("Invalid date");
      expect(formatRelativeTime(NaN, NOW)).toBe("Invalid date");
    });
  });

  describe("input formats", () => {
    it("should accept Date objects", () => {
      const date = new Date(NOW - 3600000);
      expect(formatRelativeTime(date, NOW)).toBe("1 hour ago");
    });

    it("should accept ISO strings", () => {
      const iso = new Date(NOW - 7200000).toISOString();
      expect(formatRelativeTime(iso, NOW)).toBe("2 hours ago");
    });

    it("should accept timestamps", () => {
      expect(formatRelativeTime(NOW - 1800000, NOW)).toBe("30 minutes ago");
    });

    it('should default to current time when "now" is not provided', () => {
      const fiveMinutesAgo = Date.now() - 300000;
      const result = formatRelativeTime(fiveMinutesAgo);
      expect(result).toBe("5 minutes ago");
    });
  });

  describe("localization", () => {
    it("should use Intl.RelativeTimeFormat for English locale", () => {
      expect(formatRelativeTime(NOW - 3600000, NOW)).toBe("1 hour ago");
      expect(formatRelativeTime(NOW + 3600000, NOW)).toBe("in 1 hour");
    });
  });
});
