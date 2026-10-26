/** Pure helpers for the snapshot clock and the daylight-shaded time slider. */
import { daylight } from '../../lib/solar'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** Above this many calendar days the slider shows month dividers instead of per-day bands. */
export const MAX_DAY_BANDS = 31
/** Minimum px per day (or month) before labels are drawn under the track. */
export const MIN_LABEL_PX = 28

/** "HH:MM", "Sun 5 Jul 2026" and the clock hour for a timestamp (local wall-clock time). */
export function clockLabels(ms: number): { time: string; date: string; hour: number } {
  const d = new Date(ms)
  return {
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    date: `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    hour: d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600,
  }
}

const midnight = (d: Date, plusDays = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDays)

/** Local midnights of every calendar day from start's day through end's day. */
function calendarDays(startMs: number, endMs: number): Date[] {
  const out: Date[] = []
  for (let d = midnight(new Date(startMs)); d.getTime() <= endMs && out.length < 50_000; d = midnight(d, 1)) out.push(d)
  return out
}

export type TrackMode = 'days' | 'months'

export interface Segment {
  /** Fractions 0–1 of the slider's usable width (first to last timestep). */
  x0: number
  x1: number
}

export interface TrackLayout {
  mode: TrackMode
  /** Daylight intervals (days mode). */
  daylight: Segment[]
  /** Day (days mode) or month (months mode) boundaries. */
  dividers: number[]
  /** Weekday (days mode) or month name (months mode) label spans. */
  labels: (Segment & { text: string })[]
  /** Months mode: mean daylight length per month as a 0–1 fraction of the day, for a subtle seasonal shade. */
  shade: (Segment & { level: number })[]
  /** Calendar days spanned. */
  nDays: number
}

/**
 * Slider track layout for timesteps start, start+step, …, start+(n−1)·step. Position 0 is the first timestep and
 * 1 the last, matching the range input's thumb positions. Per-day bands up to 31 calendar days, months beyond.
 */
export function trackLayout(startMs: number, stepMs: number, n: number, latitude: number, solarNoon: number): TrackLayout {
  const endMs = startMs + Math.max(0, n - 1) * stepMs
  const span = Math.max(1, endMs - startMs)
  const fx = (ms: number) => Math.min(1, Math.max(0, (ms - startMs) / span))
  const days = calendarDays(startMs, endMs)
  const mode: TrackMode = days.length > MAX_DAY_BANDS ? 'months' : 'days'
  const out: TrackLayout = { mode, daylight: [], dividers: [], labels: [], shade: [], nDays: days.length }

  if (mode === 'days') {
    for (const d of days) {
      const t0 = d.getTime()
      if (t0 > startMs) out.dividers.push(fx(t0))
      const label = { x0: fx(t0), x1: fx(midnight(d, 1).getTime()), text: WEEKDAYS[d.getDay()] }
      if (label.x1 > label.x0) out.labels.push(label)
      const dl = daylight(d, latitude, solarNoon)
      if (dl.sunrise === null || dl.sunset === null) continue
      const at = (h: number) => t0 + h * 3_600_000
      const seg = { x0: fx(at(dl.sunrise)), x1: fx(at(dl.sunset)) }
      if (seg.x1 > seg.x0) out.daylight.push(seg)
    }
    return out
  }

  const months: { first: Date; last: Date; hours: number }[] = []
  for (const d of days) {
    const cur = months[months.length - 1]
    const h = daylight(d, latitude, solarNoon).hours
    if (cur && d.getDate() !== 1) {
      cur.last = d
      cur.hours += h
    } else months.push({ first: d, last: d, hours: h })
  }
  for (const m of months) {
    const nd = Math.round((midnight(m.last, 1).getTime() - m.first.getTime()) / 86_400_000)
    const seg = { x0: fx(m.first.getTime()), x1: fx(midnight(m.last, 1).getTime()) }
    if (m.first.getTime() > startMs) out.dividers.push(seg.x0)
    if (seg.x1 <= seg.x0) continue
    out.labels.push({ ...seg, text: MONTHS[m.first.getMonth()] })
    out.shade.push({ ...seg, level: m.hours / Math.max(1, nd) / 24 })
  }
  return out
}
