import { useState, useMemo, useCallback, useEffect, useRef, Suspense, lazy } from 'react'
import { useSearchParams } from 'react-router-dom' // Ensure search params are available
import { useTheme } from '../context/ThemeContext'
import { usePrefersReducedMotion } from '../utils/usePrefersReducedMotion'
import { computeAnalyticsKpis, formatCurrency, formatPercentage, type AnalyticsDataPoint } from '../utils/analyticsKpis'
import { type Period, parsePeriod, serializePeriod } from '../utils/periodParam'
import { logger } from '../utils/logger'
import Skeleton from '../components/Skeleton'
import type { jsPDF } from 'jspdf'
const AnalyticsCharts = lazy(() => import('./AnalyticsCharts'))

type JsPDFInstance = InstanceType<typeof import('jspdf').default>

import {
  Target, CheckCircle, Award, ArrowUpRight, ArrowDownRight, Clock, DollarSign,
  Flame, TrendingUp, AlertTriangle, Download, Flag, BarChart2, Crown, Users, Lock,
} from 'lucide-react'

import { getAnalyticsChartTokens, buildAnalyticsSeriesColors } from './analyticsTheme'
import type { ChartLegendEntry } from '../components/ChartLegend'
import { toCsv, downloadCsv } from '../utils/csv'
import { analyticsPeriodData, prevPeriodData, vaultStatusData, milestoneTypes, computeBenchmarkData, TEAM_CHART_DATA } from './analyticsData'
import { parseGoalInput, safePercent, validateDateRange, filterMonthlySeries, alignPreviousByName } from './analyticsValidation'

const PERIODS: Period[] = ['7d', '30d', '90d', '1y', 'All']

// ─── Boundary / failure-path helpers ────────────────────────────────────────
// These pure helpers centralize the invariants that guard the Analytics page
// against invalid, duplicate, and boundary-case inputs. They are exported so
// focused tests can exercise them without rendering the full component.

/** Parse a user-entered numeric goal, returning a safe fallback on invalid input. */
export function parseGoalInput(raw: string, fallback: number, opts: { min?: number; max?: number } = {}): number {
  const { min = 0, max = Number.POSITIVE_INFINITY } = opts
  if (typeof raw !== 'string' || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  if (n < min) return min
  if (n > max) return max
  return n
}

/** Validate a custom date range. Returns null when the range is not usable. */
export function validateCustomRange(from: string, to: string): { from: Date; to: Date } | null {
  if (!from || !to) return null
  const f = new Date(from)
  const t = new Date(to)
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return null
  if (f > t) return null
  return { from: f, to: t }
}

/** Deduplicate a series by `name`, keeping the last occurrence (latest wins). */
export function dedupeByName<T extends { name: string }>(rows: T[]): T[] {
  const seen = new Map<string, T>()
  for (const row of rows) seen.set(row.name, row)
  return Array.from(seen.values())
}

function useAnalyticsChartTokens() {
  const { theme } = useTheme()
  const [tokens, setTokens] = useState(() => getAnalyticsChartTokens())

  useEffect(() => {
    const root = document.documentElement
    const syncTokens = () => setTokens(getAnalyticsChartTokens(root))
    syncTokens()

    const observer = new MutationObserver(syncTokens)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    return () => observer.disconnect()
  }, [theme])

  return tokens
}

// Locked (enterprise-gated) previews are decorative only: hidden from assistive
// technology and made inert so nothing inside can be focused or activated.
// React 18 has no typed `inert` prop, so it is applied via the ref.
function markInert(el: HTMLDivElement | null) {
  el?.setAttribute('inert', '')
}

function Card({ children, style = {}, locked = false }: { children: React.ReactNode; style?: React.CSSProperties; locked?: boolean }) {
  return (
    <div
      aria-hidden={locked || undefined}
      ref={locked ? markInert : undefined}
      data-locked={locked || undefined}
      style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '1.5rem',
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1.25rem 0', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </h2>
  )
}

function ChartTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1.25rem 0' }}>
      {children}
    </h3>
  )
}

function ChartSummary({ children }: { children: React.ReactNode }) {
  return <p className="sr-only">{children}</p>
}

