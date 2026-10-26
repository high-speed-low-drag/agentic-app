import { describe, expect, it } from 'vitest'
import type { EditableField, NetworkOverride, NetworkTopology } from '../../api/schema'
import {
  changeCounts,
  changedElements,
  editableColumns,
  effectiveTopology,
  formatValue,
  fromDisplay,
  parseDisplay,
  revertColumn,
  setOverride,
  toDisplay,
} from './overrides'

const P: EditableField = { field: 'p_specified', label: 'P', unit: 'MW', scale: 1e-6, kind: 'float', min: null, max: null }
const C1: EditableField = { field: 'c1', label: 'C1', unit: 'µF', scale: 1e6, kind: 'float', min: 0, max: null }
const TAP: EditableField = { field: 'tap_pos', label: 'Tap position', unit: '', scale: 1, kind: 'int', min: null, max: null }
const st = (field: string): EditableField => ({ field, label: field, unit: '', scale: 1, kind: 'bool', min: 0, max: 1 })

const o = (component: string, id: number, field: string, value: number): NetworkOverride => ({ component, id, field, value })

describe('override helpers', () => {
  it('sets, replaces and removes overrides', () => {
    let list: NetworkOverride[] = []
    list = setOverride(list, o('sym_load', 104, 'p_specified', 3e6), 1.5e6)
    expect(list).toEqual([o('sym_load', 104, 'p_specified', 3e6)])
    list = setOverride(list, o('line', 47, 'i_n', 90), 360)
    list = setOverride(list, o('sym_load', 104, 'p_specified', 2e6), 1.5e6)
    expect(list).toEqual([o('sym_load', 104, 'p_specified', 2e6), o('line', 47, 'i_n', 90)])
    // back to the file value (up to rounding) removes it
    list = setOverride(list, o('sym_load', 104, 'p_specified', fromDisplay(1.5, P)), 1.5e6)
    expect(list).toEqual([o('line', 47, 'i_n', 90)])
  })

  it('reverts a status toggle as one column and counts it once', () => {
    let list = [o('line', 47, 'from_status', 0), o('line', 47, 'to_status', 0), o('sym_load', 104, 'status', 0), o('source', 99, 'u_ref', 1.02)]
    expect(changeCounts(list)).toEqual({ node: 0, branch: 1, appliance: 1, source: 1, total: 3 })
    expect(changedElements(list)).toEqual(new Set(['branch:47', 'appliance:104', 'source:99']))
    list = revertColumn(list, 'line', 47, 'in_service')
    expect(list).toEqual([o('sym_load', 104, 'status', 0), o('source', 99, 'u_ref', 1.02)])
  })

  it('round-trips units without floating point noise', () => {
    expect(toDisplay(1.5e6, P)).toBe(1.5)
    expect(fromDisplay(1.5, P)).toBe(1.5e6)
    expect(toDisplay(2.7e-7, C1)).toBe(0.27)
    expect(fromDisplay(0.27, C1)).toBe(2.7e-7)
    for (const si of [123456.789, 0.1 + 0.2, 7e5]) expect(fromDisplay(toDisplay(si, P), P)).toBeCloseTo(si, 6)
    expect(formatValue(1.5e6, P)).toBe('1.5 MW')
    expect(formatValue(0, st('status'))).toBe('out of service')
  })

  it('parses typed values with validation', () => {
    expect(parseDisplay('3', P)).toEqual({ value: 3e6 })
    expect(parseDisplay('0,5', P)).toEqual({ value: 5e5 })
    expect(parseDisplay('abc', P)).toEqual({ error: 'Not a number' })
    expect(parseDisplay('-1', C1)).toHaveProperty('error')
    expect(parseDisplay('1.5', TAP)).toEqual({ error: 'Must be a whole number' })
    expect(parseDisplay('-3', TAP)).toEqual({ value: -3 })
  })

  it('builds tab columns, merging the status pair', () => {
    const spec = {
      line: [{ ...C1 }, st('from_status'), st('to_status')],
      transformer: [TAP, st('from_status'), st('to_status')],
      link: [st('from_status'), st('to_status')],
    }
    const cols = editableColumns(spec, ['line', 'link', 'transformer'])
    expect(cols.map((c) => c.id)).toEqual(['c1', 'in_service', 'tap_pos'])
    expect(Object.keys(cols[1].fields)).toEqual(['line', 'link', 'transformer'])
    expect(cols[1].fields.line.map((f) => f.field)).toEqual(['from_status', 'to_status'])
  })
})

