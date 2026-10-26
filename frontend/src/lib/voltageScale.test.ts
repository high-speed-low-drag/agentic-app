import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChartTheme } from '../components/charts/theme'
import {
  DEFAULT_VOLTAGE_SCALE,
  loadScale,
  matchLimits,
  resetVoltageScaleStore,
  saveScale,
  useVoltageScale,
  VOLTAGE_SCALE_KEY,
  validateScale,
  voltageColor,
} from './voltageScale'

const base: Omit<ChartTheme, 'dark' | 'voltUnder' | 'voltMid' | 'voltOver' | 'axis'> = {
  bg: '#f6f6f4',
  surface: '#ffffff',
  fg: '#111110',
  fg2: '#52514e',
  muted: '#898781',
  grid: '#e8e7e1',
  border: '#e3e2dc',
  accent: '#2a78d6',
  good: '#0a7d0a',
  warn: '#a86a00',
  bad: '#c43030',
  series: [],
}

// Token values from index.css, light and dark.
const themes: Record<string, ChartTheme> = {
  light: { ...base, dark: false, axis: '#c3c2b7', voltUnder: '#2a78d6', voltMid: '#f4f3ef', voltOver: '#d03b3b' },
  dark: { ...base, dark: true, axis: '#45443f', voltUnder: '#3987e5', voltMid: '#2a2a28', voltOver: '#e66767' },
}

const rgb = (s: string) => {
  const n = parseInt(s.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
/** How blue / red a colour reads: that channel minus the other two's mean. */
const blueness = (s: string) => {
  const c = rgb(s)
  return c.b - (c.r + c.g) / 2
}
const redness = (s: string) => {
  const c = rgb(s)
  return c.r - (c.g + c.b) / 2
}

const S = DEFAULT_VOLTAGE_SCALE

describe.each(Object.entries(themes))('voltageColor (%s)', (_name, theme) => {
  it('is exactly neutral within the band', () => {
    expect(voltageColor(1.0, S, theme)).toBe(theme.voltMid)
    expect(voltageColor(1.04, S, theme)).toBe(theme.voltMid)
    expect(voltageColor(0.95, S, theme)).toBe(theme.voltMid)
    expect(voltageColor(1.05, S, theme)).toBe(theme.voltMid)
  })

  it('is partial blue between full-under and the band', () => {
    const c = voltageColor(0.93, S, theme)
    expect(blueness(c)).toBeGreaterThan(blueness(theme.voltMid))
    expect(blueness(c)).toBeLessThan(blueness(theme.voltUnder))
    if (theme.dark) expect(rgb(c).b).toBeGreaterThan(rgb(theme.voltMid).b)
  })

  it('shows a visible tint just outside the band', () => {
    const c = voltageColor(0.9499, S, theme)
    const f = (blueness(c) - blueness(theme.voltMid)) / (blueness(theme.voltUnder) - blueness(theme.voltMid))
    expect(f).toBeGreaterThan(0.2)
    expect(f).toBeLessThan(0.35)
  })

  it('is full blue beyond full-under, partial / full red above the band', () => {
    expect(voltageColor(0.88, S, theme)).toBe(theme.voltUnder)
    expect(voltageColor(0.9, S, theme)).toBe(theme.voltUnder)
    const p = voltageColor(1.07, S, theme)
    expect(redness(p)).toBeGreaterThan(redness(theme.voltMid))
    expect(redness(p)).toBeLessThan(redness(theme.voltOver))
    expect(voltageColor(1.12, S, theme)).toBe(theme.voltOver)
  })

  it('uses the axis colour for missing values', () => {
    expect(voltageColor(null, S, theme)).toBe(theme.axis)
    expect(voltageColor(undefined, S, theme)).toBe(theme.axis)
    expect(voltageColor(NaN, S, theme)).toBe(theme.axis)
  })

  it('follows a custom band', () => {
    expect(voltageColor(1.09, [0.9, 0.95, 1.1, 1.15], theme)).toBe(theme.voltMid)
    expect(voltageColor(1.09, S, theme)).not.toBe(theme.voltMid)
  })
})

describe('validateScale', () => {
  it('accepts the defaults', () => expect(validateScale(DEFAULT_VOLTAGE_SCALE)).toBeNull())
  it('rejects non-ascending values', () => {
    expect(validateScale([0.9, 0.95, 0.95, 1.1])).toMatch(/ascending/)
    expect(validateScale([0.9, 1.0, 0.98, 1.1])).toMatch(/ascending/)
  })
  it('rejects out-of-range and non-finite values', () => {
    expect(validateScale([0.4, 0.95, 1.05, 1.1])).toMatch(/between/)
    expect(validateScale([0.9, 0.95, 1.05, 1.6])).toMatch(/between/)
    expect(validateScale([0.9, NaN, 1.05, 1.1])).not.toBeNull()
    expect(validateScale([0.9, 0.95, 1.05])).not.toBeNull()
  })
})

describe('matchLimits', () => {
  it('sets the band and keeps the outer gaps', () => {
    expect(matchLimits([0.9, 0.95, 1.05, 1.1], 0.97, 1.03)).toEqual([0.92, 0.97, 1.03, 1.08])
  })
})

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    resetVoltageScaleStore()
  })
  afterEach(() => localStorage.clear())

  it('falls back to the defaults on missing, garbage or invalid stored values', () => {
    expect(loadScale(localStorage)).toEqual(DEFAULT_VOLTAGE_SCALE)
    for (const raw of ['{not json', '"x"', '{"a":1}', '[1,2,3]', '[1.1,1.0,0.9,0.8]', '[0.9,0.95,1.05,"1.1"]']) {
      localStorage.setItem(VOLTAGE_SCALE_KEY, raw)
      expect(loadScale(localStorage)).toEqual(DEFAULT_VOLTAGE_SCALE)
    }
    expect(loadScale({ getItem: () => { throw new Error('blocked') } })).toEqual(DEFAULT_VOLTAGE_SCALE)
  })

  it('round-trips a valid scale', () => {
    saveScale([0.9, 0.95, 1.1, 1.15], localStorage)
    expect(loadScale(localStorage)).toEqual([0.9, 0.95, 1.1, 1.15])
  })

  it('useVoltageScale applies and stores valid scales and ignores invalid ones', () => {
    localStorage.setItem(VOLTAGE_SCALE_KEY, 'garbage')
    const { result } = renderHook(() => useVoltageScale())
    expect(result.current[0]).toEqual(DEFAULT_VOLTAGE_SCALE)
    act(() => void result.current[1]([0.9, 0.95, 1.1, 1.15]))
    expect(result.current[0]).toEqual([0.9, 0.95, 1.1, 1.15])
    expect(JSON.parse(localStorage.getItem(VOLTAGE_SCALE_KEY)!)).toEqual([0.9, 0.95, 1.1, 1.15])
    let ok = true
    act(() => void (ok = result.current[1]([0.9, 1.2, 1.1, 1.15])))
    expect(ok).toBe(false)
    expect(result.current[0]).toEqual([0.9, 0.95, 1.1, 1.15])
  })
})
