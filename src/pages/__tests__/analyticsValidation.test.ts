import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  alignPreviousByName,
  filterMonthlySeries,
  parseGoalInput,
  parseLocalDate,
  safePercent,
  validateDateRange,
} from '../analyticsValidation'
import { analyticsPeriodData, prevPeriodData } from '../analyticsData'

const RATE = { min: 0, max: 100 }
const CAPITAL = { min: 0, max: Number.MAX_SAFE_INTEGER }

const names = (rows: { name: string }[]) => rows.map((r) => r.name)

function rangeOf(from: string, to: string) {
  const result = validateDateRange(from, to)
  if (result.status !== 'valid') throw new Error(`expected valid range, got ${result.status}`)
  return result
}

describe('parseGoalInput', () => {
  it.each([
    ['90', 90],
    ['0', 0],
    ['100', 100],
    ['99.5', 99.5],
    [' 42 ', 42],
    ['1e1', 10],
    ['.5', 0.5],
  ])('accepts %j as %d', (raw, expected) => {
    expect(parseGoalInput(raw, RATE)).toEqual({ value: expected, error: null })
  })

  it('rejects an empty or whitespace-only value instead of treating it as 0', () => {
    expect(parseGoalInput('', RATE)).toEqual({ value: null, error: 'Enter a target value.' })
    expect(parseGoalInput('   ', RATE)).toEqual({ value: null, error: 'Enter a target value.' })
  })

  it.each(['abc', '12abc', '0x10', 'Infinity', 'NaN', '--5', '1,000', '5%'])(
    'rejects non-numeric input %j',
    (raw) => {
      expect(parseGoalInput(raw, RATE)).toEqual({ value: null, error: 'Enter a value between 0 and 100.' })
    },
  )

  it.each(['-0.01', '-5', '100.01', '150'])('rejects out-of-range rate %j', (raw) => {
    expect(parseGoalInput(raw, RATE).value).toBeNull()
  })

  it('rejects values that overflow to Infinity or exceed the safe integer range', () => {
    expect(parseGoalInput('1e400', CAPITAL).value).toBeNull()
    expect(parseGoalInput(String(Number.MAX_SAFE_INTEGER + 2), CAPITAL).value).toBeNull()
    expect(parseGoalInput(String(Number.MAX_SAFE_INTEGER), CAPITAL).value).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('is deterministic for repeated calls with the same input', () => {
    const a = parseGoalInput('75', RATE)
    const b = parseGoalInput('75', RATE)
    expect(a).toEqual(b)
  })
})

describe('safePercent', () => {
  it('computes an in-range percentage', () => {
    expect(safePercent(25, 100)).toBe(25)
    expect(safePercent(5150, 5150)).toBe(100)
  })

  it('returns 0 instead of NaN for 0 / 0 (zero goal with zero capital)', () => {
    expect(safePercent(0, 0)).toBe(0)
  })

  it('returns 0 for negative or non-finite denominators', () => {
    expect(safePercent(10, -5)).toBe(0)
    expect(safePercent(10, Infinity)).toBe(0)
    expect(safePercent(NaN, 100)).toBe(0)
  })

  it('clamps to [0, 100]', () => {
    expect(safePercent(250, 100)).toBe(100)
    expect(safePercent(-20, 100)).toBe(0)
  })
})

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD as local midnight', () => {
    const d = parseLocalDate('2025-03-01')!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2025, 2, 1, 0, 0])
  })

  it.each(['', '2025-3-1', '2025/03/01', '03-01-2025', '2025-03-01T00:00', 'garbage'])(
    'rejects malformed value %j',
    (raw) => {
      expect(parseLocalDate(raw)).toBeNull()
    },
  )

  it.each(['2025-02-30', '2025-13-01', '2025-00-10', '2025-04-31', '2023-02-29'])(
    'rejects impossible calendar date %j',
    (raw) => {
      expect(parseLocalDate(raw)).toBeNull()
    },
  )

  it('accepts a leap day in a leap year', () => {
    expect(parseLocalDate('2024-02-29')?.getDate()).toBe(29)
  })

  it('does not map two-digit years into the 1900s', () => {
    expect(parseLocalDate('0050-06-15')?.getFullYear()).toBe(50)
  })
})

describe('validateDateRange', () => {
  it('distinguishes empty, incomplete, invalid, reversed and valid ranges', () => {
    expect(validateDateRange('', '')).toEqual({ status: 'empty' })
    expect(validateDateRange('2025-03-01', '')).toEqual({ status: 'incomplete' })
    expect(validateDateRange('', '2025-03-01')).toEqual({ status: 'incomplete' })
    expect(validateDateRange('2025-02-30', '2025-03-01')).toEqual({
      status: 'invalid',
      error: 'Enter valid start and end dates.',
    })
    expect(validateDateRange('2025-05-01', '2025-03-01')).toEqual({
      status: 'invalid',
      error: 'Start date must be on or before end date.',
    })
    expect(validateDateRange('2025-03-01', '2025-05-31').status).toBe('valid')
  })

  it('accepts a single-day range (start === end)', () => {
    expect(validateDateRange('2025-03-01', '2025-03-01').status).toBe('valid')
  })
})

