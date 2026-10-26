import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import type { TimeseriesResponse } from '../api/schema'
import { EChart } from '../components/charts/EChart'
import { baseOption, dataZoom, timeAxis, useChartTheme, valueAxis } from '../components/charts/theme'
import { fieldLabel, fmtUnit } from '../lib/format'
import { toMs } from './timestamps'

export interface LimitLine {
  value: number
  label: string
}

const NO_LIMITS: LimitLine[] = []

/** Multi-line time series chart with dataZoom and optional horizontal limit lines. */
export function TimeseriesChart({
  data,
  limits = NO_LIMITS,
  height = 360,
  loading,
}: {
  data?: TimeseriesResponse
  limits?: LimitLine[]
  height?: number
  loading?: boolean
}) {
  const theme = useChartTheme()
  const option = useMemo<EChartsOption>(() => {
    const ts = data ? toMs(data.timestamps) : []
    const unit = data?.unit ?? ''
    const pct = data?.field === 'loading'
    const fmt = (v: unknown) => (typeof v === 'number' ? (pct ? `${(v * 100).toFixed(1)} %` : fmtUnit(v, unit)) : '—')
    const b = baseOption(theme)
    return {
      ...b,
      grid: { left: 64, right: 24, top: 56, bottom: 64 },
      legend: { ...b.legend, type: 'scroll', top: 0, left: 0, right: 0 },
      tooltip: { ...b.tooltip, trigger: 'axis', valueFormatter: fmt },
      xAxis: timeAxis(theme),
      yAxis: valueAxis(theme, {
        name: data ? `${fieldLabel(data.field)}${unit && !pct ? ` [${unit}]` : ''}` : '',
        axisLabel: { color: theme.muted, formatter: (v: number) => (pct ? `${Math.round(v * 100)}%` : unit === 'pu' ? v.toFixed(3) : fmtUnit(v, unit)) },
      }),
      dataZoom: dataZoom(theme),
      series: (data?.series ?? []).map((s, i) => ({
        type: 'line' as const,
        name: s.name,
        showSymbol: false,
        connectNulls: false,
        sampling: 'lttb' as const,
        lineStyle: { width: 1.6 },
        data: s.values.map((v, j) => [ts[j], v]),
        ...(i === 0 && limits.length
          ? {
              markLine: {
                symbol: 'none',
                silent: true,
                lineStyle: { color: theme.bad, type: 'dashed' as const, width: 1 },
                label: { color: theme.bad, formatter: '{b}', position: 'insideEndTop' as const, fontSize: 10 },
                data: limits.map((l) => ({ yAxis: l.value, name: l.label })),
              },
            }
          : {}),
      })),
    }
  }, [data, theme, limits])
  return <EChart option={option} height={height} loading={loading} />
}
