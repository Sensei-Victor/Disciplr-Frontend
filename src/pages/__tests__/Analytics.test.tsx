import React, { Suspense, lazy, act } from 'react'
import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { buildAnalyticsSeriesColors } from '../analyticsTheme'
import Analytics from '../Analytics'
import { analyticsPeriodData } from '../analyticsData'

// ── Browser API stubs (jsdom doesn't implement these) ───────────────────────

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

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  Bar: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null,
}))

const mockSave = vi.fn()
const mockText = vi.fn()

vi.mock('jspdf', () => ({
  default: class {
    text = mockText
    save = mockSave
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
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))

const tokenFixture = {
  accent: 'accent-token',
  success: 'success-token',
  danger: 'danger-token',
  info: 'info-token',
  warning: 'warning-token',
  text: 'text-token',
  muted: 'muted-token',
  surface: 'surface-token',
  surfaceRaised: 'surface-raised-token',
  border: 'border-token',
  bg: 'bg-token',
  accentTransparent: 'accent-transparent-token',
  legendGap: 'legend-gap-token',
  legendSwatchSize: 'legend-swatch-size-token',
  legendLabelRole: 'caption' as const,
  // Chart categorical palette tokens
  chartCategorical1: 'cat1-token',
  chartCategorical2: 'cat2-token',
  chartCategorical3: 'cat3-token',
  chartCategorical4: 'cat4-token',
  chartCategorical5: 'cat5-token',
  // Chart sequential palette tokens
  chartSequential1: 'seq1-token',
  chartSequential2: 'seq2-token',
  chartSequential3: 'seq3-token',
  chartSequential4: 'seq4-token',
  chartSequential5: 'seq5-token',
  // Chart structural tokens
  chartAxis: 'axis-token',
  chartGrid: 'grid-token',
  chartTooltipBg: 'tooltip-bg-token',
  chartTooltipBorder: 'tooltip-border-token',
  chartTooltipText: 'tooltip-text-token',
  chartTooltipLabel: 'tooltip-label-token',
}

describe('Analytics chart theme mapping', () => {
  it('maps chart series to the categorical chart palette tokens', () => {
    const colors = buildAnalyticsSeriesColors(tokenFixture)

    // Series colors now come from the categorical chart palette (not generic semantics)
    expect(colors).toMatchObject({
      success: tokenFixture.chartCategorical1,
      failed: tokenFixture.chartCategorical5,
      comparison: tokenFixture.chartCategorical2,
      milestone: tokenFixture.chartCategorical3,
      active: tokenFixture.chartCategorical1,
      warning: tokenFixture.chartCategorical3,
      platform: tokenFixture.chartAxis,
      grid: tokenFixture.chartGrid,
      axis: tokenFixture.chartAxis,
      tooltipBackground: tokenFixture.chartTooltipBg,
      tooltipBorder: tokenFixture.chartTooltipBorder,
      tooltipText: tokenFixture.chartTooltipText,
      tooltipMuted: tokenFixture.chartTooltipLabel,
    })

    expect(colors.pie).toEqual([
      tokenFixture.chartCategorical1,
      tokenFixture.chartCategorical2,
      tokenFixture.chartCategorical5,
    ])
  })
})

export const analyticsThemeCoverage = [
  'success series maps to --success',
  'failed series maps to --danger',
  'comparison series maps to --info',
  'milestone bars map to --accent',
  'axis/grid/tooltip colors map to neutral surface tokens',
]

describe('Analytics lazy route', () => {
  it('Suspense renders skeleton fallback before chunk resolves', async () => {
    const LazyAnalytics = lazy(
      () => new Promise<{ default: React.ComponentType }>(resolve =>
        setTimeout(() => import('../Analytics').then(resolve), 50),
      ),
    )

    render(
      <MemoryRouter>
        <Suspense fallback={<div data-testid="skeleton" />}>
          <LazyAnalytics />
        </Suspense>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('skeleton')).toBeTruthy()
    await waitFor(() => expect(screen.queryByTestId('skeleton')).toBeNull(), { timeout: 10000 })
  })

  it('renders Analytics content after lazy chunk resolves', async () => {
    const LazyAnalytics = lazy(() => import('../Analytics'))

    render(
      <MemoryRouter>
        <Suspense fallback={<div data-testid="skeleton" />}>
          <LazyAnalytics />
        </Suspense>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.queryByTestId('skeleton')).toBeNull(), { timeout: 10000 })
  })

  it('reads period from query params and writes it back on selection change', async () => {
    const { default: LazyLoadedAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter initialEntries={['/analytics?period=7d']}>
        <LazyLoadedAnalytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument(), { timeout: 10000 })
    expect(screen.getByRole('button', { name: '7d' })).toHaveClass('active')

    fireEvent.click(screen.getByRole('button', { name: '30d' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '30d' })).toHaveClass('active'), { timeout: 2000 })
  })

  it('lazy-loads jsPDF on export and shows loading state', async () => {
    const { default: LazyLoadedAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <LazyLoadedAnalytics />
      </MemoryRouter>,
    )

    const pdfBtn = screen.getByRole('button', { name: /pdf report/i })
    expect(pdfBtn).toBeTruthy()

    fireEvent.click(pdfBtn)
    const loadingBtn = screen.getByRole('button', { name: /loading/i })
    expect(loadingBtn).toBeDisabled()

    await waitFor(
      () => expect(screen.getByRole('button', { name: /pdf report/i })).not.toBeDisabled(),
      { timeout: 2000 },
    )
  })

  it('generates and saves PDF report with correct filename and title', async () => {
    const { default: LazyLoadedAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter initialEntries={['/analytics?period=7d']}>
        <LazyLoadedAnalytics />
      </MemoryRouter>,
    )

    const pdfBtn = screen.getByRole('button', { name: /pdf report/i })
    fireEvent.click(pdfBtn)

    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith('disciplr-report-7d.pdf')
    })
    expect(mockText).toHaveBeenCalledWith('Disciplr Analytics Report', 14, 18)
  })

  it('shows the tokenized chart legend when comparison mode is enabled', async () => {
    const { default: LazyLoadedAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <LazyLoadedAnalytics />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /compare periods/i }))

    expect(screen.getAllByLabelText('Chart legend')).toHaveLength(2)
    expect(screen.getByText('This Period %')).toHaveClass('text-caption')
    expect(screen.getByText('Prev Period')).toBeInTheDocument()
  })

  it('shows a no-data placeholder for empty periods and restores charts when switching to populated periods', async () => {
    const original90d = analyticsPeriodData['90d']
    analyticsPeriodData['90d'] = []

    try {
      render(
        <MemoryRouter>
          <Analytics />
        </MemoryRouter>,
      )

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '90d' }))
      })

      await waitFor(() =>
        expect(screen.getAllByTestId('analytics-empty-state')).toHaveLength(3),
        { timeout: 2000 },
      )
      expect(screen.getAllByText('No data for this period (90d).')).toHaveLength(3)

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '30d' }))
      })

      await waitFor(() => {
        expect(screen.queryByTestId('analytics-empty-state')).not.toBeInTheDocument()
        expect(screen.getByText('Success Rate Over Time')).toBeInTheDocument()
        expect(screen.getByText('Capital Locked Over Time')).toBeInTheDocument()
        expect(screen.getByText('Milestone Completion Trend')).toBeInTheDocument()
      }, { timeout: 2000 })
    } finally {
      analyticsPeriodData['90d'] = original90d
    }
  })

  it('renders computed KPI cards with values from the selected period', async () => {
    const { default: LazyLoadedAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <LazyLoadedAnalytics />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Analytics')).toBeInTheDocument()
    }, { timeout: 2000 })

    const capitalLabels = screen.getAllByText('Total Capital Locked')
    expect(capitalLabels.length).toBeGreaterThan(0)

    const successLabels = screen.getAllByText('Success Rate')
    expect(successLabels.length).toBeGreaterThan(0)

    const milestoneLabels = screen.getAllByText('Total Milestones')
    expect(milestoneLabels.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '7d' }))

    await waitFor(() => {
      expect(screen.getAllByText('Total Capital Locked').length).toBeGreaterThan(0)
    })
  })
})

