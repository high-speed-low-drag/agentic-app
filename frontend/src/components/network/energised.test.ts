import { describe, expect, it } from 'vitest'
import type { NetworkTopology, TopologyBranch } from '../../api/schema'
import { branchInService, energisedNodes } from './energised'

const br = (id: number, from: number, to: number, in_service = true, params: TopologyBranch['params'] = {}): TopologyBranch => ({
  id,
  type: 'line',
  name: `L${id}`,
  from_node: from,
  to_node: to,
  in_service,
  params,
})

const topo = (nNodes: number, branches: TopologyBranch[], sourceNodes = [1]): NetworkTopology => ({
  source: 'sample',
  key: 't',
  name: 'T',
  nodes: Array.from({ length: nNodes }, (_, i) => ({ id: i + 1, name: `n${i + 1}`, u_rated: 10500 })),
  branches,
  appliances: [],
  sources: sourceNodes.map((node, i) => ({ id: 100 + i, name: `S${i}`, node, u_ref: 1, params: {} })),
  counts: {} as NetworkTopology['counts'],
})

const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b)

describe('energisedNodes', () => {
  it('radial feeder: switching off the only branch to a node isolates it and everything beyond', () => {
    // 1 - 2 - 3 - 4, with 3 - 5 as a lateral
    const all = [br(10, 1, 2), br(11, 2, 3), br(12, 3, 4), br(13, 3, 5)]
    expect(sorted(energisedNodes(topo(5, all)))).toEqual([1, 2, 3, 4, 5])
    const off = all.map((b) => (b.id === 11 ? { ...b, in_service: false } : b))
    expect(sorted(energisedNodes(topo(5, off)))).toEqual([1, 2])
  })

  it('ring: switching off one branch keeps every node energised', () => {
    const ring = [br(10, 1, 2), br(11, 2, 3), br(12, 3, 4), br(13, 4, 1, false)]
    expect(sorted(energisedNodes(topo(4, ring)))).toEqual([1, 2, 3, 4])
  })

  it('a node is energised by a second source', () => {
    const net = [br(10, 1, 2), br(11, 2, 3, false), br(12, 3, 4)]
    expect(sorted(energisedNodes(topo(4, net)))).toEqual([1, 2])
    expect(sorted(energisedNodes(topo(4, net, [1, 4])))).toEqual([1, 2, 3, 4])
  })

  it('treats a branch with either end status 0 as out of service, and skips switched-off sources', () => {
    expect(branchInService(br(1, 1, 2, true, { from_status: 1, to_status: 0 }))).toBe(false)
    expect(branchInService(br(1, 1, 2, true, { from_status: 1, to_status: 1 }))).toBe(true)
    const t = topo(2, [br(10, 1, 2, true, { to_status: 0 })])
    expect(sorted(energisedNodes(t))).toEqual([1])
    t.sources[0].params = { status: 0 }
    expect(sorted(energisedNodes(t))).toEqual([])
  })
})
