import type { Limits } from '../api/schema'

export interface LimitLine {
  value: number
  label: string
}

export interface AxisRange {
  min: number
  max: number
}

/**
 * Value-axis range that covers the data and every limit, padded by `padFrac` of the span.
 * ECharts does not widen an auto-fit axis for markLines, so limits outside the data would
 * not be drawn. Nulls / non-finite values are ignored. Returns null when there is nothing
 * to fit (no data and no limits), meaning "keep the axis on auto".
 */
export function axisRangeWithLimits(
  dataMin: number | null | undefined,
  dataMax: number | null | undefined,
  limits: readonly number[],
  padFrac = 0.05,
): AxisRange | null {
  const vals = [dataMin, dataMax, ...limits].filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!vals.length) return null
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo
  // A flat range (single value) still gets some room: pad by a fraction of its magnitude.
  const pad = span > 0 ? span * padFrac : Math.abs(lo) * padFrac || padFrac
  return { min: lo - pad, max: hi + pad }
}

/** Min and max over several series, ignoring nulls. Nulls when there is no finite value. */
export function seriesExtent(series: readonly (readonly (number | null)[])[]): { min: number | null; max: number | null } {
  let min = Infinity
  let max = -Infinity
  for (const s of series)
    for (const v of s)
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (v < min) min = v
        if (v > max) max = v
      }
  return min <= max ? { min, max } : { min: null, max: null }
}

/** pu with 2 decimals, or 3 when needed (0.90, 1.10, 0.955). */
export function fmtLimitPu(v: number): string {
  const two = v.toFixed(2)
  return Math.abs(+two - v) < 1e-9 ? two : v.toFixed(3)
}

/** Loading fraction as a whole percentage, or one decimal when needed (100%, 82.5%). */
export function fmtLimitPct(v: number): string {
  const p = v * 100
  return Math.abs(p - Math.round(p)) < 1e-9 ? `${Math.round(p)}%` : `${p.toFixed(1)}%`
}

/** Voltage limit lines with the value in the label: "u_min 0.90", "u_max 1.10". */
export function voltageLimitLines(limits: Pick<Limits, 'u_min_pu' | 'u_max_pu'>): LimitLine[] {
  return [
    { value: limits.u_min_pu, label: `u_min ${fmtLimitPu(limits.u_min_pu)}` },
    { value: limits.u_max_pu, label: `u_max ${fmtLimitPu(limits.u_max_pu)}` },
  ]
}

/** Loading limit line with the value in the label: "limit 100%". */
export function loadingLimitLines(limits: Pick<Limits, 'loading_max'>): LimitLine[] {
  return [{ value: limits.loading_max, label: `limit ${fmtLimitPct(limits.loading_max)}` }]
}