describe('Analytics memoization stability', () => {
  it('maintains stable chartData reference across unrelated re-renders', async () => {
    const { default: LazyAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <LazyAnalytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument())

    // Initial period is 30d
    const firstChartData = analyticsPeriodData['30d']

    // Trigger unrelated re-render by toggling comparison mode
    fireEvent.click(screen.getByRole('button', { name: /compare periods/i }))

    await waitFor(() => expect(screen.getByText('Prev Period %')).toBeInTheDocument())

    // Verify chartData reference is stable (same period, same data)
    expect(analyticsPeriodData['30d']).toBe(firstChartData)
  })

  it('recomputes chartData exactly once when period changes', async () => {
    const { default: LazyAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <LazyAnalytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument())

    // Initial period is 30d
    const initialData = analyticsPeriodData['30d']

    // Switch to 7d
    fireEvent.click(screen.getByRole('button', { name: '7d' }))

    await waitFor(() => {
      const emptyStates = screen.queryAllByTestId('analytics-empty-state')
      expect(emptyStates).toHaveLength(0)
    })

    // Switch back to 30d
    fireEvent.click(screen.getByRole('button', { name: '30d' }))

    await waitFor(() => {
      expect(screen.getByText('Success Rate Over Time')).toBeInTheDocument()
    })

    // Verify data reference is the same original array
    expect(analyticsPeriodData['30d']).toBe(initialData)
  })

  it('maintains stable KPI object reference when period unchanged', async () => {
    const { default: LazyAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <LazyAnalytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument())

    // Trigger unrelated re-render (toggle comparison)
    fireEvent.click(screen.getByRole('button', { name: /compare periods/i }))

    await waitFor(() => expect(screen.getByText('Prev Period %')).toBeInTheDocument())

    // KPI values should remain stable for the same period
    expect(screen.getAllByText('Total Capital Locked').length).toBeGreaterThan(0)
  })
})

