import { describe, expect, it } from 'vitest'
import type { ChartTheme } from '../components/charts/theme'
import { mix } from '../components/charts/theme'
import { voltageColor, voltageStops } from './voltageScale'

const base: Omit<ChartTheme, 'dark' | 'voltLow' | 'voltLowMid' | 'voltNominal' | 'voltHighMid' | 'voltHigh' | 'axis'> = {
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
  light: {
    ...base,
    dark: false,
    axis: '#c3c2b7',
    voltLow: '#2a78d6',
    voltLowMid: '#159c9c',
    voltNominal: '#2e9e48',
    voltHighMid: '#e0b000',
    voltHigh: '#d03b3b',
  },
  dark: {
    ...base,
    dark: true,
    axis: '#45443f',
    voltLow: '#3987e5',
    voltLowMid: '#2bbdbd',
    voltNominal: '#3fb950',
    voltHighMid: '#f0c53c',
    voltHigh: '#e66767',
  },
}

const ch = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
/** Same colour within one channel step (float rounding at the half-way point). */
const near = (a: string, b: string) => ch(a).every((x, i) => Math.abs(x - ch(b)[i]) <= 1)

const L = { u_min_pu: 0.9, u_max_pu: 1.1 }

describe.each(Object.entries(themes))('voltageColor (%s)', (_name, t) => {
  it('hits the five stop colours exactly', () => {
    expect(voltageColor(0.9, L, t)).toBe(t.voltLow)
    expect(voltageColor(0.95, L, t)).toBe(t.voltLowMid)
    expect(voltageColor(1.0, L, t)).toBe(t.voltNominal)
    expect(voltageColor(1.05, L, t)).toBe(t.voltHighMid)
    expect(voltageColor(1.1, L, t)).toBe(t.voltHigh)
  })

  it('interpolates between stops', () => {
    expect(near(voltageColor(0.925, L, t), mix(t.voltLow, t.voltLowMid, 0.5))).toBe(true)
    expect(near(voltageColor(0.975, L, t), mix(t.voltLowMid, t.voltNominal, 0.5))).toBe(true)
    expect(near(voltageColor(1.025, L, t), mix(t.voltNominal, t.voltHighMid, 0.5))).toBe(true)
    expect(near(voltageColor(1.075, L, t), mix(t.voltHighMid, t.voltHigh, 0.5))).toBe(true)
  })

  it('is flat beyond the limits', () => {
    expect(voltageColor(0.5, L, t)).toBe(t.voltLow)
    expect(voltageColor(0.89, L, t)).toBe(t.voltLow)
    expect(voltageColor(1.11, L, t)).toBe(t.voltHigh)
    expect(voltageColor(2, L, t)).toBe(t.voltHigh)
  })

  it('moves the midpoints with asymmetric limits', () => {
    const a = { u_min_pu: 0.94, u_max_pu: 1.1 }
    expect(voltageStops(a, t).map((s) => s.u)).toEqual([0.94, 0.97, 1, 1.05, 1.1])
    expect(voltageColor(0.97, a, t)).toBe(t.voltLowMid)
    expect(voltageColor(1.05, a, t)).toBe(t.voltHighMid)
    expect(near(voltageColor(0.95, a, t), mix(t.voltLow, t.voltLowMid, (0.95 - 0.94) / 0.03))).toBe(true)
  })

  it('does not throw or produce NaN with degenerate limits', () => {
    for (const lim of [
      { u_min_pu: 1.02, u_max_pu: 1.1 },
      { u_min_pu: 0.9, u_max_pu: 0.98 },
      { u_min_pu: 1, u_max_pu: 1 },
      { u_min_pu: 1.1, u_max_pu: 0.9 },
    ]) {
      const stops = voltageStops(lim, t)
      expect(stops.every((s) => Number.isFinite(s.u))).toBe(true)
      for (const u of [0.8, 0.95, 1, 1.05, 1.2]) expect(voltageColor(u, lim, t)).toMatch(/^#[0-9a-f]{6}$/)
    }
    // green moves to the midpoint of the limits
    expect(voltageStops({ u_min_pu: 1.02, u_max_pu: 1.1 }, t)[2].u).toBeCloseTo(1.06)
    expect(voltageStops({ u_min_pu: 0.9, u_max_pu: 0.98 }, t)[2].u).toBeCloseTo(0.94)
  })

  it('uses the axis colour for missing values', () => {
    expect(voltageColor(null, L, t)).toBe(t.axis)
    expect(voltageColor(undefined, L, t)).toBe(t.axis)
    expect(voltageColor(NaN, L, t)).toBe(t.axis)
  })
})
