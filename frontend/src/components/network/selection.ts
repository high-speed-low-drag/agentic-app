/**
 * Pure helpers for the diagram <-> element table selection (T7): table rows, search matching,
 * which filters hide a row, and the zoom to use when centring the diagram on an element.
 */
import type { NetworkTopology, ParamValues } from '../../api/schema'
import { fmtKv, fmtPowerW, fmtVar } from '../../lib/format'
import type { ElementKind, ElementRef } from './graph'
import { BRANCH_TYPE_LABELS } from './graph'

/** Where a selection came from; decides the side effects (quiet table select, centre diagram). */
export type SelectionSource = 'diagram' | 'table' | 'details'

export type TableRow = {
  key: number
  id: number
  name: string
  type: string
  /** PGM component (sym_load, line, source, ...) */
  component: string
  params: ParamValues
  a: string
  b: string
  c: string
}

/** Rows of one element-table tab (unfiltered). */
export function tableRows(topology: NetworkTopology, kind: ElementKind, nodeName?: Map<number, string>): TableRow[] {
  const names = nodeName ?? new Map(topology.nodes.map((n) => [n.id, n.name]))
  const node = (id: number) => names.get(id) ?? String(id)
  if (kind === 'node')
    return topology.nodes.map((n) => ({ key: n.id, id: n.id, name: n.name, type: 'node', component: 'node', params: {}, a: fmtKv(n.u_rated), b: '', c: '' }))
  if (kind === 'branch')
    return topology.branches.map((b) => ({
      key: b.id,
      id: b.id,
      name: b.name,
      type: BRANCH_TYPE_LABELS[b.type] ?? b.type,
      component: b.type,
      params: b.params ?? {},
      a: node(b.from_node),
      b: node(b.to_node),
      c: b.in_service ? '' : 'out of service',
    }))
  if (kind === 'appliance')
    return topology.appliances.map((a) => ({
      key: a.id,
      id: a.id,
      name: a.name,
      type: a.type,
      component: a.type,
      params: a.params ?? {},
      a: node(a.node),
      b: fmtPowerW(a.p_specified),
      c: fmtVar(a.q_specified),
    }))
  return topology.sources.map((s) => ({
    key: s.id,
    id: s.id,
    name: s.name,
    type: 'source',
    component: 'source',
    params: s.params ?? {},
    a: node(s.node),
    b: `${s.u_ref.toFixed(3)} pu`,
    c: '',
  }))
}

/** Does a row match the table's search box? Empty query matches everything. */
export function matchesSearch(row: TableRow, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return row.name.toLowerCase().includes(s) || String(row.id) === s || row.type.toLowerCase().includes(s) || row.a.toLowerCase().includes(s)
}

export interface TableFilters {
  q: string
  changedOnly: boolean
}

/**
 * Which filters must be cleared so the row for `ref` is visible. `changed` holds `kind:id` keys
 * of elements with overrides. Returns `null` when the element has no row at all.
 */
export function filtersToClear(
  ref: ElementRef,
  row: TableRow | undefined,
  filters: TableFilters,
  changed: Set<string>,
): { q: boolean; changedOnly: boolean } | null {
  if (!row) return null
  return {
    q: !matchesSearch(row, filters.q),
    changedOnly: filters.changedOnly && !changed.has(`${ref.kind}:${ref.id}`),
  }
}

/** Below this zoom the diagram counts as "very zoomed out" when centring on an element. */
export const FOCUS_MIN_ZOOM = 0.6
/** Zoom used instead when the diagram is very zoomed out. */
export const FOCUS_ZOOM = 1.2

/** Keep the current zoom unless it is very zoomed out; never exceed `maxZoom`. */
export function focusZoom(current: number, maxZoom = Infinity): number {
  return current < FOCUS_MIN_ZOOM ? Math.min(FOCUS_ZOOM, maxZoom) : current
}

/**
 * What a selection does to the element table:
 * - 'none': nothing;
 * - 'quiet': switch to the element's tab and scroll the row into view inside the table's own scroll
 *   container only (no page scroll, flash, filter clearing or note);
 * - 'reveal': the full jump ("Edit in table"): clear hiding filters with a note, page scroll, flash.
 */
export type TableEffect = 'none' | 'quiet' | 'reveal'

/**
 * Side effects of a selection by source. `reveal` marks an explicit "Edit in table" request
 * (from the details panel), which is the only selection that jumps to the table.
 */
export function selectionEffects(source: SelectionSource, reveal = false): { table: TableEffect; centreDiagram: boolean } {
  if (reveal) return { table: 'reveal', centreDiagram: false }
  if (source === 'diagram') return { table: 'quiet', centreDiagram: false }
  return { table: 'none', centreDiagram: true }
}

/**
 * Container scrollTop that brings a row into view inside a scroll container, moving as little as
 * needed. Positions are relative to the scrolled content; `stickyTop` is the height of a sticky
 * header covering the top of the viewport.
 */
export function scrollTopToShow(rowTop: number, rowHeight: number, scrollTop: number, viewHeight: number, stickyTop = 0): number {
  const top = rowTop - stickyTop
  if (top < scrollTop) return Math.max(0, top)
  const bottom = rowTop + rowHeight - viewHeight
  if (bottom > scrollTop) return Math.min(bottom, top)
  return scrollTop
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