export default function Analytics() {
  const chartTokens = useAnalyticsChartTokens()
  const seriesColors = useMemo(() => buildAnalyticsSeriesColors(chartTokens), [chartTokens])
  const prefersReducedMotion = usePrefersReducedMotion()
  const [searchParams, setSearchParams] = useSearchParams()
  const [period, setPeriodInternal] = useState<Period>(() => parsePeriod(searchParams.get('period')))
  const [showComparison, setShowComparison] = useState(false)
  const [showMovingAverage, setShowMovingAverage] = useState(false)
  const MA_WINDOW = 3
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [goalRate, setGoalRate] = useState('90')
  const [goalCapital, setGoalCapital] = useState('5000')
  const [isLoading] = useState(false)
  const jsPDFRef = useRef<typeof jsPDF | null>(null)
  const [isExportLoading, setIsExportLoading] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const pdfExportInFlight = useRef(false)

  const setPeriod = useCallback((p: Period) => {
    setPeriodInternal(p)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('period', serializePeriod(p))
    setSearchParams(nextParams)
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const queryPeriod = parsePeriod(searchParams.get('period'))
    if (queryPeriod !== period) {
      setPeriodInternal(queryPeriod)
    }
  }, [period, searchParams])

  // ─── Custom date range filtering ─────────────────────────────────────────
  // Invariant: the custom range only drives the data when both inputs parse as
  // local dates and start <= end. Any other state (empty, half-filled,
  // malformed, reversed) falls back to the selected preset period, and
  // malformed/reversed input surfaces `dateRangeError` instead of failing silently.
  // The preset period buttons are visually deactivated while a custom range is active.
  const customRangeActive = useMemo(() => {
    return validateCustomRange(customFrom, customTo) !== null
  }, [customFrom, customTo])

  // Month abbreviation → 0-based month index used to compare against date inputs
  const MONTH_INDEX: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  }

  // ─── Memoized data selections ──────────────────────────────────────────────
  // A custom range filters the '1y' monthly series to the months whose first
  // day falls inside the range (inclusive).
  const chartData = useMemo(() => {
    if (customRangeActive) {
      const range = validateCustomRange(customFrom, customTo)
      if (!range) return []
      const { from, to } = range
      // Use the '1y' monthly series as the basis for custom filtering.
      // A data point is included when its month (in the year inferred from the
      // date inputs) falls between the from and to dates (inclusive).
      return analyticsPeriodData['1y'].filter((d) => {
        const monthIdx = MONTH_INDEX[d.name]
        if (monthIdx === undefined) return true // non-month names (e.g. 'Wk1') pass through
        // Build a Date for the 1st of that month, using the year from customFrom
        const pointDate = new Date(from.getFullYear(), monthIdx, 1)
        // If the range spans into the next year (e.g. Nov → Feb) also check next year
        const pointDateNextYear = new Date(from.getFullYear() + 1, monthIdx, 1)
        return (pointDate >= from && pointDate <= to) ||
          (pointDateNextYear >= from && pointDateNextYear <= to)
      })
    }
    return dedupeByName(analyticsPeriodData[period])
  }, [customRangeActive, customFrom, customTo, period])

  // Invariant: row i of prevChartData describes the same bucket as row i of
  // chartData. Presets are paired with their own previous period; a custom
  // range is compared month-for-month against the previous year, never against
  // the unrelated previous series of whichever preset is hidden behind it.
  const prevChartData = useMemo(
    () => (dateRange.status === 'valid'
      ? alignPreviousByName(chartData, prevPeriodData['1y'])
      : prevPeriodData[period]),
    [dateRange, chartData, period]
  )

  const comparisonData = useMemo(
    () => dedupeByName(chartData).map((d, i) => ({
      ...d,
      prevSuccess: prevChartData[i]?.success ?? 0,
      prevCapital: prevChartData[i]?.capital ?? 0,
    })),
    [chartData, prevChartData]
  )

  const displayData = useMemo(
    () => (showComparison ? comparisonData : chartData),
    [showComparison, comparisonData, chartData]
  )

  // ─── Memoized KPI computation ──────────────────────────────────────────────
  const kpis = useMemo(
    () => computeAnalyticsKpis(chartData as AnalyticsDataPoint[], prevChartData as AnalyticsDataPoint[]),
    [chartData, prevChartData]
  )

  const benchmarkData = useMemo(() => computeBenchmarkData(kpis), [kpis])

  // ─── Goal validation ───────────────────────────────────────────────────────
  // Invariant: goal progress is only evaluated against a finite, in-range goal.
  // Empty/invalid input shows a message and no marker — never "Goal achieved",
  // "NaN% to go" or a marker outside the bar.
  const rateGoal = useMemo(() => parseGoalInput(goalRate, RATE_GOAL_BOUNDS), [goalRate])
  const capitalGoal = useMemo(() => parseGoalInput(goalCapital, CAPITAL_GOAL_BOUNDS), [goalCapital])
  const rateGoalMet = rateGoal.value !== null && kpis.averageSuccessRate >= rateGoal.value
  const capitalGoalMet = capitalGoal.value !== null && kpis.totalCapital >= capitalGoal.value
  const capitalScale = capitalGoal.value !== null ? Math.max(capitalGoal.value, kpis.totalCapital) : kpis.totalCapital

  const bestPeriod = useMemo(() => {
  if (!chartData.length) return null;

  return chartData.reduce((best, current) =>
    current.success > best.success ? current : best
  );
}, [chartData]);

