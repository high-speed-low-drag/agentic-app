import { describe, expect, it } from 'vitest'
import type { NetworkTopology } from '../api/schema'
import { runTopology } from './useRunContext'

const topo: NetworkTopology = {
  source: 'sample',
  key: 't',
  name: 'T',
  nodes: [
    { id: 1, name: 'N1', u_rated: 10e3 },
    { id: 2, name: 'N2', u_rated: 10e3 },
  ],
  branches: [{ id: 10, type: 'generic_branch', name: 'B1', from_node: 1, to_node: 2, in_service: true, params: { sn: null, from_status: 1, to_status: 1 } }],
  appliances: [{ id: 20, type: 'sym_load', name: 'L1', node: 2, p_specified: 1e6, q_specified: 0, in_service: true, params: { p_specified: 1e6, q_specified: 0, status: 1 } }],
  sources: [],
  counts: {},
}

describe('runTopology', () => {
  it('applies the frozen case overrides to the file topology', () => {
    const e = runTopology(topo, {
      network_overrides: [
        { component: 'generic_branch', id: 10, field: 'from_status', value: 0 },
        { component: 'generic_branch', id: 10, field: 'to_status', value: 0 },
        { component: 'sym_load', id: 20, field: 'p_specified', value: 2e6 },
      ],
    })!
    expect(e.topology.branches[0].in_service).toBe(false)
    expect(e.topology.appliances[0].p_specified).toBe(2e6)
    expect(e.isEdited('branch', 10, 'in_service')).toBe(true)
    expect(topo.branches[0].in_service).toBe(true)
  })

  it('returns the file topology when the case has no overrides', () => {
    expect(runTopology(topo, { network_overrides: [] })!.topology).toBe(topo)
    expect(runTopology(topo, undefined)!.topology).toBe(topo)
    expect(runTopology(undefined, undefined)).toBeUndefined()
  })
})
