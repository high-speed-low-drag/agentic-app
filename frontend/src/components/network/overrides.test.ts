import { describe, expect, it } from 'vitest'
import type { EditableField, NetworkOverride } from '../../api/schema'
import {
  changeCounts,
  changedElements,
  editableColumns,
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
