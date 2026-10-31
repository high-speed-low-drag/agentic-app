/**
 * Pure helpers for per-case network additions (`CaseStudy.network_additions`): new elements on top
 * of the unchanged network file. Mirrors the backend (`networks/additions.py`): an addition becomes a
 * topology element whose `params` are its own `attrs` (statuses default to in service).
 *
 * Editing an added element in the element table changes the addition's `attrs` (no overrides), so
 * its "file value" is simply the value it was added with. Deleting an added node also deletes the
 * additions connected to it (the UI lists them in the confirmation).
 */
import type {
  AddableComponent,
  AddableComponentSpec,
  AddableField,
  CaseStudy,
  NetworkAddition,
  NetworkTopology,
  ParamValues,
  Position,
  TopologyAppliance,
  TopologyBranch,
  TopologyNode,
} from '../../api/schema'
import type { ElementKind } from './graph'

/** Attributes that reference nodes (by PGM id). */
export const NODE_REFS = ['node', 'from_node', 'to_node'] as const

const BRANCHES: AddableComponent[] = ['line', 'link']
const APPLIANCES: AddableComponent[] = ['sym_load', 'sym_gen', 'shunt']

/** Element table tab of an addable component. */
export function additionKind(component: AddableComponent): Exclude<ElementKind, 'source'> {
  if (BRANCHES.includes(component)) return 'branch'
  if (APPLIANCES.includes(component)) return 'appliance'
  return 'node'
}

/** Next free PGM id: 1 + the largest id in the network file and in the existing additions. */
export function nextId(topo: NetworkTopology, additions: NetworkAddition[]): number {
  let max = topo.max_id ?? -1
  for (const list of [topo.nodes, topo.branches, topo.appliances, topo.sources]) for (const e of list) max = Math.max(max, e.id)
  for (const a of additions) max = Math.max(max, a.id)
  return max + 1
}

/** `${prefix} n` with the smallest n >= 1 that is not taken. */
export function uniqueName(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let n = 1; ; n++) if (!used.has(`${prefix} ${n}`)) return `${prefix} ${n}`
}

/** All element names of a topology. */
export function topologyNames(topo: NetworkTopology): string[] {
  return [topo.nodes, topo.branches, topo.appliances, topo.sources].flatMap((l) => l.map((e) => e.name))
}

/** Default name for a new element of a spec, e.g. "New line 1". */
export const defaultName = (spec: Pick<AddableComponentSpec, 'label'>, topo: NetworkTopology) =>
  uniqueName(`New ${spec.label.toLowerCase()}`, topologyNames(topo))

/** The most common node `u_rated` (V) of a topology, or null when it has no nodes. */
export function mostCommonURated(topo: NetworkTopology): number | null {
  const n = new Map<number, number>()
  for (const node of topo.nodes) if (Number.isFinite(node.u_rated)) n.set(node.u_rated, (n.get(node.u_rated) ?? 0) + 1)
  let best: number | null = null
  let count = 0
  for (const [u, c] of n) if (c > count || (c === count && best !== null && u > best)) [best, count] = [u, c]
  return best
}

const num = (v: number | undefined) => (v === undefined ? null : v)
const on = (v: number | undefined) => (v ?? 1) !== 0

/** Topology params of an addition: its attrs without node references (statuses default to 1). */
function paramsOf(a: NetworkAddition, statuses: string[]): ParamValues {
  const out: ParamValues = {}
  for (const s of statuses) out[s] = 1
  for (const [k, v] of Object.entries(a.attrs)) if (!(NODE_REFS as readonly string[]).includes(k)) out[k] = v
  return out
}

export type AddedElement =
  | { kind: 'node'; element: TopologyNode }
  | { kind: 'branch'; element: TopologyBranch }
  | { kind: 'appliance'; element: TopologyAppliance }

