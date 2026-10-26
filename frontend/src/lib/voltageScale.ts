/**
 * User-defined four-point voltage colour scale `[fullUnder, bandLow, bandHigh, fullOver]` (pu):
 * a neutral band between `bandLow` and `bandHigh`, ramps to full blue at `fullUnder` and full red at
 * `fullOver`. Stored per browser in localStorage; applies to every run.
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { ChartTheme } from '../components/charts/theme'
import { mix } from '../components/charts/theme'

export type VoltageScale = readonly [fullUnder: number, bandLow: number, bandHigh: number, fullOver: number]

export const DEFAULT_VOLTAGE_SCALE: VoltageScale = [0.9, 0.95, 1.05, 1.1]
export const SCALE_MIN_PU = 0.5
export const SCALE_MAX_PU = 1.5
/** Tint just outside the band, so crossing a band edge is visible. */
export const EDGE_TINT = 0.28
export const VOLTAGE_SCALE_KEY = 'gridsim.voltageScale.v1'

/** Error message for an invalid scale, or null when it is valid. */
export function validateScale(s: readonly unknown[] | null | undefined): string | null {
  if (!Array.isArray(s) || s.length !== 4) return 'Enter four values.'
  if (!s.every((v) => typeof v === 'number' && Number.isFinite(v))) return 'Enter four numbers.'
  const v = s as number[]
  if (v.some((x) => x < SCALE_MIN_PU || x > SCALE_MAX_PU)) return `Values must be between ${SCALE_MIN_PU} and ${SCALE_MAX_PU} pu.`
  for (let i = 1; i < 4; i++) if (!(v[i] > v[i - 1])) return 'Values must be strictly ascending.'
  return null
}

/** Node colour for voltage `u` (pu): neutral within the band, ramps outside it, axis colour when missing. */
export function voltageColor(u: number | null | undefined, scale: VoltageScale, theme: ChartTheme): string {
  if (u === null || u === undefined || Number.isNaN(u)) return theme.axis
  const [fullUnder, bandLow, bandHigh, fullOver] = scale
  if (u >= bandLow && u <= bandHigh) return theme.voltMid
  if (u < bandLow) {
    if (u <= fullUnder) return theme.voltUnder
    return mix(theme.voltMid, theme.voltUnder, EDGE_TINT + (1 - EDGE_TINT) * ((bandLow - u) / (bandLow - fullUnder)))
  }
  if (u >= fullOver) return theme.voltOver
  return mix(theme.voltMid, theme.voltOver, EDGE_TINT + (1 - EDGE_TINT) * ((u - bandHigh) / (fullOver - bandHigh)))
}

/** Set the band to the run's limits, keeping the current gaps to the outer values. */
export function matchLimits(scale: VoltageScale, uMin: number, uMax: number): VoltageScale {
  const [fu, lo, hi, fo] = scale
  const r = (x: number) => Math.round(x * 1e4) / 1e4
  return [r(uMin - (lo - fu)), r(uMin), r(uMax), r(uMax + (fo - hi))]
}

/** Read the stored scale; the defaults on anything missing, unreadable or invalid. */
export function loadScale(storage: Pick<Storage, 'getItem'> | null | undefined = safeStorage()): VoltageScale {
  try {
    const raw = storage?.getItem(VOLTAGE_SCALE_KEY)
    if (!raw) return DEFAULT_VOLTAGE_SCALE
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) && validateScale(v) === null ? (v as unknown as VoltageScale) : DEFAULT_VOLTAGE_SCALE
  } catch {
    return DEFAULT_VOLTAGE_SCALE
  }
}

export function saveScale(scale: VoltageScale, storage: Pick<Storage, 'setItem'> | null | undefined = safeStorage()) {
  try {
    storage?.setItem(VOLTAGE_SCALE_KEY, JSON.stringify(scale))
  } catch {
    // storage blocked or full: the setting still applies for this page
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

// one shared store, so the legend, popover and diagram all update together
let current: VoltageScale | null = null
const listeners = new Set<() => void>()

function get(): VoltageScale {
  return (current ??= loadScale())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== VOLTAGE_SCALE_KEY) return
    current = loadScale()
    cb()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

/** Apply and store a scale; returns false (and changes nothing) when it is invalid. */
export function setVoltageScale(scale: VoltageScale): boolean {
  if (validateScale(scale) !== null) return false
  const s = get()
  if (s.every((x, i) => x === scale[i])) return true
  current = [...scale] as unknown as VoltageScale
  saveScale(current)
  listeners.forEach((l) => l())
  return true
}

/** The browser's voltage colour scale and a setter (invalid scales are ignored). */
export function useVoltageScale(): [VoltageScale, (s: VoltageScale) => boolean] {
  const scale = useSyncExternalStore(subscribe, get, () => DEFAULT_VOLTAGE_SCALE)
  const set = useCallback((s: VoltageScale) => setVoltageScale(s), [])
  return [scale, set]
}

/** Test hook: forget the in-memory value so the next read comes from storage. */
export function resetVoltageScaleStore() {
  current = null
}
