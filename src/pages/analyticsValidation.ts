/**
 * analyticsValidation.ts
 *
 * Pure input-validation helpers for the Analytics page. Everything here is
 * deterministic and side-effect free so the page's invariants can be tested
 * without rendering:
 *
 *  - Goal inputs never produce NaN/Infinity or out-of-range values downstream.
 *  - Custom date ranges are parsed in *local* time (matching how the monthly
 *    series is bucketed) and are only "active" when both ends are valid and
 *    start <= end.
 *  - Progress ratios are always finite and clamped to [0, 100].
 *  - Previous-period rows are aligned to the current rows by name, so a
 *    filtered series never gets compared against unrelated rows.
 */
import type { AnalyticsDataPoint } from '../utils/analyticsKpis'

// ─── Goal inputs ─────────────────────────────────────────────────────────────

export interface GoalBounds {
  min: number
  max: number
}

export type GoalParseResult =
  | { value: number; error: null }
  | { value: null; error: string }

// Plain decimal / exponent notation only. Rejects hex ('0x10'), 'Infinity',
// whitespace-only strings and anything else Number() would silently coerce.
const NUMERIC_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/

/**
 * Parse a raw goal input string. Invalid, empty, non-finite and out-of-range
 * values are rejected (value === null) with a user-facing message; callers must
 * treat a null value as "no goal set" rather than as zero.
 */
export function parseGoalInput(raw: string, { min, max }: GoalBounds): GoalParseResult {
  const rangeMessage = `Enter a value between ${min.toLocaleString()} and ${max.toLocaleString()}.`
  const trimmed = raw.trim()
  if (trimmed === '') return { value: null, error: 'Enter a target value.' }
  if (!NUMERIC_PATTERN.test(trimmed)) return { value: null, error: rangeMessage }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < min || value > max) {
    return { value: null, error: rangeMessage }
  }
  return { value, error: null }
}

/**
 * `numerator / denominator` as a percentage clamped to [0, 100]. Returns 0 for a
 * zero, negative or non-finite denominator instead of NaN/Infinity, so it is
 * always safe to use as a CSS width/left value.
 */
export function safePercent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0
  const pct = (numerator / denominator) * 100
  return Math.min(Math.max(pct, 0), 100)
}

// ─── Custom date range ───────────────────────────────────────────────────────

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parse a `YYYY-MM-DD` value from `<input type="date">` as local midnight.
 *
 * `new Date('YYYY-MM-DD')` parses as UTC midnight, which in UTC+ zones lands
 * after local midnight and silently drops the first month of a range. Returns
 * null for malformed or impossible dates (e.g. 2025-02-30).
 */
export function parseLocalDate(value: string): Date | null {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(2000, 0, 1)
  // setFullYear avoids the Date constructor mapping years 0–99 to 1900–1999.
  date.setFullYear(year, month, day)
  date.setHours(0, 0, 0, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

export type DateRangeResult =
  | { status: 'empty' }
  | { status: 'incomplete' }
  | { status: 'invalid'; error: string }
  | { status: 'valid'; from: Date; to: Date }

/** Validate the pair of custom range inputs. Only `valid` may filter data. */
export function validateDateRange(fromRaw: string, toRaw: string): DateRangeResult {
  if (!fromRaw && !toRaw) return { status: 'empty' }
  if (!fromRaw || !toRaw) return { status: 'incomplete' }
  const from = parseLocalDate(fromRaw)
  const to = parseLocalDate(toRaw)
  if (!from || !to) return { status: 'invalid', error: 'Enter valid start and end dates.' }
  if (from > to) return { status: 'invalid', error: 'Start date must be on or before end date.' }
  return { status: 'valid', from, to }
}

export const MONTH_INDEX: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

/**
 * Keep the monthly points whose first day falls inside [from, to] (inclusive)
 * in *any* year the range covers. The series carries month names only, so a
 * range spanning two or more year boundaries necessarily includes every month.
 * Non-month names (e.g. 'Wk1') pass through unchanged.
 */
export function filterMonthlySeries<T extends { name: string }>(series: T[], from: Date, to: Date): T[] {
  const fromYear = from.getFullYear()
  const toYear = to.getFullYear()
  return series.filter((d) => {
    const monthIdx = MONTH_INDEX[d.name]
    if (monthIdx === undefined) return true
    if (toYear - fromYear >= 2) return true
    for (let year = fromYear; year <= toYear; year++) {
      const pointDate = new Date(from.getTime())
      pointDate.setFullYear(year, monthIdx, 1)
      pointDate.setHours(0, 0, 0, 0)
      if (pointDate >= from && pointDate <= to) return true
    }
    return false
  })
}

/**
 * Pick the previous-period row for each current row by name, preserving the
 * current order. Rows with no counterpart are omitted, so index `i` of the
 * result always describes the same bucket as index `i` of `current` when every
 * name has a match.
 */
export function alignPreviousByName(
  current: { name: string }[],
  previous: AnalyticsDataPoint[],
): AnalyticsDataPoint[] {
  const byName = new Map(previous.map((p) => [p.name, p]))
  return current.flatMap((d) => {
    const match = byName.get(d.name)
    return match ? [match] : []
  })
}