const currentStreak = useMemo(() => {
  let streak = 0;

  for (let i = chartData.length - 1; i >= 0; i--) {
    if (chartData[i].success >= 80) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}, [chartData]);

  const chartAnimationEnabled = !prefersReducedMotion

  const tooltipStyle = useMemo(() => ({
    contentStyle: {
      background: seriesColors.tooltipBackground,
      border: `1px solid ${seriesColors.tooltipBorder}`,
      borderRadius: '10px',
      color: seriesColors.tooltipText,
      fontSize: '0.85rem',
    },
    itemStyle: { color: seriesColors.tooltipText },
    labelStyle: { color: seriesColors.tooltipMuted },
  }), [seriesColors])

  const successLegendEntries = useMemo<ChartLegendEntry[]>(() => showComparison
    ? [
        { label: 'This Period %', colorKey: 'success', id: 'success' },
        { label: 'Failed %', colorKey: 'failed', id: 'failed' },
        { label: 'Prev Period %', colorKey: 'comparison', id: 'comparison' },
      ]
    : [
        { label: 'This Period %', colorKey: 'success', id: 'success' },
        { label: 'Failed %', colorKey: 'failed', id: 'failed' },
      ], [showComparison])

  const capitalLegendEntries = useMemo<ChartLegendEntry[]>(() => showComparison
    ? [
        { label: 'USDC Locked', colorKey: 'success', id: 'capital' },
        { label: 'Prev Period', colorKey: 'comparison', id: 'prev-capital' },
      ]
    : [
        { label: 'USDC Locked', colorKey: 'success', id: 'capital' },
      ], [showComparison])

  // ─── Stable callback for period buttons ───────────────────────────────────
  const handlePeriodClick = useCallback((p: Period) => {
    setPeriod(p)
  }, [setPeriod])

  // ─── Stable callbacks for AnalyticsCharts ────────────────────
  const analyticsChartProps = useMemo(() => ({
    displayData,
    chartData,
    period,
    vaultStatusData,
    teamChartData: TEAM_CHART_DATA,
    showComparison,
    chartAnimationEnabled,
    tooltipStyle,
    seriesColors,
    chartTokens,
    successLegendEntries,
    capitalLegendEntries,
    isLoading,
  }), [
    displayData,
    chartData,
    period,
    showComparison,
    chartAnimationEnabled,
    tooltipStyle,
    seriesColors,
    chartTokens,
    successLegendEntries,
    capitalLegendEntries,
    isLoading,
  ])

  // ─── Export handlers ───────────────────────────────────────────────────────
  const handleCsvExport = useCallback(() => {
    if (chartData.length === 0) return
    const filename = customRangeActive
      ? `disciplr-analytics-${customFrom}-to-${customTo}.csv`
      : `disciplr-analytics-${period}.csv`
    downloadCsv(toCsv(chartData, 'analytics'), filename)
  }, [chartData, period, customRangeActive, customFrom, customTo])

  const handlePdfExport = useCallback(async () => {
    // Guard against concurrent invocations: a second click while a PDF is
    // already being generated must be a no-op to avoid duplicate downloads
    // and interleaved state updates.
    if (pdfExportInFlight.current) return
    pdfExportInFlight.current = true
    setExportError(null)
    setIsExportLoading(true)
    try {
      if (!jsPDFRef.current) {
        const mod = await import('jspdf')
        jsPDFRef.current = mod?.default ?? mod
      }

      if (!jsPDFRef.current) {
        throw new Error('jsPDF module did not expose a constructor')
      }

      const jsPDF = jsPDFRef.current
      const doc: JsPDFInstance = new jsPDF()
      const accent = [0, 195, 137] as const

      // Header bar
      doc.setFillColor(...accent)
      doc.rect(0, 0, 210, 28, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('Disciplr Analytics Report', 14, 18)

      // Period & date
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(`Period: ${customRangeActive ? `${customFrom} → ${customTo}` : period}   •   Generated: ${new Date().toLocaleDateString()}`, 14, 24)

      // Key metrics section
      doc.setTextColor(30, 45, 66)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Key Metrics', 14, 42)

      const metrics: [string, string][] = [
        ['Total Capital Locked', `${formatCurrency(kpis.totalCapital)} USDC`],
        ['Success Rate', formatPercentage(kpis.averageSuccessRate)],
        ['Total Milestones', `${kpis.totalMilestones}`],
        ['Period', customRangeActive ? `${customFrom} → ${customTo}` : period],
        ['vs Previous Period (Capital)', kpis.capitalDelta !== 0 ? `${kpis.capitalDelta > 0 ? '+' : ''}${formatCurrency(kpis.capitalDelta)}` : 'No prior data'],
        ['vs Previous Period (Success)', kpis.successDelta !== 0 ? `${kpis.successDelta > 0 ? '+' : ''}${formatPercentage(kpis.successDelta, 1)}` : 'No prior data'],
      ]

      doc.setFontSize(10)
      metrics.forEach(([label, value], i) => {
        const col = i % 2 === 0 ? 14 : 110
        const row = 52 + Math.floor(i / 2) * 14
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 110, 130)
        doc.text(label, col, row)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(20, 20, 30)
        doc.text(value, col, row + 6)
      })

      // Divider
      doc.setDrawColor(...accent)
      doc.setLineWidth(0.5)
      doc.line(14, 94, 196, 94)

      // Performance data table
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(30, 45, 66)
      doc.text('Performance Data', 14, 106)

      // Table header
      doc.setFillColor(240, 250, 247)
      doc.rect(14, 112, 182, 9, 'F')
      doc.setFontSize(9)
      doc.setTextColor(0, 195, 137)
      doc.text('PERIOD', 17, 118)
      doc.text('SUCCESS %', 60, 118)
      doc.text('FAILED %', 100, 118)
      doc.text('CAPITAL (USDC)', 135, 118)
      doc.text('MILESTONES', 175, 118)

      // Table rows
      chartData.forEach((row, i) => {
        const y = 128 + i * 10
        if (i % 2 === 0) {
          doc.setFillColor(249, 252, 251)
          doc.rect(14, y - 5, 182, 10, 'F')
        }
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(30, 45, 66)
        doc.text(row.name, 17, y)
        doc.setTextColor(0, 155, 110)
        doc.text(`${row.success}%`, 60, y)
        doc.setTextColor(200, 60, 55)
        doc.text(`${row.failed}%`, 100, y)
        doc.setTextColor(30, 45, 66)
        doc.text(`$${row.capital.toLocaleString()}`, 135, y)
        doc.text(`${row.milestones}`, 175, y)
      })

      // Capital flow
      const tableEnd = 128 + chartData.length * 10 + 10
      doc.setDrawColor(...accent)
      doc.line(14, tableEnd, 196, tableEnd)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(30, 45, 66)
      doc.text('Capital Flow Summary', 14, tableEnd + 12)

      const flow: [string, string, readonly [number, number, number]][] = [
        ['Released to Success Destinations', '$8,750 USDC', [0, 155, 110] as const],
        ['Redirected on Failure', '$2,400 USDC', [200, 60, 55] as const],
        ['Platform Fee (1%)', '$124 USDC', [100, 110, 130] as const],
      ]

      flow.forEach(([label, value, color], i) => {
        const y = tableEnd + 24 + i * 12
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(100, 110, 130)
        doc.text(label, 17, y)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...color)
        doc.text(value, 150, y)
      })

      // Footer
      doc.setFillColor(245, 248, 250)
      doc.rect(0, 278, 210, 20, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(150, 160, 175)
      doc.text('Generated by Disciplr — Accountability on Stellar', 14, 288)
      doc.text(`Page 1 of 1`, 185, 288)

      doc.save(`disciplr-report-${customRangeActive ? `${customFrom}-to-${customTo}` : period}.pdf`)
    } catch (err) {
      logger.error('Failed to load or run jsPDF', err)
      setExportError('Failed to generate PDF. Please try again.')
    } finally {
      pdfExportInFlight.current = false
      setIsExportLoading(false)
    }
  }, [chartData, kpis, period, customRangeActive, customFrom, customTo])

  return (
    <>
      <style>{`
        @keyframes disciplr-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.65; }
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
        .period-btn {
          padding: 0.45rem 1.1rem;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--muted);
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.15s;
        }
        .period-btn:hover { border-color: var(--accent); color: var(--accent); }
        .period-btn.active {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--bg);
          font-weight: 700;
        }
        .toggle-btn {
          padding: 0.45rem 1rem;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--muted);
          cursor: pointer;
          font-size: 0.82rem;
          transition: all 0.15s;
        }
        .toggle-btn.active {
          border-color: var(--info);
          color: var(--info);
          background: var(--accent-transparent);
        }
        .action-btn {
          padding: 0.45rem 1rem;
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          cursor: pointer;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          transition: all 0.15s;
        }
        .action-btn:hover { border-color: var(--accent); color: var(--accent); }
        .action-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        input[type="date"] {
          background: var(--surface);
          color: var(--text);
          border: 1px solid var(--border);
          padding: 0.4rem 0.75rem;
          border-radius: var(--radius);
          font-size: 0.85rem;
          outline: none;
          cursor: pointer;
        }
        input[type="number"] {
          background: var(--surface);
          color: var(--text);
          border: 1px solid var(--border);
          padding: 0.4rem 0.75rem;
          border-radius: var(--radius);
          font-size: 0.9rem;
          outline: none;
          width: 100%;
        }
        input[type="number"]:focus { border-color: var(--accent); }
        @media (max-width: 640px) {
          .chart-grid { grid-template-columns: 1fr !important; }
          .metrics-grid { grid-template-columns: 1fr 1fr !important; }
          .insights-grid { grid-template-columns: 1fr 1fr !important; }
          .flow-grid { grid-template-columns: 1fr !important; }
          .bench-grid { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .disciplr-progress-bar,
          .period-btn,
          .toggle-btn,
          .action-btn {
            transition: none !important;
            animation: none !important;
          }
          [style*="disciplr-pulse"] {
            animation: none !important;
          }
        }
      `}</style>

      <div style={{ padding: '0.25rem 0 2rem' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.9rem', margin: '0 0 0.35rem 0' }}>Analytics</h1>
          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.9rem' }}>
            Track your vault performance and accountability patterns.
          </p>
        </div>

        {/* ── Controls Bar ── */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          marginBottom: '2rem',
          padding: '1rem 1.25rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
        }}>
          {/* Period Toggle Buttons */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {PERIODS.map(p => (
              <button
                key={p}
                className={`period-btn${period === p && !customRangeActive ? ' active' : ''}`}
                onClick={() => {
                  handlePeriodClick(p)
                  // Clicking a preset clears the custom range
                  setCustomFrom('')
                  setCustomTo('')
                }}
                style={customRangeActive ? { opacity: 0.45 } : undefined}
                aria-pressed={period === p && !customRangeActive}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 0.25rem' }} />

          {/* Custom Date Range */}
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: customRangeActive ? 'var(--accent)' : 'var(--muted)', fontSize: '0.8rem', fontWeight: customRangeActive ? 600 : 400 }}>
              Custom:
            </span>
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              aria-label="Custom range start date"
              aria-invalid={dateRangeError ? true : undefined}
              aria-describedby={dateRangeError ? 'custom-range-error' : undefined}
              style={customRangeActive ? { borderColor: 'var(--accent)' } : dateRangeError ? { borderColor: 'var(--danger)' } : undefined}
            />
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={e => setCustomTo(e.target.value)}
              aria-label="Custom range end date"
              aria-invalid={dateRangeError ? true : undefined}
              aria-describedby={dateRangeError ? 'custom-range-error' : undefined}
              style={customRangeActive ? { borderColor: 'var(--accent)' } : dateRangeError ? { borderColor: 'var(--danger)' } : undefined}
            />
            {(customFrom || customTo) && (
              <button
                className="action-btn"
                onClick={() => { setCustomFrom(''); setCustomTo('') }}
                aria-label="Clear custom date range"
                style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem' }}
              >
                ✕ Clear
              </button>
            )}
            {dateRangeError && (
              <span id="custom-range-error" role="alert" style={{ color: 'var(--danger)', fontSize: '0.78rem' }}>
                {dateRangeError}
              </span>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 0.25rem' }} />

          {/* Compare Toggle */}
          <button
            className={`toggle-btn${showComparison ? ' active' : ''}`}
            onClick={() => setShowComparison(v => !v)}
          >
            {showComparison ? '✓' : ''} Compare Periods
          </button>
          <button
            className={`toggle-btn${showMovingAverage ? ' active' : ''}`}
            onClick={() => setShowMovingAverage((v) => !v)}
            aria-pressed={showMovingAverage}
            title={`Toggle ${MA_WINDOW}-point moving average overlay on Success Rate chart`}
          >
            {showMovingAverage ? '✓' : ''} Moving Avg
          </button>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Export Buttons */}
          <button className="action-btn" onClick={handleCsvExport} disabled={chartData.length === 0}>
            <Download size={14} /> CSV
          </button>
          <button
            className="action-btn"
            onClick={handlePdfExport}
            disabled={isExportLoading}
          >
            <Download size={14} /> {isExportLoading ? 'Loading...' : 'PDF Report'}
          </button>
          {exportError && <div style={{ color: 'var(--danger)', marginLeft: '0.75rem' }}>{exportError}</div>}
        </div>

        {/* ── SECTION 1: Key Metrics Cards ── */}
        <div style={{ marginBottom: '2rem' }}>
          <SectionTitle>Key Metrics</SectionTitle>
          <div
            className="metrics-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}
          >
            {[
              {
                label: 'Total Capital Locked',
                value: formatCurrency(kpis.totalCapital),
                sub: kpis.capitalDelta !== 0 ? `${kpis.capitalDelta > 0 ? '+' : ''}${formatCurrency(kpis.capitalDelta)} vs prev` : 'USDC',
                icon: <Target size={17} color={seriesColors.success} />,
                up: kpis.capitalTrend,
              },
              {
                label: 'Success Rate',
                value: formatPercentage(kpis.averageSuccessRate),
                sub: kpis.successDelta !== 0 ? `${kpis.successDelta > 0 ? '+' : ''}${formatPercentage(kpis.successDelta, 1)} vs prev` : 'Average',
                icon: <CheckCircle size={17} color={seriesColors.success} />,
                up: kpis.successTrend,
              },
              {
                label: 'Total Milestones',
                value: `${kpis.totalMilestones}`,
                sub: kpis.milestoneDelta !== 0 ? `${kpis.milestoneDelta > 0 ? '+' : ''}${kpis.milestoneDelta} vs prev` : 'All time',
                icon: <Award size={17} color={seriesColors.success} />,
                up: kpis.milestoneTrend,
              },
            ].map((stat, i) => (
              <Card key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.3 }}>{stat.label}</span>
                  {stat.icon}
                </div>
                <div style={{ fontSize: '1.55rem', fontWeight: 800, marginBottom: '0.2rem' }}>{stat.value}</div>
                <div style={{ fontSize: '0.75rem', color: stat.up ? seriesColors.success : seriesColors.failed, display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                  {stat.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  {stat.sub}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* ── SECTION 2: Performance Charts ── */}
        <div style={{ marginBottom: '2rem' }}>
          <SectionTitle>Performance Charts {showComparison && <span style={{ color: seriesColors.comparison, fontSize: '0.75rem', fontWeight: 400, marginLeft: '0.5rem' }}>Comparing with previous period</span>}</SectionTitle>
          <Suspense fallback={<Skeleton height={300} data-testid="chart-skeleton" />}>
            <AnalyticsCharts
              section="performance"
              {...analyticsChartProps}
            />
          </Suspense>
        </div>

        {/* ── SECTION 3: Vault Analytics ── */}
        <div style={{ marginBottom: '2rem' }}>
          <SectionTitle>Vault Analytics</SectionTitle>
          <div className="chart-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>

            {/* Donut */}
            <Card>
              <ChartTitle>Vaults by Status</ChartTitle>
              <ChartSummary>
                Donut chart summarizing vault status counts: 14 completed, 3 active, and 4 failed.
              </ChartSummary>
              <Suspense fallback={<Skeleton height={180} data-testid="chart-skeleton" />}>
                <AnalyticsCharts
                  section="donut"
                  {...analyticsChartProps}
                />
              </Suspense>
            </Card>

            {/* Vault Stats */}
            <Card>
              <ChartTitle>Vault Stats</ChartTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {[
                  { icon: <Clock size={15} color="var(--muted)" />, label: 'Average Vault Duration', value: '18 days' },
                  { icon: <DollarSign size={15} color="var(--muted)" />, label: 'Average Vault Amount', value: '$592 USDC' },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.75rem 1rem', background: 'var(--bg)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                      {item.icon} {item.label}
                    </div>
                    <div style={{ fontWeight: 700 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ color: 'var(--muted)', fontSize: '0.78rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Most Common Milestone Types
              </div>
              {milestoneTypes.map((m, i) => (
                <div key={i} style={{ marginBottom: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                    <span>{m.type}</span>
                    <span style={{ color: 'var(--muted)' }}>{m.count}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--border)', borderRadius: 99 }}>
                    <div className="disciplr-progress-bar" style={{ height: '100%', width: `${(m.count / 12) * 100}%`, background: seriesColors.milestone, borderRadius: 99, transition: 'width 0.4s' }} />
                  </div>
                </div>
              ))}
            </Card>

          </div>
        </div>

        {/* ── SECTION 4: Behavioral Insights ── */}
        <div style={{ marginBottom: '2rem' }}>
          <SectionTitle>Behavioral Insights</SectionTitle>
          <div className="insights-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>

            <Card style={{ textAlign: 'center' }}>
              <Flame size={26} color={seriesColors.warning} style={{ marginBottom: '0.4rem' }} />
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: seriesColors.warning, lineHeight: 1 }}>{currentStreak}</div>
              <div style={{ fontWeight: 600, margin: '0.3rem 0 0.15rem' }}>Current Streak</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>consecutive successes 🔥</div>
            </Card>

            <Card style={{ textAlign: 'center' }}>
              <TrendingUp size={26} color={seriesColors.success} style={{ marginBottom: '0.4rem' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: seriesColors.success, lineHeight: 1 }}>{bestPeriod?.name ?? '—'}</div>
              <div style={{ fontWeight: 600, margin: '0.3rem 0 0.15rem' }}>Best Period</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{bestPeriod ? `${bestPeriod.success}% success rate` : 'No data yet'}</div>
            </Card>

            <Card style={{ textAlign: 'center' }}>
              <AlertTriangle size={26} color={seriesColors.failed} style={{ marginBottom: '0.4rem' }} />
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: seriesColors.failed, lineHeight: 1 }}>Q1</div>
              <div style={{ fontWeight: 600, margin: '0.3rem 0 0.15rem' }}>Needs Work</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>3 failed vaults Jan–Mar</div>
            </Card>

            <Card style={{ textAlign: 'center' }}>
              <Award size={26} color={seriesColors.success} style={{ marginBottom: '0.4rem' }} />
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: seriesColors.success, lineHeight: 1 }}>82</div>
              <div style={{ fontWeight: 600, margin: '0.3rem 0 0.15rem' }}>Accountability Score</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>out of 100 · Top 15%</div>
            </Card>

          </div>
        </div>

        {/* ── SECTION 5: Capital Flow ── */}
        <div style={{ marginBottom: '2rem' }}>
          <SectionTitle>Capital Flow</SectionTitle>
          <div className="flow-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.65rem' }}>
                <ArrowUpRight size={17} color={seriesColors.success} />
                <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Released to Success</span>
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800, color: seriesColors.success }}>$8,750 USDC</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.76rem', marginTop: '0.25rem' }}>Paid out to 14 success addresses</div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.65rem' }}>
                <ArrowDownRight size={17} color={seriesColors.failed} />
                <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Redirected on Failure</span>
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800, color: seriesColors.failed }}>$2,400 USDC</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.76rem', marginTop: '0.25rem' }}>Sent to 4 failure destinations</div>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.65rem' }}>
                <DollarSign size={17} color="var(--muted)" />
                <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Fee Summary</span>
              </div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>$124 USDC</div>
              <div style={{ color: 'var(--muted)', fontSize: '0.76rem', marginTop: '0.25rem' }}>1% platform fee on all vaults</div>
            </Card>

          </div>
        </div>

        {/* ── SECTION 6: Benchmarking ── */}
        <div style={{ marginBottom: '2rem' }}>
          <SectionTitle>Benchmarking — You vs Platform Average</SectionTitle>
          <Card>
            <div className="bench-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
              {benchmarkData.map((item, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.4rem' }}>
                    <span style={{ color: 'var(--muted)' }}>{item.metric}</span>
                    <span style={{ color: item.you >= item.platform ? seriesColors.success : seriesColors.failed, fontWeight: 700 }}>
                      {item.you >= item.platform ? '↑' : '↓'} You: {item.you}{item.unit}
                    </span>
                  </div>
                  {/* Your bar */}
                  <div style={{ marginBottom: '0.25rem' }}>
                    <div style={{ fontSize: '0.72rem', color: seriesColors.success, marginBottom: '0.15rem' }}>You</div>
                    <div style={{ height: 8, background: 'var(--border)', borderRadius: 99 }}>
                      <div className="disciplr-progress-bar" style={{ height: '100%', width: `${Math.min((item.you / (Math.max(item.you, item.platform) * 1.2)) * 100, 100)}%`, background: seriesColors.success, borderRadius: 99 }} />
                    </div>
                  </div>
                  {/* Platform bar */}
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '0.15rem' }}>Platform avg</div>
                    <div style={{ height: 8, background: 'var(--border)', borderRadius: 99 }}>
                      <div style={{ height: '100%', width: `${Math.min((item.platform / (Math.max(item.you, item.platform) * 1.2)) * 100, 100)}%`, background: 'var(--muted)', borderRadius: 99 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── SECTION 7: Goal Setting ── */}
        <div style={{ marginBottom: '1rem' }}>
          <SectionTitle>Goal Setting & Tracking</SectionTitle>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <Flag size={17} color="var(--accent)" />
              <span style={{ fontWeight: 600 }}>Set your targets for this period</span>
            </div>
            <div className="bench-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>

              {/* Success Rate Goal */}
              <div>
                <label style={{ color: 'var(--muted)', fontSize: '0.82rem', display: 'block', marginBottom: '0.5rem' }}>
                  Target Success Rate (%)
                </label>
                <input type="number" value={goalRate} min={0} max={100}
                  aria-label="Target success rate"
                  aria-invalid={rateGoal.error ? true : undefined}
                  aria-describedby="goal-rate-status"
                  onChange={e => setGoalRate(e.target.value)} />
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                    <span style={{ color: 'var(--muted)' }}>Current: {formatPercentage(kpis.averageSuccessRate)}</span>
                    <span style={{ color: rateGoalMet ? seriesColors.success : seriesColors.comparison }}>
                      Goal: {rateGoal.value !== null ? `${rateGoal.value}%` : '—'}
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, position: 'relative' }}>
                    <div className="disciplr-progress-bar" data-testid="goal-rate-progress" style={{ height: '100%', width: `${safePercent(kpis.averageSuccessRate, 100)}%`, background: seriesColors.success, borderRadius: 99 }} />
                    {rateGoal.value !== null && (
                      <div data-testid="goal-rate-marker" style={{
                        position: 'absolute', top: -2, left: `${safePercent(rateGoal.value, 100)}%`,
                        width: 3, height: 12, background: seriesColors.comparison, borderRadius: 2,
                        transform: 'translateX(-50%)',
                      }} />
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: kpis.averageSuccessRate >= Number(goalRate) ? seriesColors.success : 'var(--muted)', marginTop: '0.3rem' }}>
                    {kpis.averageSuccessRate >= parseGoalInput(goalRate, 90, { min: 0, max: 100 }) ? '✓ Goal achieved!' : `${(parseGoalInput(goalRate, 90, { min: 0, max: 100 }) - kpis.averageSuccessRate).toFixed(1)}% to go`}
                  </div>
                </div>
              </div>

              {/* Capital Goal */}
              <div>
                <label style={{ color: 'var(--muted)', fontSize: '0.82rem', display: 'block', marginBottom: '0.5rem' }}>
                  Target Capital Locked (USDC)
                </label>
                <input type="number" value={goalCapital} min={0}
                  aria-label="Target capital locked"
                  aria-invalid={capitalGoal.error ? true : undefined}
                  aria-describedby="goal-capital-status"
                  onChange={e => setGoalCapital(e.target.value)} />
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem' }}>
                    <span style={{ color: 'var(--muted)' }}>Current: {formatCurrency(kpis.totalCapital)}</span>
                    <span style={{ color: capitalGoalMet ? seriesColors.success : seriesColors.comparison }}>
                      Goal: {capitalGoal.value !== null ? `$${capitalGoal.value.toLocaleString()}` : '—'}
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, position: 'relative' }}>
                    <div className="disciplr-progress-bar" style={{ height: '100%', width: `${Math.min((kpis.totalCapital / Math.max(parseGoalInput(goalCapital, 5000, { min: 0 }), kpis.totalCapital)) * 100, 100)}%`, background: seriesColors.success, borderRadius: 99 }} />
                    <div style={{
                      position: 'absolute', top: -2,
                      left: `${Math.min((parseGoalInput(goalCapital, 5000, { min: 0 }) / Math.max(parseGoalInput(goalCapital, 5000, { min: 0 }), kpis.totalCapital)) * 100, 100)}%`,
                      width: 3, height: 12, background: seriesColors.comparison, borderRadius: 2, transform: 'translateX(-50%)',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: kpis.totalCapital >= Number(goalCapital) ? seriesColors.success : 'var(--muted)', marginTop: '0.3rem' }}>
                    {kpis.totalCapital >= parseGoalInput(goalCapital, 5000, { min: 0 }) ? '✓ Goal achieved!' : `$${(parseGoalInput(goalCapital, 5000, { min: 0 }) - kpis.totalCapital).toLocaleString()} to go`}
                  </div>
                </div>
              </div>

              {/* Score tip */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Quick Insights</div>
                {[
                  { icon: <BarChart2 size={14} color={seriesColors.success} />, text: 'You outperform 85% of users' },
                  { icon: <Flame size={14} color={seriesColors.warning} />, text: 'Keep your 5-vault streak going' },
                  { icon: <CheckCircle size={14} color={seriesColors.success} />, text: 'Best month was June (92%)' },
                ].map((tip, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.6rem 0.85rem', background: 'var(--bg)',
                    borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '0.82rem',
                  }}>
                    {tip.icon} {tip.text}
                  </div>
                ))}
              </div>

            </div>
          </Card>
        </div>

        {/* ── SECTION 8: Team / Organization Analytics (Enterprise) ── */}
        <div style={{ marginBottom: '1rem' }}>
          <SectionTitle>
            <span>Team & Organization Analytics </span>
            <span style={{
              fontSize: '0.7rem',
              background: seriesColors.warning,
              color: 'var(--bg)',
              padding: '0.15rem 0.5rem',
              borderRadius: '999px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              verticalAlign: 'middle',
            }}>ENTERPRISE</span>
          </SectionTitle>

          {/* Upgrade banner */}
          <div style={{
            background: chartTokens.accentTransparent,
            border: `1px solid ${seriesColors.warning}`,
            borderRadius: 'var(--radius)',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
          }}>
            <Crown size={22} color={seriesColors.warning} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                Unlock Team Analytics with Enterprise
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
                Monitor your entire organization's accountability performance, compare members, and export team-wide reports.
              </div>
            </div>
            <button
              onClick={() => window.open('mailto:sales@disciplr.app?subject=Enterprise%20Upgrade%20Inquiry', '_blank')}
              style={{
              background: seriesColors.warning,
              color: 'var(--bg)',
              border: 'none',
              padding: '0.55rem 1.25rem',
              borderRadius: '999px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              flexShrink: 0,
            }}>
              Upgrade to Enterprise
            </button>
          </div>

          {/* Blurred preview */}
          <div className="bench-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', position: 'relative' }}>

            {/* Lock overlay */}
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
              borderRadius: 'var(--radius)',
            }}>
              <div style={{ textAlign: 'center' }}>
                <Lock size={28} color={seriesColors.warning} style={{ marginBottom: '0.5rem' }} />
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Enterprise Feature</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>Upgrade to view team data</div>
              </div>
            </div>

            {/* Team Members */}
            <Card style={{ opacity: 0.4 }} locked>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Users size={17} color="var(--muted)" />
                <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Team Members</span>
              </div>
              {[
                { name: 'Alice', score: 94, vaults: 8 },
                { name: 'Bob', score: 78, vaults: 5 },
                { name: 'Carol', score: 88, vaults: 6 },
              ].map((member, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.6rem 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', fontSize: '0.85rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                      {member.name[0]}
                    </div>
                    {member.name}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: seriesColors.success }}>{member.score}%</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{member.vaults} vaults</div>
                  </div>
                </div>
              ))}
            </Card>

            {/* Team Bar Chart */}
            <Card style={{ opacity: 0.4 }} locked>
              <ChartTitle>Team Success Rate</ChartTitle>
              <ChartSummary>
                Locked enterprise preview bar chart showing example team member success rates.
              </ChartSummary>
              <Suspense fallback={<Skeleton height={160} data-testid="chart-skeleton" />}>
                <AnalyticsCharts
                  section="team"
                  {...analyticsChartProps}
                />
              </Suspense>
            </Card>

            {/* Org Summary */}
            <Card style={{ opacity: 0.4 }} locked>
              <ChartTitle>Organization Summary</ChartTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[
                  { label: 'Total Members', value: '12' },
                  { label: 'Team Success Rate', value: '81%' },
                  { label: 'Total Capital Locked', value: '$48,200 USDC' },
                  { label: 'Active Vaults', value: '23' },
                  { label: 'Top Performer', value: 'Alice (94%)' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', paddingBottom: '0.5rem', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ color: 'var(--muted)' }}>{item.label}</span>
                    <span style={{ fontWeight: 700 }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </Card>

          </div>
        </div>

      </div>
    </>
  )
}
