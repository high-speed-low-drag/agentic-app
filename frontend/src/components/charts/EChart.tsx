import type { ECharts, EChartsOption, SetOptionOpts } from 'echarts'
import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

declare global {
  interface Window {
    /** Dev-only handle for e2e tests: `__gridsimEcharts.getInstanceByDom(el)`. */
    __gridsimEcharts?: typeof echarts
  }
}
if (import.meta.env.DEV && typeof window !== 'undefined') window.__gridsimEcharts = echarts

export type EChartEvents = Record<string, (params: unknown, chart: ECharts) => void>

/** Thin React wrapper around an ECharts instance. */
export function EChart({
  option,
  height = 320,
  className,
  onEvents,
  notMerge = true,
  loading,
  onChart,
}: {
  option: EChartsOption
  height?: number | string
  className?: string
  onEvents?: EChartEvents
  notMerge?: boolean
  loading?: boolean
  onChart?: (chart: ECharts) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const chart = echarts.init(el, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const opts: SetOptionOpts = { notMerge, lazyUpdate: true }
    chart.setOption(option, opts)
    onChart?.(chart)
  }, [option, notMerge, onChart])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !onEvents) return
    const entries = Object.entries(onEvents)
    const handlers = entries.map(([name, fn]) => {
      const h = (p: unknown) => fn(p, chart)
      chart.on(name, h)
      return [name, h] as const
    })
    return () => handlers.forEach(([name, h]) => chart.off(name, h))
  }, [onEvents])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    if (loading) chart.showLoading({ text: '', color: '#2a78d6', maskColor: 'rgba(0,0,0,0)' })
    else chart.hideLoading()
  }, [loading])

  return <div ref={ref} className={cn('w-full', className)} style={{ height }} />
}
