import { useSyncExternalStore } from 'react'

/** Colors read from the CSS design tokens (index.css), so charts follow light/dark mode. */
export interface ChartTheme {
  dark: boolean
  bg: string
  surface: string
  fg: string
  fg2: string
  muted: string
  grid: string
  axis: string
  border: string
  accent: string
  good: string
  warn: string
  bad: string
  series: string[]
  /** Voltage colour scale (lib/voltageScale): under the band (blue), within it (neutral), over it (red). */
  voltUnder: string
  voltMid: string
  voltOver: string
}

const FALLBACK: ChartTheme = {
  dark: false,
  bg: '#f6f6f4',
  surface: '#ffffff',
  fg: '#111110',
  fg2: '#52514e',
  muted: '#898781',
  grid: '#e8e7e1',
  axis: '#c3c2b7',
  border: '#e3e2dc',
  accent: '#2a78d6',
  good: '#0a7d0a',
  warn: '#a86a00',
  bad: '#c43030',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  voltUnder: '#2a78d6',
  voltMid: '#f4f3ef',
  voltOver: '#d03b3b',
}

function read(): ChartTheme {
  if (typeof window === 'undefined' || typeof getComputedStyle === 'undefined') return FALLBACK
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb
  return {
    dark: cs.colorScheme === 'dark' || matchMedia?.('(prefers-color-scheme: dark)').matches === true,
    bg: v('--c-bg', FALLBACK.bg),
    surface: v('--c-surface', FALLBACK.surface),
    fg: v('--c-fg', FALLBACK.fg),
    fg2: v('--c-fg-2', FALLBACK.fg2),
    muted: v('--c-fg-muted', FALLBACK.muted),
    grid: v('--c-chart-grid', FALLBACK.grid),
    axis: v('--c-chart-axis', FALLBACK.axis),
    border: v('--c-border', FALLBACK.border),
    accent: v('--c-accent', FALLBACK.accent),
    good: v('--c-good', FALLBACK.good),
    warn: v('--c-warn', FALLBACK.warn),
    bad: v('--c-bad', FALLBACK.bad),
    series: FALLBACK.series.map((fb, i) => v(`--c-series-${i + 1}`, fb)),
    voltUnder: v('--c-volt-under', FALLBACK.voltUnder),
    voltMid: v('--c-volt-mid', FALLBACK.voltMid),
    voltOver: v('--c-volt-over', FALLBACK.voltOver),
  }
}

let cached: ChartTheme | null = null
let cachedKey = ''

function snapshot(): ChartTheme {
  const key =
    typeof window !== 'undefined' && window.matchMedia
      ? `${window.matchMedia('(prefers-color-scheme: dark)').matches}|${document.documentElement.dataset.theme ?? ''}`
      : 'ssr'
  if (!cached || key !== cachedKey) {
    cached = read()
    cachedKey = key
  }
  return cached
}

function subscribe(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function useChartTheme(): ChartTheme {
  return useSyncExternalStore(subscribe, snapshot, () => FALLBACK)
}

/** Shared ECharts base option pieces. */
export function baseOption(t: ChartTheme) {
  return {
    backgroundColor: 'transparent',
    color: t.series,
    textStyle: { color: t.fg2, fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 12 },
    animationDuration: 300,
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      textStyle: { color: t.fg, fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 8px;',
    },
    legend: {
      textStyle: { color: t.fg2, fontSize: 12 },
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
      inactiveColor: t.axis,
    },
  }
}

export function timeAxis(t: ChartTheme) {
  return {
    type: 'time' as const,
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { show: false },
    axisLabel: { color: t.muted, hideOverlap: true },
    splitLine: { show: false },
  }
}

export function valueAxis(t: ChartTheme, extra: Record<string, unknown> = {}) {
  return {
    type: 'value' as const,
    scale: true,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.muted },
    splitLine: { lineStyle: { color: t.grid } },
    nameTextStyle: { color: t.muted, align: 'left' as const },
    ...extra,
  }
}

export function dataZoom(t: ChartTheme) {
  return [
    { type: 'inside' as const, throttle: 50 },
    {
      type: 'slider' as const,
      height: 22,
      bottom: 8,
      borderColor: t.border,
      backgroundColor: 'transparent',
      fillerColor: t.dark ? 'rgba(57,135,229,0.18)' : 'rgba(42,120,214,0.12)',
      dataBackground: { lineStyle: { color: t.axis }, areaStyle: { color: t.grid } },
      selectedDataBackground: { lineStyle: { color: t.accent }, areaStyle: { color: t.accent, opacity: 0.15 } },
      handleStyle: { color: t.surface, borderColor: t.axis },
      moveHandleStyle: { color: t.axis },
      textStyle: { color: t.muted },
      labelFormatter: '',
    },
  ]
}

/** Interpolate between two hex colours. */
export function mix(a: string, b: string, f: number): string {
  const pa = hex(a)
  const pb = hex(b)
  if (!pa || !pb) return f < 0.5 ? a : b
  const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * Math.max(0, Math.min(1, f))))
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

function hex(s: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
