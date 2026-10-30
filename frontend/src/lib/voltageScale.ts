/**
 * Voltage colour scale for the network snapshot, defined by the run's frozen case limits:
 * `u_min` blue - midpoint teal - 1.0 pu green - midpoint yellow - `u_max` red, piecewise-linear, flat beyond the limits.
 */
import type { Limits } from '../api/schema'
import type { ChartTheme } from '../components/charts/theme'
import { mix } from '../components/charts/theme'

export type VoltageLimits = Pick<Limits, 'u_min_pu' | 'u_max_pu'>
export interface VoltageStop {
  /** Voltage in pu. */
  u: number
  color: string
}

/** Removed per-browser override (see SNAP-10); cleared once so no stale value lingers. */
const OBSOLETE_KEY = 'gridsim.voltageScale.v1'
try {
  if (typeof window !== 'undefined') window.localStorage.removeItem(OBSOLETE_KEY)
} catch {
  // storage blocked: nothing to clean up
}

/**
 * The five stops (ascending pu). The green stop is 1.0 pu, clamped into the limits: when 1.0 is not strictly inside
 * (u_min, u_max) it moves to the midpoint of the limits so the stops stay ordered.
 */
export function voltageStops(limits: VoltageLimits, theme: ChartTheme): VoltageStop[] {
  const lo = limits.u_min_pu
  const hi = limits.u_max_pu
  const nominal = lo < 1 && 1 < hi ? 1 : (lo + hi) / 2
  return [
    { u: lo, color: theme.voltLow },
    { u: (lo + nominal) / 2, color: theme.voltLowMid },
    { u: nominal, color: theme.voltNominal },
    { u: (nominal + hi) / 2, color: theme.voltHighMid },
    { u: hi, color: theme.voltHigh },
  ]
}

/** Node colour for voltage `u` (pu); the axis colour when missing. */
export function voltageColor(u: number | null | undefined, limits: VoltageLimits, theme: ChartTheme): string {
  if (u === null || u === undefined || Number.isNaN(u)) return theme.axis
  const stops = voltageStops(limits, theme)
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (!(Number.isFinite(first.u) && Number.isFinite(last.u))) return theme.axis
  if (u <= first.u) return first.color
  if (u >= last.u) return last.color
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]
    const b = stops[i]
    if (u <= b.u) return b.u > a.u ? mix(a.color, b.color, (u - a.u) / (b.u - a.u)) : b.color
  }
  return last.color
}
