/**
 * Pure placement helpers for the network diagram (T32): elements added by a case are not laid out
 * with the network file but placed afterwards, so adding one never re-runs the layout and the file's
 * nodes keep their positions.
 *
 * - The file's elements are laid out deterministically (`withSeededRandom` around the layout run), so
 *   the case editor and a run's snapshot of the same network draw the same picture and a stored
 *   `NetworkAddition.position` (model coordinates) lands at the same spot in both.
 * - `placeMissing` positions everything the layout did not: added nodes at their stored position or
 *   near their connected neighbours (else a free spot to the right), appliances beside their node.
 */
import type { NetworkAddition, Position } from '../../api/schema'
import { cyId } from './graph'

export type Pt = Position

/** Ideal distance (model px) between connected bus nodes, as in the force-directed layout. */
export const NODE_SPACING = 50
/** Distance (model px) of an appliance from its node. */
export const APPLIANCE_SPACING = 16

/** Deterministic PRNG (mulberry32) returning numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Run `fn` with `Math.random` replaced by a seeded PRNG (restored afterwards, also on error). */
export function withSeededRandom<T>(fn: () => T, seed = 1): T {
  const orig = Math.random
  Math.random = seededRandom(seed)
  try {
    return fn()
  } finally {
    Math.random = orig
  }
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * The point on a circle around `center` that is farthest from every `occupied` point (largest
 * nearest-neighbour distance); ties go to the earliest angle, starting at 0 (right) and turning clockwise.
 */
export function freeSpot(center: Pt, radius: number, occupied: Pt[], steps = 12): Pt {
  let best = { x: center.x + radius, y: center.y }
  let bestD = -1
  let bestSum = -1
  for (let i = 0; i < steps; i++) {
    const a = (2 * Math.PI * i) / steps
    const p = { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) }
    let d = Infinity
    let sum = 0
    for (const o of occupied) {
      const x = dist(p, o)
      d = Math.min(d, x)
      sum += x
    }
    // nearest point first; on a tie (e.g. the centre itself is occupied) the larger total distance
    if (d > bestD + 1e-6 || (Math.abs(d - bestD) <= 1e-6 && sum > bestSum + 1e-6)) {
      best = p
      bestD = d
      bestSum = sum
    }
  }
  return { x: Math.round(best.x * 100) / 100, y: Math.round(best.y * 100) / 100 }
}

/**
 * Position for a new bus node without a stored position: near its positioned neighbours (their
 * centroid when it is free, else the freest spot around it), or right of everything else when it
 * has none. `occupied` are all positioned nodes.
 */
export function positionForNode(neighbours: Pt[], occupied: Pt[], spacing = NODE_SPACING): Pt {
  if (neighbours.length === 0) {
    if (occupied.length === 0) return { x: 0, y: 0 }
    // right of the network, level with its top (further unconnected nodes continue the row)
    return { x: Math.max(...occupied.map((p) => p.x)) + spacing, y: Math.min(...occupied.map((p) => p.y)) }
  }
  const c = { x: neighbours.reduce((s, p) => s + p.x, 0) / neighbours.length, y: neighbours.reduce((s, p) => s + p.y, 0) / neighbours.length }
  if (neighbours.length > 1 && occupied.every((o) => dist(o, c) >= spacing / 2)) return c
  return freeSpot(c, spacing, occupied)
}

/** What `placeMissing` places: bus nodes (by cy id) with their connections, and attached nodes (appliances, sources). */
export interface PlacementInput {
  /** cy ids of bus nodes to position (added nodes), in order */
  buses: string[]
  /** appliance/source nodes to position, each beside its bus node (`anchor`, a cy id) */
  attached: { id: string; anchor: string }[]
  /** bus-to-bus connections (cy ids), used to find a new node's neighbours */
  links: [string, string][]
  /** positions that stay as they are (laid out or kept from before) */
  known: Map<string, Pt>
  /** stored positions (from the additions), by cy id */
  stored?: Map<string, Pt>
}

/**
 * Positions for every node of `input` (known ones unchanged): stored positions first, then new bus
 * nodes connected to a positioned node, repeatedly (so chains of new nodes follow), then the rest at
 * free spots, and finally attached nodes beside their bus node.
 */
export function placeMissing({ buses, attached, links, known, stored }: PlacementInput): Map<string, Pt> {
  const out = new Map(known)
  const neighbours = new Map<string, string[]>()
  for (const [a, b] of links) {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b])
    neighbours.set(b, [...(neighbours.get(b) ?? []), a])
  }
  let todo = buses.filter((id) => !out.has(id))
  for (const id of todo) {
    const s = stored?.get(id)
    if (s) out.set(id, { x: s.x, y: s.y })
  }
  todo = todo.filter((id) => !out.has(id))
  while (todo.length) {
    const ready = todo.find((id) => (neighbours.get(id) ?? []).some((n) => out.has(n)))
    const id = ready ?? todo[0]
    const nb = (neighbours.get(id) ?? []).filter((n) => out.has(n)).map((n) => out.get(n)!)
    out.set(id, positionForNode(nb, [...out.values()]))
    todo = todo.filter((x) => x !== id)
  }
  for (const { id, anchor } of attached) {
    if (out.has(id)) continue
    const at = out.get(anchor)
    if (!at) continue
    const near = [...out.values()].filter((p) => p !== at && dist(p, at) < NODE_SPACING * 1.5)
    out.set(id, freeSpot(at, APPLIANCE_SPACING, near))
  }
  return out
}

/** Stored diagram positions of added nodes, by cy id. */
export function storedPositions(additions: NetworkAddition[] | undefined): Map<string, Pt> {
  const out = new Map<string, Pt>()
  for (const a of additions ?? []) if (a.component === 'node' && a.position) out.set(cyId('node', a.id), a.position)
  return out
}

/** Cy ids of the nodes and edges an addition draws (node, branch edge, appliance + its stub). */
export function additionCyIds(additions: NetworkAddition[] | undefined): Set<string> {
  const out = new Set<string>()
  for (const a of additions ?? []) {
    if (a.component === 'node') out.add(cyId('node', a.id))
    else if (a.component === 'line' || a.component === 'link') out.add(cyId('branch', a.id))
    else {
      out.add(cyId('appliance', a.id))
      out.add(`x${cyId('appliance', a.id)}`)
    }
  }
  return out
}

/** Positions kept from an earlier instance: reusable when the layout choice is the same and every laid-out bus node is in it. */
export interface PositionCache {
  layout: string
  positions: Map<string, Pt>
  viewport: { zoom: number; pan: Pt }
}

export function canReuse(cache: PositionCache | null, layout: string, busIds: string[]): cache is PositionCache {
  return !!cache && cache.layout === layout && busIds.length > 0 && busIds.every((id) => cache.positions.has(id))
}

/** A model position rounded to 0.1 px (what a diagram click stores). */
export const roundPosition = (p: Pt): Pt => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })
