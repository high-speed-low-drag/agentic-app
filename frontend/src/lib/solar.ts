/**
 * Sunrise / sunset from the same solar geometry as the backend PV generator
 * (`backend/src/gridsim/profiles/pv.py`): declination 23.44° × sin(2π(284 + doy)/365) and hour angle
 * 15° × (hour − solar_noon_hour). Times are local wall-clock hours, like the API's naive timestamps.
 */

export const DEFAULT_LATITUDE = 52
export const DEFAULT_SOLAR_NOON = 13.5

const RAD = Math.PI / 180

export type DaylightKind = 'normal' | 'polar-day' | 'polar-night'

export interface Daylight {
  kind: DaylightKind
  /** Clock hour of sunrise (sun elevation 0); 0 for polar day, null for polar night. */
  sunrise: number | null
  /** Clock hour of sunset; 24 for polar day, null for polar night. */
  sunset: number | null
  /** Hours of daylight, 0–24. */
  hours: number
}

/** Day of year (1 = 1 Jan) from the date's local calendar fields, like pandas `day_of_year`. */
export function dayOfYear(d: Date): number {
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000)
}

/** Solar declination in radians. */
export function declination(doy: number): number {
  return 23.44 * RAD * Math.sin((2 * Math.PI * (284 + doy)) / 365)
}

/** Sunrise and sunset clock hours on the calendar day of `date`. */
export function daylight(date: Date, latitude = DEFAULT_LATITUDE, solarNoon = DEFAULT_SOLAR_NOON): Daylight {
  // cosine of the sunset hour angle: −tan φ · tan δ (|c| ≥ 1 means polar day or night)
  const c = -Math.tan(latitude * RAD) * Math.tan(declination(dayOfYear(date)))
  if (c <= -1) return { kind: 'polar-day', sunrise: 0, sunset: 24, hours: 24 }
  if (c >= 1) return { kind: 'polar-night', sunrise: null, sunset: null, hours: 0 }
  const half = Math.acos(c) / RAD / 15
  return { kind: 'normal', sunrise: solarNoon - half, sunset: solarNoon + half, hours: 2 * half }
}

/** True if the sun is above the horizon at `timestamp` (ms or Date): the backend's test, cos z > 0. */
export function isDaylight(timestamp: number | Date, latitude = DEFAULT_LATITUDE, solarNoon = DEFAULT_SOLAR_NOON): boolean {
  const d = typeof timestamp === 'number' ? new Date(timestamp) : timestamp
  const hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
  const lat = latitude * RAD
  const decl = declination(dayOfYear(d))
  const omega = 15 * (hour - solarNoon) * RAD
  return Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(omega) > 0
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Clock hour (may be outside 0–24) -> "HH:MM", wrapped to the day. */
export function fmtClockHour(h: number): string {
  const mins = ((Math.round(h * 60) % 1440) + 1440) % 1440
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`
}

export interface SolarSource {
  latitude: number
  solarNoon: number
  fromProfile: boolean
  /** Where the values come from, for a tooltip. */
  label: string
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Latitude and solar noon from the first `pv` profile assignment's params, else the backend defaults. */
export function solarSource(assignments: { generator: string; params: Record<string, unknown> }[] | undefined): SolarSource {
  const pv = assignments?.find((a) => a.generator === 'pv')
  if (!pv) {
    return {
      latitude: DEFAULT_LATITUDE,
      solarNoon: DEFAULT_SOLAR_NOON,
      fromProfile: false,
      label: `Daylight from default latitude ${DEFAULT_LATITUDE}° (no PV profile)`,
    }
  }
  const latitude = num(pv.params.latitude) ?? DEFAULT_LATITUDE
  const solarNoon = num(pv.params.solar_noon_hour) ?? DEFAULT_SOLAR_NOON
  return { latitude, solarNoon, fromProfile: true, label: `Daylight from PV profile (lat ${latitude}°, solar noon ${fmtClockHour(solarNoon)})` }
}