describe('effectiveTopology', () => {
  const topo: NetworkTopology = {
    source: 'sample',
    key: 't',
    name: 'T',
    nodes: [
      { id: 1, name: 'N1', u_rated: 10e3 },
      { id: 2, name: 'N2', u_rated: 10e3 },
    ],
    branches: [{ id: 10, type: 'line', name: 'L1', from_node: 1, to_node: 2, in_service: true, params: { r1: 0.5, from_status: 1, to_status: 1 } }],
    appliances: [
      { id: 20, type: 'sym_gen', name: 'G1', node: 2, p_specified: 10e6, q_specified: 1e6, in_service: true, params: { p_specified: 10e6, q_specified: 1e6, status: 1 } },
      { id: 21, type: 'sym_load', name: 'L1', node: 2, p_specified: 1e6, q_specified: 0, in_service: true, params: { p_specified: 1e6, q_specified: 0, status: 1 } },
    ],
    sources: [{ id: 30, name: 'Grid', node: 1, u_ref: 1.0, params: { u_ref: 1.0 } }],
    counts: {},
  }

  it('applies edited P/Q and reports the file values', () => {
    const e = effectiveTopology(topo, [o('sym_gen', 20, 'p_specified', 25e6), o('sym_gen', 20, 'q_specified', 2e6)])
    const g = e.topology.appliances.find((a) => a.id === 20)!
    expect(g.p_specified).toBe(25e6)
    expect(g.q_specified).toBe(2e6)
    expect(g.params.p_specified).toBe(25e6)
    expect(e.isEdited('appliance', 20, 'p_specified')).toBe(true)
    expect(e.fileValue('appliance', 20, 'p_specified')).toBe(10e6)
    expect(e.fileValue('appliance', 20, 'q_specified')).toBe(1e6)
    expect(e.isEdited('appliance', 20, 'in_service')).toBe(false)
    // untouched elements keep their identity
    expect(e.topology.appliances[1]).toBe(topo.appliances[1])
    expect(e.topology.branches[0]).toBe(topo.branches[0])
  })

  it('treats a value equal to the file value as not edited', () => {
    const e = effectiveTopology(topo, [o('sym_gen', 20, 'p_specified', fromDisplay(10, P))])
    expect(e.topology).toBe(topo)
    expect(e.isEdited('appliance', 20, 'p_specified')).toBe(false)
    expect(e.fileValue('appliance', 20, 'p_specified')).toBeUndefined()
  })

  it('toggles an appliance and a branch out of service', () => {
    const e = effectiveTopology(topo, [o('sym_load', 21, 'status', 0), o('line', 10, 'from_status', 0), o('line', 10, 'to_status', 0)])
    const l = e.topology.appliances.find((a) => a.id === 21)!
    expect(l.in_service).toBe(false)
    expect(e.isEdited('appliance', 21, 'in_service')).toBe(true)
    expect(e.isEdited('appliance', 21, 'status')).toBe(true)
    expect(e.fileValue('appliance', 21, 'in_service')).toBe(1)
    const b = e.topology.branches[0]
    expect(b.in_service).toBe(false)
    expect(b.params).toEqual({ r1: 0.5, from_status: 0, to_status: 0 })
    expect(e.isEdited('branch', 10, 'in_service')).toBe(true)
    expect(e.fileValue('branch', 10, 'in_service')).toBe(1)
    expect(topo.branches[0].in_service).toBe(true) // input not mutated
  })

  it('applies source u_ref and branch params', () => {
    const e = effectiveTopology(topo, [o('source', 30, 'u_ref', 1.05), o('line', 10, 'r1', 0.7)])
    expect(e.topology.sources[0].u_ref).toBe(1.05)
    expect(e.isEdited('source', 30, 'u_ref')).toBe(true)
    expect(e.topology.branches[0].params.r1).toBe(0.7)
    expect(e.topology.branches[0].in_service).toBe(true)
    expect(e.fileValue('branch', 10, 'r1')).toBe(0.5)
  })

  it('ignores unknown ids and mismatched components', () => {
    const e = effectiveTopology(topo, [o('sym_gen', 999, 'p_specified', 5e6), o('sym_load', 20, 'p_specified', 5e6)])
    expect(e.topology).toBe(topo)
    expect(e.isEdited('appliance', 999, 'p_specified')).toBe(false)
    expect(e.isEdited('appliance', 20, 'p_specified')).toBe(false)
  })
})