// The monthly series is bucketed in local time. Parsing the inputs with
// `new Date('YYYY-MM-DD')` (UTC) shifted the range by the UTC offset and
// dropped the first month east of UTC and the last month west of UTC.
describe.each(['UTC', 'Asia/Tokyo', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Pacific/Pago_Pago'])(
  'filterMonthlySeries in timezone %s',
  (tz) => {
    const originalTz = process.env.TZ
    beforeAll(() => {
      process.env.TZ = tz
    })
    afterAll(() => {
      process.env.TZ = originalTz
    })

    const series = analyticsPeriodData['1y']

    it('exercises the zone (UTC-parsed dates are shifted off local midnight)', () => {
      const utcParsedHour = new Date('2025-03-01').getHours()
      if (tz === 'UTC') expect(utcParsedHour).toBe(0)
      else expect(utcParsedHour).not.toBe(0)
    })

    it('includes both inclusive month boundaries', () => {
      const { from, to } = rangeOf('2025-03-01', '2025-05-01')
      expect(names(filterMonthlySeries(series, from, to))).toEqual(['Mar', 'Apr', 'May'])
    })

    it('includes the start month when the range begins on the 1st', () => {
      const { from, to } = rangeOf('2025-03-01', '2025-05-31')
      expect(names(filterMonthlySeries(series, from, to))).toEqual(['Mar', 'Apr', 'May'])
    })

    it('excludes a month whose 1st precedes a mid-month start', () => {
      const { from, to } = rangeOf('2025-03-02', '2025-05-31')
      expect(names(filterMonthlySeries(series, from, to))).toEqual(['Apr', 'May'])
    })

    it('handles a range that wraps a year boundary', () => {
      const { from, to } = rangeOf('2024-11-01', '2025-02-01')
      expect(names(filterMonthlySeries(series, from, to))).toEqual(['Jan', 'Feb', 'Nov', 'Dec'])
    })

    it('returns every month for ranges spanning more than two calendar years', () => {
      const { from, to } = rangeOf('2022-06-15', '2025-02-10')
      expect(names(filterMonthlySeries(series, from, to))).toEqual(names(series))
    })

    it('returns every month for a full calendar year across one boundary', () => {
      const { from, to } = rangeOf('2024-01-01', '2025-12-31')
      expect(names(filterMonthlySeries(series, from, to))).toEqual(names(series))
    })

    it('includes only the covered months of a range just over one year', () => {
      const { from, to } = rangeOf('2024-06-02', '2025-06-01')
      expect(names(filterMonthlySeries(series, from, to))).toEqual(names(series))
      const { from: f2, to: t2 } = rangeOf('2024-06-02', '2025-04-15')
      expect(names(filterMonthlySeries(series, f2, t2))).toEqual(
        ['Jan', 'Feb', 'Mar', 'Apr', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      )
    })

    it('returns no months for a range that contains no 1st-of-month', () => {
      const { from, to } = rangeOf('2025-03-02', '2025-03-20')
      expect(filterMonthlySeries(series, from, to)).toEqual([])
    })

    it('passes non-month buckets through unchanged', () => {
      const { from, to } = rangeOf('2025-03-02', '2025-03-20')
      expect(names(filterMonthlySeries(analyticsPeriodData['30d'], from, to))).toEqual(['Wk1', 'Wk2', 'Wk3', 'Wk4'])
    })
  },
)

describe('alignPreviousByName', () => {
  it('pairs each current month with the same month of the previous year', () => {
    const current = analyticsPeriodData['1y'].filter((d) => ['Mar', 'Apr', 'May'].includes(d.name))
    const aligned = alignPreviousByName(current, prevPeriodData['1y'])
    expect(names(aligned)).toEqual(['Mar', 'Apr', 'May'])
    expect(aligned.map((d) => d.capital)).toEqual([500, 900, 1200])
  })

  it('omits rows with no counterpart and returns [] for no matches', () => {
    expect(alignPreviousByName([{ name: 'Jan' }, { name: 'Wk9' }], prevPeriodData['1y']).map((d) => d.name)).toEqual(['Jan'])
    expect(alignPreviousByName([{ name: 'Wk1' }], prevPeriodData['1y'])).toEqual([])
    expect(alignPreviousByName([], prevPeriodData['1y'])).toEqual([])
  })
})