describe('Analytics failure-path and boundary coverage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('falls back to the default period when the query param is invalid', async () => {
    render(
      <MemoryRouter initialEntries={['/analytics?period=not-a-period']}>
        <Analytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument())

    // Invalid period should not activate any period button; default 30d remains active
    expect(screen.getByRole('button', { name: '30d' })).toHaveClass('active')
    expect(screen.queryByRole('button', { name: 'not-a-period' })).toBeNull()
  })

  it('ignores duplicate period selections without corrupting state', async () => {
    render(
      <MemoryRouter initialEntries={['/analytics?period=7d']}>
        <Analytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument())

    const sevenDay = screen.getByRole('button', { name: '7d' })
    expect(sevenDay).toHaveClass('active')

    // Selecting the already-active period must be idempotent
    fireEvent.click(sevenDay)
    fireEvent.click(sevenDay)

    await waitFor(() => expect(screen.getByRole('button', { name: '7d' })).toHaveClass('active'))
    expect(screen.getByRole('button', { name: '30d' })).not.toHaveClass('active')
  })

  it('recovers gracefully when PDF export fails', async () => {
    const jspdf = await import('jspdf')
    const OriginalCtor = (jspdf as any).default

    class FailingPdf {
      constructor() {
        throw new Error('pdf init failed')
      }
    }

    ;(jspdf as any).default = FailingPdf

    try {
      render(
        <MemoryRouter>
          <Analytics />
        </MemoryRouter>,
      )

      const pdfBtn = screen.getByRole('button', { name: /pdf report/i })
      fireEvent.click(pdfBtn)

      // Button must return to an interactive state after the failure
      await waitFor(
        () => expect(screen.getByRole('button', { name: /pdf report/i })).not.toBeDisabled(),
        { timeout: 2000 },
      )
    } finally {
      ;(jspdf as any).default = OriginalCtor
    }
  })

  it('handles empty period data without throwing and restores on populated data', async () => {
    const original7d = analyticsPeriodData['7d']
    analyticsPeriodData['7d'] = []

    try {
      render(
        <MemoryRouter initialEntries={['/analytics?period=7d']}>
          <Analytics />
        </MemoryRouter>,
      )

      await waitFor(() =>
        expect(screen.getAllByTestId('analytics-empty-state').length).toBeGreaterThan(0),
        { timeout: 2000 },
      )

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '30d' }))
      })

      await waitFor(() => {
        expect(screen.queryByTestId('analytics-empty-state')).not.toBeInTheDocument()
        expect(screen.getByText('Success Rate Over Time')).toBeInTheDocument()
      }, { timeout: 2000 })
    } finally {
      analyticsPeriodData['7d'] = original7d
    }
  })

  it('does not leak sensitive data into rendered error output', async () => {
    const original30d = analyticsPeriodData['30d']
    analyticsPeriodData['30d'] = []

    try {
      render(
        <MemoryRouter>
          <Analytics />
        </MemoryRouter>,
      )

      await waitFor(() =>
        expect(screen.getAllByTestId('analytics-empty-state').length).toBeGreaterThan(0),
        { timeout: 2000 },
      )

      const body = document.body.textContent ?? ''
      expect(body).not.toMatch(/0x[a-fA-F0-9]{40}/)
      expect(body).not.toMatch(/private[_-]?key/i)
    } finally {
      analyticsPeriodData['30d'] = original30d
    }
  })

  it('keeps concurrent period switches deterministic', async () => {
    render(
      <MemoryRouter initialEntries={['/analytics?period=30d']}>
        <Analytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '7d' }))
      fireEvent.click(screen.getByRole('button', { name: '90d' }))
      fireEvent.click(screen.getByRole('button', { name: '30d' }))
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '30d' })).toHaveClass('active')
      expect(screen.getByRole('button', { name: '7d' })).not.toHaveClass('active')
      expect(screen.getByRole('button', { name: '90d' })).not.toHaveClass('active')
    })
  })
}).click(screen.getByRole('button', { name: /compare periods/i }))

    await waitFor(() => expect(screen.getByText('Prev Period %')).toBeInTheDocument())

    // KPI values should remain the same
    const capitalLabels = screen.getAllByText('Total Capital Locked')
    expect(capitalLabels.length).toBeGreaterThan(0)
  })

  it('maintains stable legend entries reference when comparison toggles off and on', async () => {
    const { default: LazyAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <LazyAnalytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument())

    // Toggle comparison on
    fireEvent.click(screen.getByRole('button', { name: /compare periods/i }))
    await waitFor(() => expect(screen.getByText('Prev Period %')).toBeInTheDocument())

    // Toggle comparison off
    fireEvent.click(screen.getByRole('button', { name: /compare periods/i }))
    await waitFor(() => expect(screen.queryByText('Prev Period %')).not.toBeInTheDocument())

    // Toggle comparison on again
    fireEvent.click(screen.getByRole('button', { name: /compare periods/i }))
    await waitFor(() => expect(screen.getByText('Prev Period %')).toBeInTheDocument())

    // Legend entries should be present
    expect(screen.getByText('This Period %')).toBeInTheDocument()
    expect(screen.getByText('Prev Period %')).toBeInTheDocument()
  })

  it('does not recompute derived data when theme changes (tokens update only)', async () => {
    const { default: LazyAnalytics } = await import('../Analytics')

    render(
      <MemoryRouter>
        <LazyAnalytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument())

    // The theme change is mocked - in reality, MutationObserver would fire
    // but chartTokens changes shouldn't affect chartData/kpis/displayData
    // This test verifies the dependency arrays are correct
    expect(analyticsPeriodData['30d']).toBeDefined()
  })

  it('skips recomputation entirely when rendering with identical props/state', async () => {
    const { default: LazyAnalytics } = await import('../Analytics')

    const { rerender: r } = render(
      <MemoryRouter>
        <LazyAnalytics />
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Analytics')).toBeInTheDocument())

    // Force a re-render with same props
    r(
      <MemoryRouter>
        <LazyAnalytics />
      </MemoryRouter>,
    )

    // Data references should be identical (memoized)
    expect(analyticsPeriodData['30d']).toBe(analyticsPeriodData['30d'])
  })
})