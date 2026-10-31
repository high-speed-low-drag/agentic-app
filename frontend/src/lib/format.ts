/** Number / date formatting used across the UI. */
import { parseNaive } from './time'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export const DASH = '—'

/** Per-unit values, 3 decimals. */
export function fmtPu(v: number | null | undefined, digits = 3): string {
  return isNum(v) ? v.toFixed(digits) : DASH
}

/** Loading fraction (0.83) -> "83.0 %". */
export function fmtPct(v: number | null | undefined, digits = 1): string {
  return isNum(v) ? `${(v * 100).toFixed(digits)} %` : DASH
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return DASH
  return v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

export function fmtInt(v: number | null | undefined): string {
  return isNum(v) ? Math.round(v).toLocaleString() : DASH
}

export function fmtMwh(v: number | null | undefined): string {
  if (!isNum(v)) return DASH
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} GWh`
  return `${v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 10 ? 3 : 1 })} MWh`
}

/** Power in W -> auto-scaled kW / MW string. */
export function fmtPowerW(v: number | null | undefined): string {
  if (!isNum(v)) return DASH
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toLocaleString(undefined, { maximumFractionDigits: 3 })} MW`
  if (a >= 1e3) return `${(v / 1e3).toLocaleString(undefined, { maximumFractionDigits: 2 })} kW`
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} W`
}

/** Reactive power in var. */
export function fmtVar(v: number | null | undefined): string {
  return fmtPowerW(v).replace(/W$/, 'var')
}

/** Voltage in V -> kV. */
export function fmtKv(v: number | null | undefined): string {
  if (!isNum(v)) return DASH
  return `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} kV`
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (!isNum(seconds)) return DASH
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m < 60) return `${m} m ${s} s`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} m`
}

const dtf = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const df = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

/** Format a naive (or offset) ISO timestamp for display. */
export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return DASH
  const d = toDate(ts)
  return Number.isNaN(d.getTime()) ? ts : dtf.format(d)
}

export function fmtDate(ts: string | null | undefined): string {
  if (!ts) return DASH
  const d = toDate(ts)
  return Number.isNaN(d.getTime()) ? ts : df.format(d)
}

/** Relative "3 min ago" for recent timestamps, absolute otherwise. */
export function fmtRelative(ts: string | null | undefined, now = Date.now()): string {
  if (!ts) return DASH
  const d = toDate(ts)
  if (Number.isNaN(d.getTime())) return ts
  const diff = (now - d.getTime()) / 1000
  if (diff < 0) return fmtDateTime(ts)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d ago`
  return fmtDate(ts)
}

/** Timestamps with an explicit offset / Z are parsed natively, naive ones as local time. */
export function toDate(ts: string): Date {
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(ts)) return new Date(ts)
  return parseNaive(ts)
}

/** Format a value for a given result unit. */
export function fmtUnit(v: number | null | undefined, unit: string): string {
  if (!isNum(v)) return DASH
  switch (unit) {
    case 'pu':
      return fmtPu(v)
    case 'W':
      return fmtPowerW(v)
    case 'var':
      return fmtVar(v)
    case 'VA':
      return fmtPowerW(v).replace(/W$/, 'VA')
    case 'V':
      return fmtKv(v)
    case 'A':
      return `${fmtNum(v, 1)} A`
    case 'rad':
      return `${fmtNum((v * 180) / Math.PI, 2)}°`
    case '-':
    case '':
      return fmtNum(v, 3)
    default:
      return `${fmtNum(v, 3)} ${unit}`
  }
}

/** Human labels for result fields. */
export const FIELD_LABELS: Record<string, string> = {
  u_pu: 'Voltage',
  u: 'Voltage',
  u_angle: 'Voltage angle',
  p: 'Active power',
  q: 'Reactive power',
  i: 'Current',
  loading: 'Loading',
  p_from: 'P (from side)',
  q_from: 'Q (from side)',
  i_from: 'I (from side)',
  p_to: 'P (to side)',
  q_to: 'Q (to side)',
  i_to: 'I (to side)',
  s_from: 'S (from side)',
}

export const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f

export function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