/** Map one addition to the topology element it adds. */
export function additionElement(a: NetworkAddition): AddedElement {
  const at = a.attrs
  const kind = additionKind(a.component)
  if (kind === 'branch')
    return {
      kind,
      element: {
        id: a.id,
        type: a.component as TopologyBranch['type'],
        name: a.name,
        from_node: at.from_node,
        to_node: at.to_node,
        in_service: on(at.from_status) && on(at.to_status),
        params: paramsOf(a, ['from_status', 'to_status']),
      },
    }
  if (kind === 'appliance') {
    const shunt = a.component === 'shunt'
    return {
      kind,
      element: {
        id: a.id,
        type: a.component as TopologyAppliance['type'],
        name: a.name,
        node: at.node,
        p_specified: shunt ? null : num(at.p_specified),
        q_specified: shunt ? null : num(at.q_specified),
        b1: shunt ? num(at.b1) : null,
        in_service: on(at.status),
        params: paramsOf(a, ['status']),
      },
    }
  }
  return { kind: 'node', element: { id: a.id, name: a.name, u_rated: at.u_rated ?? NaN } }
}

/** The file topology plus the added elements (the topology itself when there are none). */
export function withAdditions(topo: NetworkTopology, additions: NetworkAddition[] | undefined): NetworkTopology {
  if (!additions?.length) return topo
  const nodes = [...topo.nodes]
  const branches = [...topo.branches]
  const appliances = [...topo.appliances]
  const counts = { ...topo.counts }
  for (const a of additions) {
    const el = additionElement(a)
    if (el.kind === 'node') nodes.push(el.element)
    else if (el.kind === 'branch') branches.push(el.element)
    else appliances.push(el.element)
    counts[a.component] = (counts[a.component] ?? 0) + 1
  }
  return { ...topo, nodes, branches, appliances, counts }
}

/**
 * A key that changes only when the additions change the diagram's structure (elements, names,
 * connections, shunt symbol), not when e.g. a load's P is edited. Lets the diagram skip re-layout.
 */
export function structureKey(additions: NetworkAddition[] | undefined): string {
  return JSON.stringify(
    (additions ?? []).map((a) => [a.component, a.id, a.name, a.attrs.node, a.attrs.from_node, a.attrs.to_node, a.attrs.u_rated, Math.sign(a.attrs.b1 ?? 0)]),
  )
}

/** Added elements as `kind:id` keys (diagram marker, "Changed only" filter). */
export function addedElements(additions: NetworkAddition[] | undefined): Set<string> {
  return new Set((additions ?? []).map((a) => `${additionKind(a.component)}:${a.id}`))
}

/** Number of additions per element kind. */
export function additionCounts(additions: NetworkAddition[] | undefined): Record<ElementKind, number> {
  const out = { node: 0, branch: 0, appliance: 0, source: 0 }
  for (const a of additions ?? []) out[additionKind(a.component)] += 1
  return out
}

/** Additions connected to the given node ids (lines, links, appliances on them). */
export function dependentsOf(additions: NetworkAddition[], nodeIds: Iterable<number>): NetworkAddition[] {
  const ids = new Set(nodeIds)
  return additions.filter((a) => NODE_REFS.some((r) => a.attrs[r] !== undefined && ids.has(a.attrs[r])))
}

/** The additions that deleting `id` removes: the element itself plus, for a node, its dependents. */
export function deletionSet(additions: NetworkAddition[], id: number): NetworkAddition[] {
  const self = additions.find((a) => a.id === id)
  if (!self) return []
  return self.component === 'node' ? [self, ...dependentsOf(additions, [id]).filter((a) => a.id !== id)] : [self]
}

type CaseParts = Pick<CaseStudy, 'network_additions' | 'network_overrides' | 'profile_assignments'>

/**
 * Remove additions by id, plus what refers to them: overrides on those elements and the ids in
 * profile assignment target lists (an assignment whose list becomes empty keeps the empty list).
 */
