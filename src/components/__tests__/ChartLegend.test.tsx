import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { ChartLegend, type ChartLegendEntry } from '../ChartLegend'

const tokens = {
  accent: '#0A7668',
  success: '#059669',
  danger: '#DC2626',
  info: '#2563EB',
  warning: '#D97706',
  text: '#111827',
  muted: '#4B5563',
  surface: '#F3F4F6',
  surfaceRaised: '#E5E7EB',
  border: '#E5E7EB',
  bg: '#F9FAFB',
  accentTransparent: 'rgba(10, 118, 104, 0.1)',
  legendGap: '0.75rem',
  legendSwatchSize: '0.625rem',
  legendLabelRole: 'caption' as const,
}

describe('ChartLegend', () => {
  it('returns null for an empty series list', () => {
    const { container } = render(
      <ChartLegend
        entries={[]}
        colors={{ success: '#059669', failed: '#DC2626', comparison: '#2563EB', milestone: '#0A7668', active: '#2563EB', warning: '#D97706', platform: '#4B5563' }}
        tokens={tokens}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders labels with the configured typography role and tokenized swatches', () => {
    render(
      <ChartLegend
        entries={[
          { label: 'This Period %', colorKey: 'success', id: 'series-1' },
          { label: 'Failed %', colorKey: 'failed', id: 'series-2' },
        ]}
        colors={{ success: '#059669', failed: '#DC2626', comparison: '#2563EB', milestone: '#0A7668', active: '#2563EB', warning: '#D97706', platform: '#4B5563' }}
        tokens={tokens}
      />,
    )

    expect(screen.getByLabelText('Chart legend')).toBeInTheDocument()
    expect(screen.getByText('This Period %')).toHaveClass('text-caption')
    expect(screen.getByText('Failed %')).toHaveClass('text-caption')
    expect(screen.getByText('This Period %').previousElementSibling).toHaveStyle({ backgroundColor: '#059669' })
    expect(screen.getByText('Failed %').previousElementSibling).toHaveStyle({ backgroundColor: '#DC2626' })
  })

  it('updates swatch colors when the theme palette changes', () => {
    const { rerender } = render(
      <ChartLegend
        entries={[{ label: 'This Period %', colorKey: 'success', id: 'series-1' }]}
        colors={{ success: '#059669', failed: '#DC2626', comparison: '#2563EB', milestone: '#0A7668', active: '#2563EB', warning: '#D97706', platform: '#4B5563' }}
        tokens={tokens}
      />,
    )

    expect(screen.getByText('This Period %').previousElementSibling).toHaveStyle({ backgroundColor: '#059669' })

    rerender(
      <ChartLegend
        entries={[{ label: 'This Period %', colorKey: 'success', id: 'series-1' }]}
        colors={{ success: '#14B8A6', failed: '#F87171', comparison: '#60A5FA', milestone: '#0A7668', active: '#60A5FA', warning: '#F59E0B', platform: '#6B7280' }}
        tokens={tokens}
      />,
    )

    expect(screen.getByText('This Period %').previousElementSibling).toHaveStyle({ backgroundColor: '#14B8A6' })
  })

  it('renders multiple color-keyed swatches with distinct colors', () => {
    render(
      <ChartLegend
        entries={[
          { label: 'Success', colorKey: 'success', id: 'color-1' },
          { label: 'Warning', colorKey: 'warning', id: 'color-2' },
          { label: 'Platform', colorKey: 'platform', id: 'color-3' },
        ]}
        colors={{ success: '#059669', failed: '#DC2626', comparison: '#2563EB', milestone: '#0A7668', active: '#2563EB', warning: '#D97706', platform: '#4B5563' }}
        tokens={tokens}
      />,
    )

    const swatches = ['Success', 'Warning', 'Platform'].map(
      (label) => screen.getByText(label).previousElementSibling,
    )
    const colors = swatches.map((s) => (s as HTMLElement).style.backgroundColor)
    const uniqueColors = new Set(colors)
    expect(uniqueColors.size).toBe(3)
  })

  it('supports a custom ariaLabel overriding the default', () => {
    render(
      <ChartLegend
        entries={[{ label: 'Revenue', colorKey: 'success', id: 'revenue-1' }]}
        colors={{ success: '#059669', failed: '#DC2626', comparison: '#2563EB', milestone: '#0A7668', active: '#2563EB', warning: '#D97706', platform: '#4B5563' }}
        tokens={tokens}
        ariaLabel="Revenue chart legend"
      />,
    )
    expect(screen.getByLabelText('Revenue chart legend')).toBeInTheDocument()
  })

  it('toggle wrapper: clicking an entry label can drive a hidden-series set', () => {
    function ToggleWrapper() {
      const [hidden, setHidden] = useState<Set<string>>(new Set())
      const entries: ChartLegendEntry[] = [
        { label: 'This Period', colorKey: 'success', id: 'series-a' },
        { label: 'Failed', colorKey: 'failed', id: 'series-b' },
      ]
      return (
        <>
          <ul>
            {entries.map((e) => (
              <li key={e.id}>
                <button
                  aria-pressed={hidden.has(e.id!)}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev)
                      if (next.has(e.id!)) next.delete(e.id!);
                      else next.add(e.id!)
                      return next
                    })
                  }
                >
                  {e.label}
                </button>
              </li>
            ))}
          </ul>
          <ChartLegend
            entries={entries.filter((e) => !hidden.has(e.id!))}
            colors={{ success: '#059669', failed: '#DC2626', comparison: '#2563EB', milestone: '#0A7668', active: '#2563EB', warning: '#D97706', platform: '#4B5563' }}
            tokens={tokens}
          />
        </>
      )
    }

    render(<ToggleWrapper />)

    expect(screen.getByRole('button', { name: 'This Period' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Failed' })).toBeInTheDocument()

    // Toggle off "Failed"
    fireEvent.click(screen.getByRole('button', { name: 'Failed' }))
    expect(screen.queryByRole('list', { name: 'Chart legend' })?.querySelector('[aria-hidden="true"]')).not.toBeNull()

    // Legend still shows "This Period" but not "Failed" label in the legend
    const legendItems = screen.getByLabelText('Chart legend').querySelectorAll('li')
    expect(legendItems).toHaveLength(1)
  })

  it('renders without duplicate-key warnings when entries have unique stable ids', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      render(
        <ChartLegend
          entries={[
            { label: 'Metric A', colorKey: 'success', id: 'metric-a' },
            { label: 'Metric A', colorKey: 'failed', id: 'metric-b' },
            { label: 'Metric A', colorKey: 'comparison', id: 'metric-c' },
          ]}
          colors={{ success: '#059669', failed: '#DC2626', comparison: '#2563EB', milestone: '#0A7668', active: '#2563EB', warning: '#D97706', platform: '#4B5563' }}
          tokens={tokens}
        />,
      )

      // Assert no React duplicate-key warning was logged
      const duplicateKeyWarnings = consoleSpy.mock.calls.filter(
        (call) => call[0]?.toString?.().includes('duplicate key'),
      )
      expect(duplicateKeyWarnings).toHaveLength(0)

      // Verify all three items rendered correctly despite duplicate labels
      const legendItems = screen.getByLabelText('Chart legend').querySelectorAll('li')
      expect(legendItems).toHaveLength(3)
      
      // Verify each legend item is rendered with the correct text
      const textElements = Array.from(screen.getAllByText('Metric A'))
      expect(textElements.length).toBe(3)
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('renders without duplicate-key warnings when entries share a label and omit ids', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      render(
        <ChartLegend
          entries={[
            { label: 'Metric A', colorKey: 'success' },
            { label: 'Metric A', colorKey: 'failed' },
            { label: 'Metric A', colorKey: 'comparison' },
          ]}
          colors={{ success: '#059669', failed: '#DC2626', comparison: '#2563EB', milestone: '#0A7668', active: '#2563EB', warning: '#D97706', platform: '#4B5563' }}
          tokens={tokens}
        />,
      )

      // Assert no React duplicate-key warning was logged
      const duplicateKeyWarnings = consoleSpy.mock.calls.filter(
        (call) => call[0]?.toString?.().includes('duplicate key'),
      )
      expect(duplicateKeyWarnings).toHaveLength(0)

      // Verify all three items rendered correctly despite duplicate labels
      const legendItems = screen.getByLabelText('Chart legend').querySelectorAll('li')
      expect(legendItems).toHaveLength(3)

      const textElements = Array.from(screen.getAllByText('Metric A'))
      expect(textElements.length).toBe(3)
    } finally {
      consoleSpy.mockRestore()
    }
  })
})