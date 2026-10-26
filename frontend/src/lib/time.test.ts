import { describe, expect, it } from 'vitest'
import { applyDurationPreset, computeTimesteps, DURATION_PRESETS, fromDatetimeLocal, parseNaive, toDatetimeLocal, toNaive } from './time'

describe('computeTimesteps', () => {
  it('counts start..end with end excluded', () => {
    expect(computeTimesteps({ start: '2026-07-01T00:00:00', end: '2026-07-08T00:00:00', resolution_minutes: 15 })).toBe(672)
    expect(computeTimesteps({ start: '2026-07-01T00:00:00', end: '2026-07-02T00:00:00', resolution_minutes: 60 })).toBe(24)
  })

  it('rounds up a partial last interval', () => {
    expect(computeTimesteps({ start: '2026-07-01T00:00:00', end: '2026-07-01T00:20:00', resolution_minutes: 15 })).toBe(2)
  })

  it('returns 0 for empty, inverted or invalid windows', () => {
    expect(computeTimesteps({ start: '2026-07-01T00:00:00', end: '2026-07-01T00:00:00', resolution_minutes: 15 })).toBe(0)
    expect(computeTimesteps({ start: '2026-07-02T00:00:00', end: '2026-07-01T00:00:00', resolution_minutes: 15 })).toBe(0)
    expect(computeTimesteps({ start: 'nope', end: '2026-07-01T00:00:00', resolution_minutes: 15 })).toBe(0)
    expect(computeTimesteps({ start: '2026-07-01T00:00:00', end: '2026-07-02T00:00:00', resolution_minutes: 0 })).toBe(0)
  })

  it('ignores DST shifts (naive wall-clock time)', () => {
    // a full year at 15 min is always 365 * 96 for a non-leap year
    expect(computeTimesteps({ start: '2027-01-01T00:00:00', end: '2028-01-01T00:00:00', resolution_minutes: 15 })).toBe(35040)
  })
})

describe('naive timestamp helpers', () => {
  it('round-trips through datetime-local', () => {
    expect(toDatetimeLocal('2026-07-01T13:45:00')).toBe('2026-07-01T13:45')
    expect(fromDatetimeLocal('2026-07-01T13:45')).toBe('2026-07-01T13:45:00')
    expect(toNaive(parseNaive('2026-12-31T23:59:59'))).toBe('2026-12-31T23:59:59')
  })

  it('applies duration presets from the start', () => {
    const t = { start: '2026-01-31T00:00:00', end: '2026-02-01T00:00:00', resolution_minutes: 60 }
    const week = DURATION_PRESETS.find((p) => p.id === '1w')!
    const year = DURATION_PRESETS.find((p) => p.id === '1y')!
    expect(applyDurationPreset(t, week).end).toBe('2026-02-07T00:00:00')
    expect(applyDurationPreset(t, year).end).toBe('2027-01-31T00:00:00')
  })
})
