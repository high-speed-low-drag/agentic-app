import type { ProfileAssignment, ProfileGeneratorInfo, TimeSettings } from '../../api/schema'
import { defaultsFromSchema } from '../../lib/jsonSchema'
import { addDays, parseNaive, toNaive } from '../../lib/time'

export const PREVIEW_DAYS = 7

/** Clip a time window to at most PREVIEW_DAYS days for preview requests. */
export function previewWindow(time: TimeSettings): { time: TimeSettings; clipped: boolean } {
  const start = parseNaive(time.start)
  const end = parseNaive(time.end)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { time, clipped: false }
  const maxEnd = addDays(start, PREVIEW_DAYS)
  if (end > maxEnd) return { time: { ...time, end: toNaive(maxEnd) }, clipped: true }
  return { time, clipped: false }
}

export function isCsvGenerator(g?: ProfileGeneratorInfo): boolean {
  const p = g?.params_schema?.properties
  return !!p && 'file_id' in p && 'column' in p
}

/** Suggested add-mode magnitude: generation (negative) for PV-like generators, demand otherwise. */
export function defaultMagnitude(generatorKey: string): number {
  return generatorKey.includes('pv') ? -5000 : 5000
}

/** Apply a generator choice: reset params to schema defaults and adopt its default mode / target. */
export function withGenerator(a: ProfileAssignment, g: ProfileGeneratorInfo): ProfileAssignment {
  const component = g.applies_to.includes(a.target.component) ? a.target.component : (g.applies_to[0] ?? 'sym_load')
  return {
    ...a,
    generator: g.key,
    label: !a.label || a.label === a.generator || a.label === 'New profile' ? g.name : a.label,
    params: defaultsFromSchema(g.params_schema),
    mode: g.default_mode,
    magnitude_w: g.default_mode === 'add' ? (a.magnitude_w ?? defaultMagnitude(g.key)) : a.magnitude_w,
    target: { component, ids: component === a.target.component ? a.target.ids : null },
  }
}

