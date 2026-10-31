import { describe, expect, it } from 'vitest'
import { axisRangeWithLimits, fmtLimitPct, fmtLimitPu, loadingLimitLines, seriesExtent, voltageLimitLines } from './limitLines'

describe('axisRangeWithLimits', () => {
  it('widens the range to limits outside the data', () => {
    const r = axisRangeWithLimits(0.97, 1.04, [0.9, 1.1])!
    expect(r.min).toBeLessThan(0.9)
    expect(r.max).toBeGreaterThan(1.1)
    expect(r.min).toBeCloseTo(0.9 - 0.2 * 0.05, 9)
    expect(r.max).toBeCloseTo(1.1 + 0.2 * 0.05, 9)
  })

  it('keeps the data range (plus padding) when limits are inside it', () => {
    const r = axisRangeWithLimits(0.8, 1.2, [0.9, 1.1])!
    expect(r.min).toBeCloseTo(0.8 - 0.4 * 0.05, 9)
    expect(r.max).toBeCloseTo(1.2 + 0.4 * 0.05, 9)
  })

  it('covers a one-sided limit (loading)', () => {
    const r = axisRangeWithLimits(0.1, 0.4, [1])!
    expect(r.min).toBeLessThan(0.1)
    expect(r.max).toBeGreaterThan(1)
  })

  it('uses the limits alone when there is no data', () => {
    const r = axisRangeWithLimits(null, null, [0.95, 1.05])!
    expect(r.min).toBeLessThan(0.95)
    expect(r.max).toBeGreaterThan(1.05)
  })

  it('returns null (auto) with no data and no limits', () => {
    expect(axisRangeWithLimits(null, undefined, [])).toBeNull()
    expect(axisRangeWithLimits(NaN, Infinity, [])).toBeNull()
  })

  it('pads a flat range', () => {
    const r = axisRangeWithLimits(null, null, [1])!
    expect(r.min).toBeLessThan(1)
    expect(r.max).toBeGreaterThan(1)
  })
})

describe('seriesExtent', () => {
  it('ignores nulls across series', () => {
    expect(seriesExtent([[null, 1.01, 0.98], [1.03, null]])).toEqual({ min: 0.98, max: 1.03 })
  })
  it('is null for empty or all-null data', () => {
    expect(seriesExtent([])).toEqual({ min: null, max: null })
    expect(seriesExtent([[null, null]])).toEqual({ min: null, max: null })
  })
})

describe('limit labels', () => {
  it('formats pu with 2–3 decimals and loading as %', () => {
    expect(fmtLimitPu(0.9)).toBe('0.90')
    expect(fmtLimitPu(1.1)).toBe('1.10')
    expect(fmtLimitPu(0.955)).toBe('0.955')
    expect(fmtLimitPct(1)).toBe('100%')
    expect(fmtLimitPct(0.825)).toBe('82.5%')
    expect(voltageLimitLines({ u_min_pu: 0.9, u_max_pu: 1.1 }).map((l) => l.label)).toEqual(['u_min 0.90', 'u_max 1.10'])
    expect(loadingLimitLines({ loading_max: 1 })).toEqual([{ value: 1, label: 'limit 100%' }])
  })
})
