/**
 * Pure helpers for per-case network overrides (`CaseStudy.network_overrides`).
 *
 * Values are stored in SI/PGM units (W, var, VA, Ω, F, A, pu; booleans as 0/1); the table shows
 * them as `SI * scale` in the field's display unit. Branch `from_status`/`to_status` are shown as
 * one "in service" column that sets both. Setting a value back to the file value removes the override.
 */
import type { EditableField, EditableFields, NetworkOverride, NetworkTopology } from '../../api/schema'
import type { ElementKind } from './graph'

/** Virtual column that groups the two branch status fields. */
export const IN_SERVICE = 'in_service'
const STATUS_PAIR = ['from_status', 'to_status']

/** Table column id for a field (both branch statuses map to `in_service`). */
export const columnOf = (field: string) => (STATUS_PAIR.includes(field) ? IN_SERVICE : field)

/** Element kind (table tab / diagram) of a PGM component. */
export function kindOf(component: string): ElementKind {
  if (component === 'source') return 'source'
  if (component === 'node') return 'node'
  if (['sym_load', 'sym_gen', 'asym_load', 'asym_gen', 'shunt'].includes(component)) return 'appliance'
  return 'branch'
}

/** Remove floating point noise from scaled values (e.g. 1.5e6 * 1e-6). */
const clean = (v: number) => (Number.isFinite(v) ? Number(v.toPrecision(12)) : v)

export const toDisplay = (si: number, f: Pick<EditableField, 'scale'>) => clean(si * f.scale)
export const fromDisplay = (display: number, f: Pick<EditableField, 'scale'>) => clean(display / f.scale)

/** True when two SI values are equal up to rounding. */
export function sameValue(a: number, b: number): boolean {
  if (a === b) return true
  return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b))
}

export function findOverride(list: NetworkOverride[], component: string, id: number, field: string) {
  return list.find((o) => o.component === component && o.id === id && o.field === field)
}

/**
 * Set one field. If `value` equals the file value the override is removed instead.
 * Keeps the list order stable (replaces in place, appends new ones).
 */
export function setOverride(list: NetworkOverride[], o: NetworkOverride, fileValue: number | undefined): NetworkOverride[] {
  const rest = list.filter((x) => !(x.component === o.component && x.id === o.id && x.field === o.field))
  if (fileValue !== undefined && sameValue(o.value, fileValue)) return rest
  const i = list.findIndex((x) => x.component === o.component && x.id === o.id && x.field === o.field)
  if (i < 0) return [...list, o]
  const next = [...list]
  next[i] = o
  return next
}

/** Remove the override(s) behind one table column of one element. */
export function revertColumn(list: NetworkOverride[], component: string, id: number, column: string): NetworkOverride[] {
  return list.filter((x) => !(x.component === component && x.id === id && columnOf(x.field) === column))
}

/** Distinct changed cells `component:id:column` (a status toggle counts once). */
export function changedCells(list: NetworkOverride[]): Set<string> {
  return new Set(list.map((o) => `${o.component}:${o.id}:${columnOf(o.field)}`))
}

/** Number of changed cells per element kind, plus the total. */
export function changeCounts(list: NetworkOverride[]): Record<ElementKind | 'total', number> {
  const out = { node: 0, branch: 0, appliance: 0, source: 0, total: 0 }
  for (const key of changedCells(list)) {
    out[kindOf(key.split(':')[0])] += 1
    out.total += 1
  }
  return out
}

/** Changed elements as `kind:id` keys (for the diagram marker and "Changed only" filter). */
export function changedElements(list: NetworkOverride[]): Set<string> {
  return new Set(list.map((o) => `${kindOf(o.component)}:${o.id}`))
}

/** A table column for editable fields: one field, or the branch status pair. */
export interface EditableColumn {
  id: string
  label: string
  unit: string
  kind: EditableField['kind']
  /** component -> fields behind this column (status pair: both fields) */
  fields: Record<string, EditableField[]>
}

/** Editable columns of a tab, in registry order, for the component types present in it. */
export function editableColumns(spec: EditableFields, components: string[]): EditableColumn[] {
  const cols = new Map<string, EditableColumn>()
  for (const comp of components) {
    for (const f of spec[comp] ?? []) {
      const id = columnOf(f.field)
      let col = cols.get(id)
      if (!col) {
        col = { id, label: id === IN_SERVICE ? 'In service' : f.label, unit: f.unit, kind: f.kind, fields: {} }
        cols.set(id, col)
      }
      ;(col.fields[comp] ??= []).push(f)
    }
  }
  return [...cols.values()]
}

/** PGM components present in a topology tab. */
export function tabComponents(topo: NetworkTopology, kind: ElementKind): string[] {
  const list =
    kind === 'branch'
      ? topo.branches.map((b) => b.type)
      : kind === 'appliance'
        ? topo.appliances.map((a) => a.type)
        : kind === 'source'
          ? ['source']
          : []
  return [...new Set<string>(list)]
}

/** Format an SI value for display ("1.5 MW", "in service"). */
export function formatValue(si: number | undefined, f: Pick<EditableField, 'scale' | 'unit' | 'kind'>): string {
  if (si === undefined || !Number.isFinite(si)) return '—'
  if (f.kind === 'bool') return si ? 'in service' : 'out of service'
  const d = toDisplay(si, f)
  const s = f.kind === 'int' ? String(Math.round(d)) : String(Number(d.toPrecision(6)))
  return f.unit ? `${s} ${f.unit}` : s
}

/**
 * Parse a typed display value into SI. Returns an error message for invalid input
 * (not a number, not an integer, out of [min, max]).
 */
export function parseDisplay(text: string, f: EditableField): { value: number } | { error: string } {
  const t = text.trim().replace(',', '.')
  if (!t) return { error: 'Enter a value' }
  const d = Number(t)
  if (!Number.isFinite(d)) return { error: 'Not a number' }
  if (f.kind === 'int' && !Number.isInteger(d)) return { error: 'Must be a whole number' }
  const si = f.kind === 'int' ? d : fromDisplay(d, f)
  if (f.min !== null && si < f.min) return { error: `Minimum is ${formatValue(f.min, f)}` }
  if (f.max !== null && si > f.max) return { error: `Maximum is ${formatValue(f.max, f)}` }
  return { value: si }
}
