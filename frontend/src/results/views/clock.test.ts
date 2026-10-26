import { describe, expect, it } from 'vitest'
import type { ResultSummary } from '../../api/schema'
import { timestepTime } from '../timestamps'
import { clockLabels, MAX_DAY_BANDS, trackLayout } from './clock'

const summary = { timestamps_start: '2026-07-01T00:00:00', resolution_minutes: 15 } as ResultSummary
const STEP = 15 * 60_000

describe('snapshot clock', () => {
  it('formats the time and date of a timestep index', () => {
    expect(clockLabels(timestepTime(summary, 0))).toMatchObject({ time: '00:00', date: 'Wed 1 Jul 2026', hour: 0 })
    expect(clockLabels(timestepTime(summary, 8))).toMatchObject({ time: '02:00', date: 'Wed 1 Jul 2026' })
    expect(clockLabels(timestepTime(summary, 52))).toMatchObject({ time: '13:00', hour: 13 })
    expect(clockLabels(timestepTime(summary, 4 * 24 * 4 + 4 * 21 + 3))).toMatchObject({ time: '21:45', date: 'Sun 5 Jul 2026' })
  })
})

describe('daylight track', () => {
  const start = new Date(2026, 6, 1).getTime()

  it('a week gets one daylight band, one weekday label per day and day dividers', () => {
    const l = trackLayout(start, STEP, 7 * 96, 52, 13.5)
    expect(l.mode).toBe('days')
    expect(l.nDays).toBe(7)
    expect(l.daylight).toHaveLength(7)
    expect(l.dividers).toHaveLength(6)
    expect(l.labels.map((x) => x.text)).toEqual(['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'])
    // first band starts at sunrise of 1 Jul (~05:2x) on a 0..1 scale from the first to the last timestep
    const span = (7 * 96 - 1) * STEP
    expect(l.daylight[0].x0 * span).toBeGreaterThan(5 * 3_600_000)
    expect(l.daylight[0].x0 * span).toBeLessThan(5.5 * 3_600_000)
    expect(l.daylight[0].x1).toBeGreaterThan(l.daylight[0].x0)
  })

  it(`up to ${MAX_DAY_BANDS} days draws per-day bands, beyond that months`, () => {
    expect(trackLayout(new Date(2026, 0, 1).getTime(), STEP, 31 * 96, 52, 13.5).mode).toBe('days')
    const long = trackLayout(new Date(2026, 0, 1).getTime(), STEP, 32 * 96, 52, 13.5)
    expect(long.mode).toBe('months')
    expect(long.daylight).toHaveLength(0)
    expect(long.labels.map((x) => x.text)).toEqual(['Jan', 'Feb'])
    expect(long.dividers).toHaveLength(1)
  })

  it('a year shows 12 months with longer days shaded more in summer', () => {
    const year = trackLayout(new Date(2026, 0, 1).getTime(), 3_600_000, 365 * 24, 52, 13.5)
    expect(year.mode).toBe('months')
    expect(year.labels).toHaveLength(12)
    expect(year.dividers).toHaveLength(11)
    expect(year.shade[5].level).toBeGreaterThan(year.shade[11].level)
  })

  it('polar night has no daylight bands', () => {
    expect(trackLayout(new Date(2026, 11, 20).getTime(), STEP, 2 * 96, 75, 12).daylight).toHaveLength(0)
  })
})
