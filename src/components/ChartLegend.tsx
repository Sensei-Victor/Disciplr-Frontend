import { Text } from './Text'
import type { AnalyticsChartTokens, AnalyticsSeriesColors } from '../pages/analyticsTheme'

type ChartLegendColorKey = 'success' | 'failed' | 'comparison' | 'milestone' | 'active' | 'warning' | 'platform'

export type ChartLegendEntry = {
  label: string
  colorKey: ChartLegendColorKey
  id?: string
}

type ChartLegendTokens = Pick<AnalyticsChartTokens, 'legendGap' | 'legendSwatchSize' | 'legendLabelRole'>

type ChartLegendProps = {
  entries: ChartLegendEntry[]
  colors: Pick<AnalyticsSeriesColors, ChartLegendColorKey>
  tokens: ChartLegendTokens
  ariaLabel?: string
  className?: string
}

export function ChartLegend({ entries, colors, tokens, ariaLabel = 'Chart legend', className }: ChartLegendProps) {
  if (entries.length === 0) {
    return null
  }

  return (
    <ul
      aria-label={ariaLabel}
      className={className}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: tokens.legendGap,
        listStyle: 'none',
        margin: '0.75rem 0 0',
        padding: 0,
      }}
    >
      {entries.map((entry, index) => (
        <li
          key={entry.id ?? `${entry.label}-${index}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <span
            aria-hidden="true"
            style={{
              width: tokens.legendSwatchSize,
              height: tokens.legendSwatchSize,
              borderRadius: 'var(--radius-full)',
              backgroundColor: colors[entry.colorKey],
              flex: 'none',
            }}
          />
          <Text as="span" role={tokens.legendLabelRole} style={{ color: 'var(--muted)' }}>
            {entry.label}
          </Text>
        </li>
      ))}
    </ul>
  )
}
