// Run the whole file east of UTC: the custom-range regression (start month
// dropped because inputs were parsed as UTC) only reproduces in UTC+ zones.
process.env.TZ = 'Asia/Tokyo'

import React, { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Analytics from '../Analytics'
import { analyticsPeriodData } from '../analyticsData'
import { logger } from '../../utils/logger'

const pdf = vi.hoisted(() => ({
  instances: 0,
  texts: [] as string[],
  saved: [] as string[],
  failNext: false,
}))

vi.mock('jspdf', () => ({
  default: class {
    constructor() {
      if (pdf.failNext) {
        pdf.failNext = false
        throw new Error('jsPDF exploded')
      }
      pdf.instances++
    }
    text(value: string) { pdf.texts.push(value) }
    save(name: string) { pdf.saved.push(name) }
    addImage() {}
    rect() {}
    line() {}
    setFillColor() {}
    setTextColor() {}
    setFontSize() {}
    setFont() {}
    setDrawColor() {}
    setLineWidth() {}
  },
}))

const downloadCsvMock = vi.fn()
vi.mock('../../utils/csv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/csv')>()
  return { ...actual, downloadCsv: (...args: unknown[]) => downloadCsvMock(...args) }
})

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  Pie: () => null,
  Line: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))

vi.mock('../../context/ThemeContext', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

beforeEach(() => {
  pdf.instances = 0
  pdf.texts = []
  pdf.saved = []
  pdf.failNext = false
  downloadCsvMock.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderAnalytics(url = '/analytics') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Analytics />
    </MemoryRouter>,
  )
}

const rateInput = () => screen.getByLabelText('Target success rate') as HTMLInputElement
const capitalInput = () => screen.getByLabelText('Target capital locked') as HTMLInputElement
const fromInput = () => screen.getByLabelText('Custom range start date') as HTMLInputElement
const toInput = () => screen.getByLabelText('Custom range end date') as HTMLInputElement

function setRange(from: string, to: string) {
  fireEvent.change(fromInput(), { target: { value: from } })
  fireEvent.change(toInput(), { target: { value: to } })
}

function expectFiniteCssPercent(el: HTMLElement, prop: 'width' | 'left') {
  const raw = el.style[prop]
  expect(raw).toMatch(/^\d+(\.\d+)?%$/)
  const n = parseFloat(raw)
  expect(n).toBeGreaterThanOrEqual(0)
  expect(n).toBeLessThanOrEqual(100)
}

// Default period (30d): average success 75.75%, total capital $7,300.
describe('Analytics goal validation', () => {
  it('renders the default goals as valid, in-range targets', () => {
    renderAnalytics()
    expect(screen.getByTestId('goal-rate-status')).toHaveTextContent('14.3% to go')
    expect(screen.getByTestId('goal-rate-marker').style.left).toBe('90%')
    expect(screen.getByTestId('goal-capital-status')).toHaveTextContent('✓ Goal achieved!')
    expect(rateInput()).not.toHaveAttribute('aria-invalid')
  })

  it('does not report "Goal achieved" for an empty success-rate goal', () => {
    renderAnalytics()
    fireEvent.change(rateInput(), { target: { value: '' } })
    expect(screen.getByTestId('goal-rate-status')).toHaveTextContent('Enter a target value.')
    expect(screen.getByTestId('goal-rate-status')).not.toHaveTextContent('Goal achieved')
    expect(screen.queryByTestId('goal-rate-marker')).toBeNull()
    expect(rateInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Goal: —')).toBeInTheDocument()
  })

  it.each(['-5', '150', '100.5'])('rejects an out-of-range success-rate goal %j', (value) => {
    renderAnalytics()
    fireEvent.change(rateInput(), { target: { value } })
    expect(screen.getByTestId('goal-rate-status')).toHaveTextContent('Enter a value between 0 and 100.')
    expect(screen.queryByTestId('goal-rate-marker')).toBeNull()
    expect(screen.queryByText(/NaN/)).toBeNull()
  })

  it('handles the 0 and 100 boundaries', () => {
    renderAnalytics()
    fireEvent.change(rateInput(), { target: { value: '0' } })
    expect(screen.getByTestId('goal-rate-status')).toHaveTextContent('✓ Goal achieved!')
    expect(screen.getByTestId('goal-rate-marker').style.left).toBe('0%')

    fireEvent.change(rateInput(), { target: { value: '100' } })
    expect(screen.getByTestId('goal-rate-status')).toHaveTextContent('24.3% to go')
    expect(screen.getByTestId('goal-rate-marker').style.left).toBe('100%')
  })

  it('recovers once an invalid goal is corrected', () => {
    renderAnalytics()
    fireEvent.change(rateInput(), { target: { value: '150' } })
    expect(rateInput()).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(rateInput(), { target: { value: '70' } })
    expect(rateInput()).not.toHaveAttribute('aria-invalid')
    expect(screen.getByTestId('goal-rate-status')).toHaveTextContent('✓ Goal achieved!')
  })

  // Overflow to Infinity ('1e400') is covered in analyticsValidation.test.ts;
  // jsdom sanitizes that value to '' before it reaches the component.
  it('rejects a capital goal beyond the safe integer range', () => {
    renderAnalytics()
    fireEvent.change(capitalInput(), { target: { value: '1e20' } })
    expect(screen.getByTestId('goal-capital-status')).toHaveTextContent(/Enter a value between 0 and/)
    expect(screen.queryByTestId('goal-capital-marker')).toBeNull()
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull()
  })

  it('reports progress when the capital goal is above current capital', () => {
    renderAnalytics()
    fireEvent.change(capitalInput(), { target: { value: '14600' } })
    expect(screen.getByTestId('goal-capital-status')).toHaveTextContent('$7,300 to go')
    expect(screen.getByTestId('goal-capital-progress').style.width).toBe('50%')
    expect(screen.getByTestId('goal-capital-marker').style.left).toBe('100%')
  })

  it('keeps progress widths finite for a zero goal with zero capital (previously NaN)', async () => {
    const original = analyticsPeriodData['90d']
    analyticsPeriodData['90d'] = []
    try {
      renderAnalytics('/analytics?period=90d')
      fireEvent.change(capitalInput(), { target: { value: '0' } })
      expect(screen.getByTestId('goal-capital-status')).toHaveTextContent('✓ Goal achieved!')
      expectFiniteCssPercent(screen.getByTestId('goal-capital-progress'), 'width')
      expectFiniteCssPercent(screen.getByTestId('goal-capital-marker'), 'left')
      expectFiniteCssPercent(screen.getByTestId('goal-rate-progress'), 'width')
    } finally {
      analyticsPeriodData['90d'] = original
    }
  })
})

describe('Analytics custom date range', () => {
  it('parses dates in local time so the start month is kept in UTC+ zones', () => {
    renderAnalytics()
    setRange('2025-03-01', '2025-05-31')

    // Mar + Apr + May capital = 950 + 1800 + 2400
    expect(screen.getAllByText('$5,150').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /csv/i }))
    const [csv, filename] = downloadCsvMock.mock.calls[0]
    expect(filename).toBe('disciplr-analytics-2025-03-01-to-2025-05-31.csv')
    expect(csv).toContain('Mar')
    expect(csv).toContain('May')
    expect(csv).not.toContain('Feb')
    expect(csv).not.toContain('Jun')
  })

  it('compares a custom range with the same months of the previous year', () => {
    renderAnalytics()
    setRange('2025-03-01', '2025-05-31')
    // prev-year Mar–May capital = 500 + 900 + 1200 = 2600 → +2,550.
    // Pairing with the hidden 30d preset's previous series gave +$1,000.
    expect(screen.getByText('+$2,550 vs prev')).toBeInTheDocument()
    expect(screen.queryByText('+$1,000 vs prev')).toBeNull()
  })

  it('rejects a reversed range with a visible error and keeps the preset data', () => {
    renderAnalytics('/analytics?period=7d')
    setRange('2025-05-01', '2025-03-01')

    expect(screen.getByRole('alert')).toHaveTextContent('Start date must be on or before end date.')
    expect(fromInput()).toHaveAttribute('aria-invalid', 'true')
    expect(toInput()).toHaveAttribute('aria-describedby', 'custom-range-error')
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: /csv/i }))
    expect(downloadCsvMock.mock.calls[0][1]).toBe('disciplr-analytics-7d.csv')
  })

  it('treats a half-filled range as inactive without an error', () => {
    renderAnalytics()
    fireEvent.change(fromInput(), { target: { value: '2025-03-01' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('accepts a single-day range and lets the user clear an invalid range', () => {
    renderAnalytics()
    setRange('2025-03-01', '2025-03-01')
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByText('$950').length).toBeGreaterThan(0)

    setRange('2025-06-01', '2025-03-01')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear custom date range' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fromInput().value).toBe('')
    expect(toInput().value).toBe('')
  })

  it('selecting a preset clears the custom range', () => {
    renderAnalytics()
    setRange('2025-03-01', '2025-05-31')
    fireEvent.click(screen.getByRole('button', { name: '1y' }))
    expect(fromInput().value).toBe('')
    expect(screen.getByRole('button', { name: '1y' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Analytics period query param', () => {
  it.each(['bogus', '<script>alert(1)</script>', '30D', '', '7d%00'])(
    'falls back to 30d for invalid ?period=%j',
    (value) => {
      renderAnalytics(`/analytics?period=${encodeURIComponent(value)}`)
      expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true')
      expect(document.body.innerHTML).not.toContain('<script>alert(1)</script>')
    },
  )

  it.each(['7d', '30d', '90d', '1y', 'All'])('accepts valid ?period=%s', (value) => {
    renderAnalytics(`/analytics?period=${value}`)
    expect(screen.getByRole('button', { name: value })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Analytics PDF export', () => {
  const pdfButton = () => screen.getByRole('button', { name: /pdf report|loading/i })

  it('starts only one export for a rapid double click', async () => {
    renderAnalytics()
    act(() => {
      pdfButton().click()
      pdfButton().click()
    })
    await waitFor(() => expect(pdfButton()).not.toBeDisabled())
    expect(pdf.instances).toBe(1)
    expect(pdf.saved).toEqual(['disciplr-report-30d.pdf'])
  })

  it('allows a new export after the previous one finished', async () => {
    renderAnalytics()
    fireEvent.click(pdfButton())
    await waitFor(() => expect(pdf.saved).toHaveLength(1))
    await waitFor(() => expect(pdfButton()).not.toBeDisabled())
    fireEvent.click(pdfButton())
    await waitFor(() => expect(pdf.saved).toHaveLength(2))
  })

  it('shows a diagnosable error on failure and recovers on retry', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    pdf.failNext = true
    renderAnalytics()

    fireEvent.click(pdfButton())
    expect(await screen.findByText('Failed to generate PDF. Please try again.')).toBeInTheDocument()
    expect(pdfButton()).not.toBeDisabled()
    expect(errorSpy).toHaveBeenCalledWith('Failed to load or run jsPDF', expect.any(Error))

    fireEvent.click(pdfButton())
    await waitFor(() => expect(pdf.saved).toEqual(['disciplr-report-30d.pdf']))
    expect(screen.queryByText('Failed to generate PDF. Please try again.')).toBeNull()
  })

  it('reports the active custom range and its KPIs, not the hidden preset', async () => {
    renderAnalytics()
    setRange('2025-03-01', '2025-05-31')
    fireEvent.click(pdfButton())
    await waitFor(() => expect(pdf.saved).toEqual(['disciplr-report-2025-03-01-to-2025-05-31.pdf']))
    expect(pdf.texts).toContain('$5,150 USDC')
    expect(pdf.texts).toContain('2025-03-01 → 2025-05-31')
    expect(pdf.texts).not.toContain('30d')
  })
})

describe('Analytics enterprise gate', () => {
  it('keeps locked team previews hidden from assistive tech and inert', () => {
    renderAnalytics()
    const locked = document.querySelectorAll('[data-locked="true"]')
    expect(locked).toHaveLength(3)
    locked.forEach((el) => {
      expect(el).toHaveAttribute('aria-hidden', 'true')
      expect(el).toHaveAttribute('inert')
    })
    // Sample member names only exist inside the locked preview.
    expect(screen.queryByRole('heading', { name: 'Organization Summary' })).toBeNull()
    expect(screen.getByText('Enterprise Feature')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Upgrade to Enterprise' })).toBeEnabled()
  })

  it('does not mark unlocked cards as hidden', () => {
    renderAnalytics()
    expect(screen.getByRole('heading', { name: 'Vault Stats' }).closest('[aria-hidden]')).toBeNull()
  })
})
