import { describe, expect, it } from 'vitest'
import type { NetworkTopology } from '../../api/schema'
import { filtersToClear, FOCUS_ZOOM, focusZoom, matchesSearch, selectionEffects, tableRows } from './selection'

const topo = {
  source: 'sample',
  key: 't',
  name: 'T',
  nodes: [
    { id: 1, name: 'Bus A', u_rated: 10500 },
    { id: 2, name: 'Bus B', u_rated: 10500 },
  ],
  branches: [{ id: 10, type: 'line', name: 'Cable 1', from_node: 1, to_node: 2, in_service: true, params: {} }],
  appliances: [{ id: 20, type: 'sym_load', name: 'Load1', node: 2, p_specified: 1.5e6, q_specified: 0, in_service: true, params: {} }],
  sources: [{ id: 30, name: 'Grid', node: 1, u_ref: 1.0, params: {} }],
  counts: {},
} as unknown as NetworkTopology

const row = (kind: 'node' | 'branch' | 'appliance' | 'source', id: number) => tableRows(topo, kind).find((r) => r.id === id)

describe('tableRows', () => {
  it('resolves node names for appliances and branches', () => {
    expect(row('appliance', 20)?.a).toBe('Bus B')
    expect(row('branch', 10)).toMatchObject({ a: 'Bus A', b: 'Bus B', type: 'Line', component: 'line' })
    expect(row('source', 30)?.b).toBe('1.000 pu')
  })
})

describe('matchesSearch', () => {
  it('matches name, exact id, type and first column', () => {
    const r = row('appliance', 20)!
    expect(matchesSearch(r, '')).toBe(true)
    expect(matchesSearch(r, ' load ')).toBe(true)
    expect(matchesSearch(r, '20')).toBe(true)
    expect(matchesSearch(r, '2')).toBe(false)
    expect(matchesSearch(r, 'sym_')).toBe(true)
    expect(matchesSearch(r, 'bus b')).toBe(true)
    expect(matchesSearch(r, 'cable')).toBe(false)
  })
})

describe('filtersToClear', () => {
  const none = new Set<string>()
  it('clears nothing when the row is already visible', () => {
    expect(filtersToClear({ kind: 'node', id: 1 }, row('node', 1), { q: 'bus', changedOnly: false }, none)).toEqual({ q: false, changedOnly: false })
  })
  it('clears the search when it hides the row', () => {
    expect(filtersToClear({ kind: 'node', id: 1 }, row('node', 1), { q: 'cable', changedOnly: false }, none)).toEqual({ q: true, changedOnly: false })
  })
  it('clears "Changed only" for an unchanged element, keeps it for a changed one', () => {
    const ref = { kind: 'appliance', id: 20 } as const
    expect(filtersToClear(ref, row('appliance', 20), { q: '', changedOnly: true }, none)).toEqual({ q: false, changedOnly: true })
    expect(filtersToClear(ref, row('appliance', 20), { q: '', changedOnly: true }, new Set(['appliance:20']))).toEqual({ q: false, changedOnly: false })
    // the changed set is keyed by kind: a changed node 20 does not count
    expect(filtersToClear(ref, row('appliance', 20), { q: '', changedOnly: true }, new Set(['node:20']))?.changedOnly).toBe(true)
  })
  it('clears both when both hide the row', () => {
    expect(filtersToClear({ kind: 'branch', id: 10 }, row('branch', 10), { q: 'load', changedOnly: true }, none)).toEqual({ q: true, changedOnly: true })
  })
  it('returns null for an element without a row', () => {
    expect(filtersToClear({ kind: 'node', id: 99 }, row('node', 99), { q: '', changedOnly: true }, none)).toBeNull()
  })
})

describe('focusZoom', () => {
  it('keeps the zoom unless very zoomed out', () => {
    expect(focusZoom(1)).toBe(1)
    expect(focusZoom(3)).toBe(3)
    expect(focusZoom(0.2)).toBe(FOCUS_ZOOM)
    expect(focusZoom(0.2, 0.8)).toBe(0.8)
  })
})

describe('selectionEffects', () => {
  it('reveals the row for diagram picks and centres the diagram otherwise', () => {
    expect(selectionEffects('diagram')).toEqual({ revealRow: true, centreDiagram: false })
    expect(selectionEffects('table')).toEqual({ revealRow: false, centreDiagram: true })
    expect(selectionEffects('details')).toEqual({ revealRow: false, centreDiagram: true })
  })
})
