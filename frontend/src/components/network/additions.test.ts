import { describe, expect, it } from 'vitest'
import type { AddableComponentSpec, CaseStudy, NetworkAddition, NetworkTopology } from '../../api/schema'
import {
  addedElements,
  additionCounts,
  buildAddition,
  defaultName,
  deletionSet,
  initialValues,
  mostCommonURated,
  nextId,
  removeAdditions,
  setAdditionAttr,
  structureKey,
  uniqueName,
  validateAddition,
  withAdditions,
} from './additions'
import { effectiveTopology } from './overrides'

const topo: NetworkTopology = {
  source: 'sample',
  key: 't',
  name: 'T',
  nodes: [
    { id: 1, name: 'A', u_rated: 10500 },
    { id: 2, name: 'B', u_rated: 10500 },
    { id: 3, name: 'C', u_rated: 400 },
  ],
  branches: [{ id: 10, type: 'line', name: 'New line 1', from_node: 1, to_node: 2, in_service: true, params: { r1: 1 } }],
  appliances: [{ id: 20, type: 'sym_load', name: 'L', node: 2, p_specified: 1e6, q_specified: 0, in_service: true, params: { p_specified: 1e6 } }],
  sources: [{ id: 30, name: 'S', node: 1, u_ref: 1, params: { u_ref: 1 } }],
  counts: { node: 3, line: 1, sym_load: 1, source: 1 },
  max_id: 50,
}

const node: NetworkAddition = { component: 'node', id: 51, name: 'N new', attrs: { u_rated: 10500 } }
const line: NetworkAddition = { component: 'line', id: 52, name: 'L new', attrs: { from_node: 2, to_node: 51, r1: 0.2, x1: 0.1, c1: 3e-7, i_n: 315 } }
const load: NetworkAddition = { component: 'sym_load', id: 53, name: 'Load new', attrs: { node: 51, p_specified: 1e5, q_specified: 0 } }
const shunt: NetworkAddition = { component: 'shunt', id: 54, name: 'Sh', attrs: { node: 1, b1: -1e-5, status: 0 } }

const f = (field: string, kind: 'float' | 'node', extra: Partial<AddableComponentSpec['fields'][number]> = {}) => ({
  field,
  label: field,
  unit: '',
  scale: 1,
  kind,
  required: true,
  default: null,
  min: null,
  max: null,
  ...extra,
})
const LINE: AddableComponentSpec = {
  component: 'line',
  label: 'Line',
  kind: 'branch',
  fields: [f('from_node', 'node'), f('to_node', 'node'), f('r1', 'float', { default: 0.206, min: 0 }), f('i_n', 'float', { default: 315, required: false })],
  fixed: { from_status: 1, to_status: 1, tan1: 0 },
}
const NODE: AddableComponentSpec = { component: 'node', label: 'Node', kind: 'node', fields: [f('u_rated', 'float', { unit: 'kV', scale: 1e-3, min: 1 })], fixed: {} }

describe('additions → topology', () => {
  it('appends added elements with their attrs as params and keeps the file topology', () => {
    expect(withAdditions(topo, [])).toBe(topo)
    const t = withAdditions(topo, [node, line, load, shunt])
    expect(t.nodes.at(-1)).toEqual({ id: 51, name: 'N new', u_rated: 10500 })
    expect(t.branches.at(-1)).toEqual({
      id: 52,
      type: 'line',
      name: 'L new',
      from_node: 2,
      to_node: 51,
      in_service: true,
      params: { from_status: 1, to_status: 1, r1: 0.2, x1: 0.1, c1: 3e-7, i_n: 315 },
    })
    expect(t.appliances.at(-2)).toMatchObject({ id: 53, node: 51, p_specified: 1e5, q_specified: 0, b1: null, in_service: true })
    expect(t.appliances.at(-1)).toMatchObject({ id: 54, type: 'shunt', b1: -1e-5, p_specified: null, in_service: false, params: { status: 0, b1: -1e-5 } })
    expect(t.counts).toMatchObject({ node: 4, line: 2, sym_load: 2, shunt: 1 })
    expect(topo.nodes).toHaveLength(3)
  })

  it('overrides apply on top of added elements', () => {
    const t = withAdditions(topo, [node, load])
    const e = effectiveTopology(t, [{ component: 'sym_load', id: 53, field: 'p_specified', value: 2e5 }])
    expect(e.topology.appliances.find((a) => a.id === 53)?.p_specified).toBe(2e5)
    expect(e.fileValue('appliance', 53, 'p_specified')).toBe(1e5)
  })

  it('marks and counts added elements per kind', () => {
    expect(addedElements([node, line, load])).toEqual(new Set(['node:51', 'branch:52', 'appliance:53']))
    expect(additionCounts([node, line, load, shunt])).toEqual({ node: 1, branch: 1, appliance: 2, source: 0 })
  })

  it('structure key ignores value edits but not reconnections', () => {
    const k = structureKey([line, load])
    expect(structureKey([line, setAdditionAttr([load], 53, 'p_specified', 9e5)[0]])).toBe(k)
    expect(structureKey([line, setAdditionAttr([load], 53, 'node', 2)[0]])).not.toBe(k)
  })
})

