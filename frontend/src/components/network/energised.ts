/**
 * Pure topology status helpers: which branches are in service and which nodes are energised
 * (have an in-service path to an in-service source). Free of React and Cytoscape.
 */
import type { NetworkTopology, TopologyBranch } from '../../api/schema'

/** Out-of-service branch line width (px), its midpoint marker text, and the status tooltips. */
export const OOS_WIDTH = 1.5
export const OOS_LABEL = 'off'
export const OOS_TIP = 'Out of service'
export const ISLANDED_TIP = 'Not energised'

const on = (v: number | null | undefined) => v == null || v !== 0

/** A branch is in service only if its flag is set and both end statuses (when present) are 1. */
export function branchInService(b: Pick<TopologyBranch, 'in_service' | 'params'>): boolean {
  return b.in_service && on(b.params?.from_status) && on(b.params?.to_status)
}

/**
 * Node ids reachable from an in-service source over in-service branches (BFS).
 * Three-winding transformers connect all three nodes when in service; when not, the windings whose
 * own `status_i` is still 1 (if given) stay connected to each other.
 */
export function energisedNodes(topo: NetworkTopology): Set<number> {
  const adj = new Map<number, number[]>()
  const link = (a: number, b: number) => {
    if (a === b) return
    ;(adj.get(a) ?? adj.set(a, []).get(a)!).push(b)
    ;(adj.get(b) ?? adj.set(b, []).get(b)!).push(a)
  }
  for (const b of topo.branches) {
    if (b.type === 'three_winding_transformer' && b.node_3 != null) {
      const nodes = [b.from_node, b.to_node, b.node_3]
      const live = b.in_service
        ? nodes
        : b.params && ['status_1', 'status_2', 'status_3'].some((k) => k in b.params)
          ? nodes.filter((_, i) => on(b.params[`status_${i + 1}`]))
          : []
      for (let i = 1; i < live.length; i++) link(live[0], live[i])
    } else if (branchInService(b)) link(b.from_node, b.to_node)
  }
  const seen = new Set<number>()
  const queue: number[] = []
  for (const s of topo.sources) {
    if (on(s.params?.status) && !seen.has(s.node)) {
      seen.add(s.node)
      queue.push(s.node)
    }
  }
  for (let i = 0; i < queue.length; i++) {
    for (const m of adj.get(queue[i]) ?? []) {
      if (!seen.has(m)) {
        seen.add(m)
        queue.push(m)
      }
    }
  }
  return seen
}
