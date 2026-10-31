import { describe, expect, it } from 'vitest'
import { dayOfYear, daylight, fmtClockHour, isDaylight, solarSource } from './solar'

const RAD = Math.PI / 180

/** Expected sunrise/sunset straight from the backend PV formula: half day = acos(−tan φ tan δ)/15 h around noon. */
function expected(doy: number, lat: number, noon: number) {
  const decl = 23.44 * RAD * Math.sin((2 * Math.PI * (284 + doy)) / 365)
  const half = Math.acos(-Math.tan(lat * RAD) * Math.tan(decl)) / RAD / 15
  return { sunrise: noon - half, sunset: noon + half }
}

describe('solar', () => {
  it('day of year follows the local calendar', () => {
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1)
    expect(dayOfYear(new Date(2026, 5, 21, 23, 30))).toBe(172)
    expect(dayOfYear(new Date(2024, 11, 31))).toBe(366)
  })

  it('lat 52, 21 June, noon 13.5: sunrise ≈ 05:15 and sunset ≈ 21:45, matching the backend formula', () => {
    const d = daylight(new Date(2026, 5, 21), 52, 13.5)
    expect(d.kind).toBe('normal')
    const e = expected(172, 52, 13.5)
    expect(d.sunrise).toBeCloseTo(e.sunrise, 9)
    expect(d.sunset).toBeCloseTo(e.sunset, 9)
    expect(Math.abs(d.sunrise! - 5.25)).toBeLessThanOrEqual(0.25)
    expect(Math.abs(d.sunset! - 21.75)).toBeLessThanOrEqual(0.25)
    expect(fmtClockHour(d.sunrise!)).toBe('05:15')
    expect(fmtClockHour(d.sunset!)).toBe('21:45')
  })

  it('21 December is shorter than 21 June', () => {
    const june = daylight(new Date(2026, 5, 21), 52, 13.5)
    const dec = daylight(new Date(2026, 11, 21), 52, 13.5)
    expect(dec.hours).toBeLessThan(june.hours)
    expect(dec.hours).toBeGreaterThan(7)
    expect(dec.hours).toBeLessThan(9)
  })

  it('polar day and polar night', () => {
    const day = daylight(new Date(2026, 5, 21), 75, 12)
    expect(day).toMatchObject({ kind: 'polar-day', sunrise: 0, sunset: 24, hours: 24 })
    expect(isDaylight(new Date(2026, 5, 21, 0, 30), 75, 12)).toBe(true)
    const night = daylight(new Date(2026, 11, 21), 75, 12)
    expect(night).toMatchObject({ kind: 'polar-night', sunrise: null, sunset: null, hours: 0 })
    expect(isDaylight(new Date(2026, 11, 21, 12), 75, 12)).toBe(false)
  })

  it('isDaylight agrees with sunrise/sunset', () => {
    const d = daylight(new Date(2026, 6, 1), 52, 13.5)
    const at = (h: number) => new Date(2026, 6, 1, 0, 0, Math.round(h * 3600))
    expect(isDaylight(at(d.sunrise! - 0.05))).toBe(false)
    expect(isDaylight(at(d.sunrise! + 0.05))).toBe(true)
    expect(isDaylight(at(d.sunset! - 0.05))).toBe(true)
    expect(isDaylight(at(d.sunset! + 0.05))).toBe(false)
    expect(isDaylight(new Date(2026, 6, 1, 2))).toBe(false)
    expect(isDaylight(new Date(2026, 6, 1, 13))).toBe(true)
  })

  it('takes latitude and noon from the first pv assignment, else defaults', () => {
    expect(solarSource(undefined)).toMatchObject({ latitude: 52, solarNoon: 13.5, fromProfile: false })
    expect(solarSource([{ generator: 'residential', params: {} }]).label).toContain('default latitude 52°')
    const s = solarSource([
      { generator: 'residential', params: {} },
      { generator: 'pv', params: { latitude: 40, solar_noon_hour: 12.5 } },
      { generator: 'pv', params: { latitude: 10 } },
    ])
    expect(s).toMatchObject({ latitude: 40, solarNoon: 12.5, fromProfile: true })
    expect(s.label).toContain('PV profile (lat 40°')
    expect(solarSource([{ generator: 'pv', params: {} }])).toMatchObject({ latitude: 52, solarNoon: 13.5, fromProfile: true })
  })
})
