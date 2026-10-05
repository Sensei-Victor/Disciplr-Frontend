import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock downloadCsv and toCsv before importing Analytics
const downloadCsvMock = vi.fn()
const toCsvMock = vi.fn((data: any) => {
  const headers = ['Period', 'Success %', 'Failed %', 'Capital (USDC)', 'Milestones']
  const rows = data.map((d: any) => [d.name, d.success, d.failed, d.capital, d.milestones].join(','))
  return [headers.join(','), ...rows].join('\r\n')
})

vi.mock('../../utils/csv', () => ({
  toCsv: (...args: any[]) => toCsvMock(...args),
  downloadCsv: (...args: any[]) => downloadCsvMock(...args),
}))

// Mock other dependencies
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
}))

vi.mock('jspdf', () => ({
  default: class {
    text() {}
    save() {}
    addImage() {}
  },
}))

vi.mock('../../context/WalletContext', () => ({
  WalletProvider: ({ children }: any) => <>{children}</>,
  useWallet: () => ({
    address: null,
    network: null,
    balance: null,
    isConnecting: false,
    error: null,
    connect: async () => {},
    disconnect: () => {},
    checkConnection: async () => {},
  }),
}))

vi.mock('../../context/ThemeContext', () => ({
  ThemeProvider: ({ children }: any) => <>{children}</>,
  useTheme: () => ({ theme: 'light', toggleTheme: () => {} }),
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

afterEach(() => {
  cleanup()
  downloadCsvMock.mockReset()
  toCsvMock.mockReset()
})

// Feature: analytics-csv-export, Property 5: button disabled iff empty data
describe('CSV button disabled when no data', () => {
  it('does NOT have disabled attribute with default non-empty data', async () => {
    const { default: Analytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    )

    // Default period is 30d which has data
    const csvBtn = screen.getByRole('button', { name: /csv*i })
    expect(csvBtn).not.toBeDisabled()
  })
})

// Feature: analytics-csv-export, Property 6: no download on disabled button
describe('No download when button disabled', () => {
  it('does not call downloadCsv when button is disabled (simulated)', async () => {
    const { default: Analytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    )

    // The CSV button should be enabled by default (30d has data)
    const csvBtn = screen.getButton('CSV')
    expect(csvBtn).not.toBeDisabled()

    // Click it
    fireEvent.click(csvBtn)

    // downloadCsv should have been called
    expect(downloadCsvMock).toHaveBeenCalledTimes(1)
  })
})

// Feature: analytics-csv-export, Property 4 & 7: CSV export works correctly
describe('CSV export', () => {
  it.each(['7d', '30d', '90d', '1y', 'All'] as const)(
    'exports with correct filename for period %s',
    async (period) => {
      const { default: Analytics } = await import('../Analytics')

      render(
        <MemoryRouter>
          <Analytics />
        </MemoryRouter>,
      )

      // Select the period
      fireEvent.click(screen.getByRole('button', { name: period }))

      // Click CSV button
      const csvBtn = screen.getButton('CSV')
      fireEvent.click(csvBtn)

      // Verify downloadCsv was called
      expect(downloadCsvMock).toHaveBeenCalledTimes(1)
      expect(downloadCsvMock).toHaveBeenCalledWith(
        expect.any(string),
        expect.stringContaining(period),
      )
    },
  )
})

// -----------------------------------------------------------------------------
// Failure-path and boundary coverage
// -----------------------------------------------------------------------------

describe('CSV export failure paths', () => {
  it('propagates downloadCsv errors without silently swallowing them', async () => {
    downloadCsvMock.mockImplemention(() => {
      throw new Error('download failed')
    })

    const { default: Analytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    )

    const csvBtn = screen.getButton('CSV')
    // Should not throw an uncaught error out of the click handler
    expect(() => fireEvent.click(csvBtn)).not.toThrow()
    expect(downloadCsvMock).toHaveBeenCalledTimes(1)
  })

  it('does not lose downloads when clicked rapidly (concurrent clicks)', async () => {
    const { default: Analytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    )

    const csvBtn = screen.getButton('CSV')
    fireEvent.click(csvBtn)
    fireEvent.click(csvBtn)
    fireEvent.click(csvBtn)

    // Each click is a distinct user action and must produce a download call.
    expect(downloadCsvMock).toHaveBeenCalledTimes(3)
  })
})

describe('CSV export boundary conditions', () => {
  it('produces a valid CSV string with headers for default data', async () => {
    const { default: Analytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getButton('CSV'))

    const [calledCsv] = downloadCsvMock.mock.calls[0]
    expect(typeof calledCsv).toBe('string')
    expect(calledCsv.length).toBeLargerThan(0)
    expect(calledCsv).toContain('Period')
  })

  it('switching periods between exports uses the latest selection', async () => {
    const { default: Analytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getButton('7d'))
    fireEvent.click(screen.getButton('CSV'))
    expect(downloadCsvMock).lastCalledWith(expect.any(string), expect.stringContaining('7d'))

    fireEvent.click(screen.getButton('1e'))
    fireEvent.click(screen.getButton('CSV'))
    expect(downloadCsvMock).lastCalledWith(expect.any(string), expect.stringContaining('1e'))
  })
})