describe('ids and names', () => {
  it('allocates 1 + max over the file (max_id) and the additions', () => {
    expect(nextId(topo, [])).toBe(51)
    expect(nextId(topo, [node, { ...load, id: 70 }])).toBe(71)
    expect(nextId({ ...topo, max_id: undefined }, [])).toBe(31)
  })

  it('makes unique default names', () => {
    expect(uniqueName('New line', ['New line 1', 'New line 2'])).toBe('New line 3')
    expect(defaultName({ label: 'Line' }, topo)).toBe('New line 2')
    expect(defaultName({ label: 'Load' }, topo)).toBe('New load 1')
  })

  it('finds the most common rated voltage', () => {
    expect(mostCommonURated(topo)).toBe(10500)
    expect(mostCommonURated({ ...topo, nodes: [] })).toBeNull()
  })
})

describe('delete', () => {
  const c: Pick<CaseStudy, 'network_additions' | 'network_overrides' | 'profile_assignments'> = {
    network_additions: [node, line, load, shunt],
    network_overrides: [
      { component: 'sym_load', id: 53, field: 'p_specified', value: 1 },
      { component: 'sym_load', id: 20, field: 'p_specified', value: 1 },
    ],
    profile_assignments: [
      { id: 'a', label: '', generator: 'constant', params: {}, target: { component: 'sym_load', ids: [20, 53] }, mode: 'scale', magnitude_w: null, factor: 1 },
      { id: 'b', label: '', generator: 'constant', params: {}, target: { component: 'sym_load', ids: null }, mode: 'scale', magnitude_w: null, factor: 1 },
    ],
  }

  it('deleting an added node also deletes the additions connected to it', () => {
    expect(deletionSet(c.network_additions, 51).map((a) => a.id)).toEqual([51, 52, 53])
    expect(deletionSet(c.network_additions, 53).map((a) => a.id)).toEqual([53])
    expect(deletionSet(c.network_additions, 20)).toEqual([])
  })

  it('removes overrides and profile target ids of deleted additions', () => {
    const out = removeAdditions(c, [51, 52, 53])
    expect(out.network_additions).toEqual([shunt])
    expect(out.network_overrides).toEqual([{ component: 'sym_load', id: 20, field: 'p_specified', value: 1 }])
    expect(out.profile_assignments[0].target.ids).toEqual([20])
    expect(out.profile_assignments[1]).toBe(c.profile_assignments[1])
    expect(removeAdditions(c, [999])).toBe(c)
  })
})

describe('add form', () => {
  const ids = new Set([1, 2, 3])

  it('prefills defaults, seed attrs and the common u_rated', () => {
    expect(initialValues(LINE, topo)).toEqual({ from_node: null, to_node: null, r1: 0.206, i_n: 315 })
    expect(initialValues(LINE, topo, { attrs: { from_node: 2 } })).toMatchObject({ from_node: 2 })
    expect(initialValues(NODE, topo)).toEqual({ u_rated: 10500 })
    expect(initialValues(NODE, topo, { attrs: { u_rated: 400 } })).toEqual({ u_rated: 400 })
  })

  it('validates required fields, nodes, from ≠ to and bounds', () => {
    expect(validateAddition(LINE, ' ', { from_node: null, to_node: null, r1: 0.2, i_n: null }, ids)).toEqual({
      name: 'Enter a name',
      from_node: 'Select a node',
      to_node: 'Select a node',
    })
    expect(validateAddition(LINE, 'x', { from_node: 1, to_node: 1, r1: -1, i_n: null }, ids)).toEqual({
      to_node: 'Must differ from the from node',
      r1: 'Minimum is 0',
    })
    expect(validateAddition(LINE, 'x', { from_node: 1, to_node: Number.NaN, r1: 0.2, i_n: 1 }, ids)).toEqual({ to_node: 'Unknown node' })
    expect(validateAddition(LINE, 'x', { from_node: 1, to_node: 99, r1: 0.2, i_n: 1 }, ids)).toEqual({ to_node: 'Unknown node' })
    expect(validateAddition(NODE, 'x', { u_rated: 0.5 }, ids)).toEqual({ u_rated: 'Minimum is 0.001 kV' })
    expect(validateAddition(LINE, 'x', { from_node: 1, to_node: 2, r1: 0.2, i_n: null }, ids)).toEqual({})
  })

  it('builds the addition from the form values', () => {
    const a = buildAddition(LINE, 51, ' My line ', { from_node: 1, to_node: 2, r1: 0.2, i_n: null }, { x: 1, y: 2 })
    expect(a).toEqual({ component: 'line', id: 51, name: 'My line', attrs: { from_node: 1, to_node: 2, r1: 0.2 }, position: { x: 1, y: 2 } })
  })
})
