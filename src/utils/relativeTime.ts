/**
 * formatRelativeTime - Format a date as a relative time string (e.g., "2 hours ago")
 *
 * Uses Intl.RelativeTimeFormat for localized, human-readable time differences.
 * Handles seconds, minutes, hours, days, and weeks. Supports both past and future dates.
 *
 * @param date - The date to format (Date object, ISO string, or timestamp)
 * @param now - Optional reference time for testing (defaults to current time)
 * @returns A localized relative time string (e.g., "2 hours ago", "in 3 days")
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 3600000)) // "1 hour ago"
 * formatRelativeTime(new Date(Date.now() + 86400000)) // "in 1 day"
 * formatRelativeTime("2024-04-28T14:30:00Z", new Date("2024-04-28T16:30:00Z").getTime()) // "2 hours ago"
 */
export function formatRelativeTime(
  date: Date | string | number,
  now: number = Date.now(),
): string {
  // Convert input to timestamp
  const timestamp = typeof date === "number" ? date : new Date(date).getTime();

  // Handle invalid dates
  if (isNaN(timestamp)) {
    return "Invalid date";
  }

  const diffInSeconds = (timestamp - now) / 1000;
  const absDiff = Math.abs(diffInSeconds);

  // Use Intl.RelativeTimeFormat for localized formatting
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });

  // Less than 1 minute
  if (absDiff < 60) {
    if (absDiff < 10) {
      return diffInSeconds > 0 ? "in a moment" : "just now";
    }
    return rtf.format(Math.round(diffInSeconds), "second");
  }

  // Less than 1 hour
  if (absDiff < 3600) {
    const minutes = Math.round(diffInSeconds / 60);
    return rtf.format(minutes, "minute");
  }

  // Less than 1 day
  if (absDiff < 86400) {
    const hours = Math.round(diffInSeconds / 3600);
    return rtf.format(hours, "hour");
  }

  // Less than 1 week
  if (absDiff < 604800) {
    const days = Math.round(diffInSeconds / 86400);
    return rtf.format(days, "day");
  }

  // Less than 1 month (approximately 30 days)
  if (absDiff < 2592000) {
    const weeks = Math.round(diffInSeconds / 604800);
    return rtf.format(weeks, "week");
  }

  // For dates beyond a month, fall back to absolute date formatting
  const dateObj = new Date(timestamp);
  return dateObj.toLocaleDateString("pt-US", {
    month: "short",
    day: "numeric",
    year:
      dateObj.getFullYear() !== new Date(now).getFullYear()
        ? "numeric"
        : undefined,
  });
}
