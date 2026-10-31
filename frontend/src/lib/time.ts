/**
 * Time helpers. The API uses naive ISO timestamps ("2026-07-01T00:00:00") that we
 * treat as local wall-clock time everywhere (no timezone conversion).
 */
import type { TimeSettings } from '../api/schema'

export const MAX_TIMESTEPS = 100_000
export const RESOLUTION_PRESETS = [5, 15, 30, 60] as const

/** Parse a naive ISO timestamp as local time. Returns NaN-date for invalid input. */
export function parseNaive(ts: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(ts.trim())
  if (!m) return new Date(NaN)
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Format a Date as a naive ISO timestamp with seconds. */
export function toNaive(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`
}

/** naive ISO -> value for <input type="datetime-local"> (minute precision). */
export function toDatetimeLocal(ts: string): string {
  const d = parseNaive(ts)
  if (Number.isNaN(d.getTime())) return ''
  return toNaive(d).slice(0, 16)
}

/** <input type="datetime-local"> value -> naive ISO with seconds. */
export function fromDatetimeLocal(v: string): string {
  if (!v) return ''
  return v.length === 16 ? `${v}:00` : v
}

/**
 * Number of timesteps for a time window: start, start+res, ... with end excluded.
 * Wall-clock difference is used (DST-agnostic, matching naive timestamps).
 * Returns 0 for invalid / empty windows.
 */
export function computeTimesteps(time: TimeSettings): number {
  const start = parseNaive(time.start)
  const end = parseNaive(time.end)
  const res = time.resolution_minutes
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  if (!Number.isFinite(res) || res <= 0) return 0
  const minutes = wallClockMinutes(end) - wallClockMinutes(start)
  if (minutes <= 0) return 0
  return Math.ceil(minutes / res)
}

/** Minutes since epoch treating the date's local fields as UTC (ignores DST shifts). */
function wallClockMinutes(d: Date): number {
  return (
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 60000
  )
}

export type DurationPreset = { id: string; label: string; apply: (start: Date) => Date }

export const DURATION_PRESETS: DurationPreset[] = [
  { id: '1d', label: '1 day', apply: (s) => addDays(s, 1) },
  { id: '1w', label: '1 week', apply: (s) => addDays(s, 7) },
  { id: '1m', label: '1 month', apply: (s) => new Date(s.getFullYear(), s.getMonth() + 1, s.getDate(), s.getHours(), s.getMinutes()) },
  { id: '1y', label: '1 year', apply: (s) => new Date(s.getFullYear() + 1, s.getMonth(), s.getDate(), s.getHours(), s.getMinutes()) },
]

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds())
}

/** Apply a duration preset: keep start, compute end. */
export function applyDurationPreset(time: TimeSettings, preset: DurationPreset): TimeSettings {
  const start = parseNaive(time.start)
  if (Number.isNaN(start.getTime())) return time
  return { ...time, end: toNaive(preset.apply(start)) }
}

/** Human readable duration of a time window, e.g. "7 d" or "36 h". */
export function describeWindow(time: TimeSettings): string {
  const start = parseNaive(time.start)
  const end = parseNaive(time.end)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—'
  const minutes = wallClockMinutes(end) - wallClockMinutes(start)
  if (minutes <= 0) return '—'
  const days = minutes / 1440
  if (days >= 2) return `${+days.toFixed(1)} d`
  const hours = minutes / 60
  if (hours >= 1) return `${+hours.toFixed(1)} h`
  return `${minutes} min`
}

export function formatResolution(min: number): string {
  if (min % 60 === 0) return `${min / 60} h`
  return `${min} min`
}