export function removeAdditions<T extends CaseParts>(c: T, ids: Iterable<number>): T {
  const gone = new Set(ids)
  const removed = c.network_additions.filter((a) => gone.has(a.id))
  if (removed.length === 0) return c
  const comps = new Map(removed.map((a) => [a.id, a.component as string]))
  return {
    ...c,
    network_additions: c.network_additions.filter((a) => !gone.has(a.id)),
    network_overrides: c.network_overrides.filter((o) => comps.get(o.id) !== o.component),
    profile_assignments: c.profile_assignments.map((p) =>
      p.target.ids && p.target.ids.some((i) => comps.get(i) === p.target.component)
        ? { ...p, target: { ...p.target, ids: p.target.ids.filter((i) => comps.get(i) !== p.target.component) } }
        : p,
    ),
  }
}

/** Set one attribute of an added element (the table's edit path for added elements). */
export function setAdditionAttr(additions: NetworkAddition[], id: number, field: string, value: number): NetworkAddition[] {
  return additions.map((a) => (a.id === id ? { ...a, attrs: { ...a.attrs, [field]: value } } : a))
}

// ---------------------------------------------------------------- add form

/** Form values in SI units (null = empty). */
export type AddValues = Record<string, number | null>

/** What the add form may be opened with (T32: from a diagram click with node refs and a position). */
export interface AdditionSeed {
  component?: AddableComponent
  name?: string
  attrs?: Record<string, number>
  position?: Position | null
}

/** Visible label of a node option in the add form: "KNP 3 (id 5)". */
export const nodeOptionLabel = (n: { id: number; name: string }) => `${n.name} (id ${n.id})`

/** Initial form values: seed attrs, else field defaults; node `u_rated` = the most common u_rated. */
export function initialValues(spec: AddableComponentSpec, topo: NetworkTopology, seed?: AdditionSeed): AddValues {
  const out: AddValues = {}
  for (const f of spec.fields) out[f.field] = seed?.attrs?.[f.field] ?? f.default ?? null
  if (spec.component === 'node' && out.u_rated == null) out.u_rated = mostCommonURated(topo)
  return out
}

/** Field errors of the add form (key `name` for the name); empty when the form can be saved. */
export function validateAddition(spec: AddableComponentSpec, name: string, values: AddValues, nodeIds: Set<number>): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!name.trim()) errors.name = 'Enter a name'
  for (const f of spec.fields) {
    const v = values[f.field]
    if (v == null) {
      if (f.required) errors[f.field] = f.kind === 'node' ? 'Select a node' : 'Required'
      continue
    }
    const e = fieldError(f, v, nodeIds)
    if (e) errors[f.field] = e
  }
  if (values.from_node != null && values.from_node === values.to_node && !errors.to_node) errors.to_node = 'Must differ from the from node'
  return errors
}

function fieldError(f: AddableField, v: number, nodeIds: Set<number>): string | null {
  if (f.kind === 'node') return nodeIds.has(v) ? null : 'Unknown node'
  if (!Number.isFinite(v)) return 'Not a number'
  if (f.kind === 'int' && !Number.isInteger(v)) return 'Must be a whole number'
  if (f.kind === 'bool' && v !== 0 && v !== 1) return 'Must be 0 or 1'
  const show = (si: number) => `${Number((si * f.scale).toPrecision(6))}${f.unit ? ` ${f.unit}` : ''}`
  if (f.min !== null && v < f.min) return `Minimum is ${show(f.min)}`
  if (f.max !== null && v > f.max) return `Maximum is ${show(f.max)}`
  return null
}

/** Build the addition from validated form values (empty optional fields are left out). */
export function buildAddition(spec: AddableComponentSpec, id: number, name: string, values: AddValues, position?: Position | null): NetworkAddition {
  const attrs: Record<string, number> = {}
  for (const f of spec.fields) {
    const v = values[f.field]
    if (v != null && Number.isFinite(v)) attrs[f.field] = v
  }
  return { component: spec.component, id, name: name.trim(), attrs, position: position ?? null }
}
