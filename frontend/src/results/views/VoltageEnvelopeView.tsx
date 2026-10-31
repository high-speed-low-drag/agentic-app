import type { EChartsOption } from 'echarts'
import { useMemo } from 'react'
import { useEnvelope } from '../../api/hooks'
import { EChart } from '../../components/charts/EChart'
import { baseOption, dataZoom, timeAxis, useChartTheme, valueAxis } from '../../components/charts/theme'
import { ErrorState, LoadingState } from '../../components/ui'
import { fmtDateTime, fmtPu } from '../../lib/format'
import { axisRangeWithLimits, seriesExtent, voltageLimitLines } from '../limitLines'
import { toMs } from '../timestamps'
import type { ResultViewProps } from '../types'
import { useRunContext } from '../useRunContext'

const diff = (hi: (number | null)[], lo: (number | null)[]) =>
  hi.map((h, i) => (h === null || lo[i] === null ? null : h - (lo[i] as number)))

/** Envelope (min / p05 / mean / p95 / max) of node voltages across all nodes, per timestep. */
export function VoltageEnvelopeView({ runId }: ResultViewProps) {
  const theme = useChartTheme()
  const { limits } = useRunContext(runId)
  const q = useEnvelope(runId, 'node', 'u_pu')
  const range = useMemo(() => {
    const ext = seriesExtent(q.data ? [q.data.min, q.data.max] : [])
    return axisRangeWithLimits(ext.min, ext.max, [limits.u_min_pu, limits.u_max_pu])
  }, [q.data, limits])

  const option = useMemo<EChartsOption>(() => {
    const d = q.data
    if (!d) return {}
    const ts = toMs(d.timestamps)
    const pair = (vals: (number | null)[]) => vals.map((v, i) => [ts[i], v])
    const b = baseOption(theme)
    const band = theme.series[0]
    return {
      ...b,
      grid: { left: 60, right: 80, top: 56, bottom: 64 },
      legend: { ...b.legend, top: 0, left: 0, data: ['min – max', 'p05 – p95', 'mean'] },
      tooltip: {
        ...b.tooltip,
        trigger: 'axis',
        formatter: (raw: unknown) => {
          const ps = raw as { dataIndex: number }[]
          const i = ps[0]?.dataIndex ?? 0
          const row = (k: string, v: number | null) =>
            `<div style="display:flex;justify-content:space-between;gap:16px"><span>${k}</span><b>${fmtPu(v)}</b></div>`
          return (
            `<div style="margin-bottom:4px;opacity:.7">${fmtDateTime(d.timestamps[i])}</div>` +
            row('max', d.max[i]) +
            row('p95', d.p95[i]) +
            row('mean', d.mean[i]) +
            row('p05', d.p05[i]) +
            row('min', d.min[i])
          )
        },
      },
      xAxis: timeAxis(theme),
      yAxis: valueAxis(theme, {
        name: 'u [pu]',
        ...(range ? { min: range.min, max: range.max } : {}),
        axisLabel: { color: theme.muted, formatter: (v: number) => v.toFixed(3) } }),
      dataZoom: dataZoom(theme),
      series: [
        { name: 'min – max', type: 'line', stack: 'outer', data: pair(d.min), showSymbol: false, lineStyle: { opacity: 0 }, itemStyle: { color: band }, silent: true, sampling: 'lttb' },
        {
          name: 'min – max',
          type: 'line',
          stack: 'outer',
          data: pair(diff(d.max, d.min)),
          showSymbol: false,
          lineStyle: { opacity: 0 },
          areaStyle: { color: band, opacity: 0.14 },
          itemStyle: { color: band },
          silent: true,
          sampling: 'lttb',
        },
        { name: 'p05 – p95', type: 'line', stack: 'inner', data: pair(d.p05), showSymbol: false, lineStyle: { opacity: 0 }, itemStyle: { color: band }, silent: true, sampling: 'lttb' },
        {
          name: 'p05 – p95',
          type: 'line',
          stack: 'inner',
          data: pair(diff(d.p95, d.p05)),
          showSymbol: false,
          lineStyle: { opacity: 0 },
          areaStyle: { color: band, opacity: 0.3 },
          itemStyle: { color: band },
          silent: true,
          sampling: 'lttb',
        },
        {
          name: 'mean',
          type: 'line',
          data: pair(d.mean),
          showSymbol: false,
          lineStyle: { width: 2, color: band },
          itemStyle: { color: band },
          sampling: 'lttb',
          markLine: {
            symbol: 'none',
            silent: true,
            lineStyle: { color: theme.bad, type: 'dashed', width: 1 },
            label: { color: theme.bad, formatter: '{b}', position: 'end', fontSize: 10 },
            data: voltageLimitLines(limits).map((l) => ({ yAxis: l.value, name: l.label })),
          },
        },
      ],
    }
  }, [q.data, theme, limits, range])

  if (q.isLoading) return <LoadingState label="Loading voltage envelope…" />
  if (q.error) return <ErrorState error={q.error} title="Could not load envelope" onRetry={() => void q.refetch()} />
  return (
    <div data-testid="voltage-envelope-chart" data-y-min={range?.min} data-y-max={range?.max}>
      <EChart option={option} height={400} />
    </div>
  )
}
