import { describe, expect, it } from 'vitest'
import type { ChartTheme } from '../charts/theme'
import { voltageDivergingColor } from './graph'

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
  light: { ...base, dark: false, axis: '#c3c2b7', voltUnder: '#2a78d6', voltMid: '#e6e5e0', voltOver: '#d03b3b' },
  dark: { ...base, dark: true, axis: '#45443f', voltUnder: '#3987e5', voltMid: '#383835', voltOver: '#e66767' },
}

const rgb = (s: string) => {
  const n = parseInt(s.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

describe.each(Object.entries(themes))('voltageDivergingColor (%s)', (_name, theme) => {
  it('is red for overvoltage', () => {
    const c = rgb(voltageDivergingColor(1.05, theme))
    expect(c.r).toBeGreaterThan(c.b)
  })

  it('is blue for undervoltage', () => {
    const c = rgb(voltageDivergingColor(0.95, theme))
    expect(c.b).toBeGreaterThan(c.r)
  })

  it('is neutral at 1.00 pu', () => {
    expect(voltageDivergingColor(1.0, theme)).toBe(theme.voltMid)
  })

  it('saturates at the span ends', () => {
    expect(voltageDivergingColor(1.08, theme)).toBe(theme.voltOver)
    expect(voltageDivergingColor(1.2, theme)).toBe(theme.voltOver)
    expect(voltageDivergingColor(0.92, theme)).toBe(theme.voltUnder)
  })

  it('uses the axis colour for missing values', () => {
    expect(voltageDivergingColor(null, theme)).toBe(theme.axis)
    expect(voltageDivergingColor(undefined, theme)).toBe(theme.axis)
    expect(voltageDivergingColor(NaN, theme)).toBe(theme.axis)
  })
})
