import type { EChartsOption } from 'echarts'
import { useMemo, useState } from 'react'
import { useHeatmap } from '../../api/hooks'
import { EChart } from '../../components/charts/EChart'
import { baseOption, useChartTheme } from '../../components/charts/theme'
import { EmptyState, ErrorState, LoadingState, Segmented } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import type { ResultViewProps } from '../types'

const LIMIT_OPTIONS = [
  { value: 25, label: 'Top 25' },
  { value: 50, label: 'Top 50' },
  { value: 0, label: 'All' },
]

/** Branch loading heatmap: elements (sorted by peak) × time buckets (max-aggregated). */
export function LoadingHeatmapView({ runId }: ResultViewProps) {
  const theme = useChartTheme()
  const q = useHeatmap(runId, 'branch', 'loading', 500)
  const [top, setTop] = useState(25)

  const { option, rows } = useMemo(() => {
    const d = q.data
    if (!d) return { option: {} as EChartsOption, rows: 0 }
    const n = top ? Math.min(top, d.ids.length) : d.ids.length
    // ECharts category y-axis grows upwards; reverse so the worst element is on top
    const names = d.names.slice(0, n).reverse()
    const data: [number, number, number | null][] = []
    for (let r = 0; r < n; r++) {
      const y = n - 1 - r
      const vals = d.values[r]
      for (let x = 0; x < vals.length; x++) data.push([x, y, vals[x]])
    }
    const xLabels = d.timestamps.map((t) => fmtDateTime(t))
    const b = baseOption(theme)
    const option: EChartsOption = {
      ...b,
      grid: { left: 120, right: 24, top: 12, bottom: 96 },
      tooltip: {
        ...b.tooltip,
        position: 'top',
        formatter: (p: unknown) => {
          const v = (p as { value: [number, number, number | null] }).value
          return `<b>${names[v[1]]}</b><br/>${xLabels[v[0]]}<br/>max loading <b>${v[2] === null ? '—' : (v[2] * 100).toFixed(1) + ' %'}</b>`
        },
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: { color: theme.muted, hideOverlap: true },
        axisLine: { lineStyle: { color: theme.axis } },
        axisTick: { show: false },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category',
        data: names,
        axisLabel: { color: theme.fg2, width: 110, overflow: 'truncate' },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      visualMap: {
        min: 0,
        max: 1.2,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        itemHeight: 160,
        itemWidth: 10,
        textStyle: { color: theme.muted },
        formatter: (v: unknown) => `${Math.round(Number(v) * 100)}%`,
        inRange: { color: [theme.dark ? '#1f2b3a' : '#eef4fc', '#86b6ef', '#2a78d6', '#eda100', theme.bad] },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', xAxisIndex: 0, height: 16, bottom: 44, borderColor: theme.border, textStyle: { color: theme.muted }, labelFormatter: '' },
      ],
      series: [
        {
          type: 'heatmap',
          data,
          progressive: 5000,
          emphasis: { itemStyle: { borderColor: theme.fg, borderWidth: 1 } },
        },
      ],
    }
    return { option, rows: n }
  }, [q.data, theme, top])

  if (q.isLoading) return <LoadingState label="Loading heatmap…" />
  if (q.error) return <ErrorState error={q.error} title="Could not load heatmap" onRetry={() => void q.refetch()} />
  if (!q.data?.ids.length) return <EmptyState title="No branches in this network" />
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
        <span>
          {q.data.ids.length} branches · {q.data.timestamps.length} time buckets ({q.data.aggregation} per bucket) · sorted by peak loading
        </span>
        <Segmented size="sm" value={top} onChange={setTop} options={LIMIT_OPTIONS} />
      </div>
      <EChart option={option} height={Math.max(260, rows * 16 + 120)} />
    </div>
  )
}
