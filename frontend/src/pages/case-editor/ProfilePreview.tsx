import type { EChartsOption } from 'echarts'
import { LineChart } from 'lucide-react'
import { useMemo } from 'react'
import { useProfilePreview } from '../../api/hooks'
import type { ProfilePreviewRequest, TimeSettings } from '../../api/schema'
import { EChart } from '../../components/charts/EChart'
import { baseOption, timeAxis, useChartTheme, valueAxis } from '../../components/charts/theme'
import { ErrorState, Spinner } from '../../components/ui'
import { toDate } from '../../lib/format'
import { useDebounced } from '../../lib/utils'
import { PREVIEW_DAYS, previewWindow } from './profileUtils'

export function ProfilePreview({
  generator,
  params,
  factor = 1,
  time,
  enabled = true,
}: {
  generator: string
  params: Record<string, unknown>
  /** applied client-side so changing it doesn't refetch */
  factor?: number
  time: TimeSettings
  enabled?: boolean
}) {
  const theme = useChartTheme()
  const { start, end, resolution_minutes } = time
  const { time: win, clipped } = useMemo(
    () => previewWindow({ start, end, resolution_minutes }),
    [start, end, resolution_minutes],
  )
  const req = useMemo<ProfilePreviewRequest | null>(
    () => (generator && enabled ? { generator, params, time: win, n_elements: 3 } : null),
    [generator, params, win, enabled],
  )
  const debounced = useDebounced(req, 450)
  const q = useProfilePreview(debounced)

  const option = useMemo<EChartsOption>(() => {
    const d = q.data
    const ts = d?.timestamps.map((t) => toDate(t).getTime()) ?? []
    return {
      ...baseOption(theme),
      grid: { left: 44, right: 12, top: 28, bottom: 24 },
      legend: { ...baseOption(theme).legend, top: 0, right: 0 },
      tooltip: {
        ...baseOption(theme).tooltip,
        trigger: 'axis',
        valueFormatter: (v) => (typeof v === 'number' ? v.toFixed(3) : String(v)),
      },
      xAxis: timeAxis(theme),
      yAxis: valueAxis(theme, { name: 'multiplier', scale: false }),
      series: (d?.series ?? []).map((s, i) => ({
        type: 'line',
        name: `Sample ${i + 1}`,
        showSymbol: false,
        lineStyle: { width: 1.5 },
        sampling: 'lttb',
        data: s.map((v, j) => [ts[j], v === null ? null : v * factor]),
      })),
    }
  }, [q.data, theme, factor])

  if (!generator) return null
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <div className="mb-1 flex items-center justify-between text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5 font-medium text-fg-2">
          <LineChart size={13} /> Preview {clipped && <span className="font-normal text-fg-muted">(first {PREVIEW_DAYS} days)</span>}
        </span>
        {(q.isFetching || req !== debounced) && <Spinner size={12} />}
      </div>
      {q.error ? (
        <ErrorState error={q.error} title="Preview failed" />
      ) : (
        <EChart option={option} height={180} loading={q.isLoading && !q.data} />
      )}
    </div>
  )
}
