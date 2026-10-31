import { describe, expect, it } from 'vitest'
import type { NetworkAddition } from '../../api/schema'
import type { PositionCache } from './placement'
import { additionCyIds, APPLIANCE_SPACING, canReuse, freeSpot, NODE_SPACING, placeMissing, positionForNode, seededRandom, storedPositions, withSeededRandom } from './placement'

const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe('seeded random', () => {
  it('is deterministic and restores Math.random', () => {
    const a = seededRandom(1)
    const b = seededRandom(1)
    const xs = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(xs)
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    const orig = Math.random
    const r1 = withSeededRandom(() => [Math.random(), Math.random()])
    const r2 = withSeededRandom(() => [Math.random(), Math.random()])
    expect(r1).toEqual(r2)
    expect(Math.random).toBe(orig)
    expect(() => withSeededRandom(() => { throw new Error('x') })).toThrow('x')
    expect(Math.random).toBe(orig)
  })
})

describe('freeSpot / positionForNode', () => {
  it('picks the point on the circle farthest from occupied points', () => {
    // an occupied point to the right: the spot goes left
    const p = freeSpot({ x: 0, y: 0 }, 10, [{ x: 10, y: 0 }])
    expect(p).toEqual({ x: -10, y: 0 })
    // nothing occupied: angle 0 (right)
    expect(freeSpot({ x: 0, y: 0 }, 10, [])).toEqual({ x: 10, y: 0 })
  })

  it('places a node with one neighbour at the spacing, away from the others', () => {
    const nb = { x: 0, y: 0 }
    const p = positionForNode([nb], [nb, { x: 50, y: 0 }])
    expect(d(p, nb)).toBeCloseTo(NODE_SPACING, 1)
    expect(p.x).toBeLessThan(0)
  })

  it('uses the centroid of several neighbours when it is free', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 100, y: 0 }
    expect(positionForNode([a, b], [a, b])).toEqual({ x: 50, y: 0 })
    // occupied centroid: the freest spot around it instead
    const p = positionForNode([a, b], [a, b, { x: 50, y: 0 }])
    expect(d(p, { x: 50, y: 0 })).toBeCloseTo(NODE_SPACING, 1)
  })

  it('places an unconnected node right of the network', () => {
    expect(positionForNode([], [{ x: 0, y: 10 }, { x: 200, y: 40 }])).toEqual({ x: 250, y: 10 })
    expect(positionForNode([], [])).toEqual({ x: 0, y: 0 })
  })
})

describe('placeMissing', () => {
  const known = new Map([
    ['n1', { x: 0, y: 0 }],
    ['n2', { x: 100, y: 0 }],
  ])

  it('keeps known positions and uses stored ones', () => {
    const out = placeMissing({ buses: ['n9'], attached: [], links: [['n1', 'n9']], known, stored: new Map([['n9', { x: 5, y: 77 }]]) })
    expect(out.get('n1')).toEqual({ x: 0, y: 0 })
    expect(out.get('n2')).toEqual({ x: 100, y: 0 })
    expect(out.get('n9')).toEqual({ x: 5, y: 77 })
  })

  it('places a node without a stored position next to its neighbour, chains follow', () => {
    // n10 hangs off n9, which hangs off n2; listed in reverse order
    const out = placeMissing({ buses: ['n10', 'n9'], attached: [], links: [['n2', 'n9'], ['n9', 'n10']], known })
    expect(d(out.get('n9')!, known.get('n2')!)).toBeCloseTo(NODE_SPACING, 1)
    expect(d(out.get('n10')!, out.get('n9')!)).toBeCloseTo(NODE_SPACING, 1)
  })

  it('places appliances beside their node', () => {
    const out = placeMissing({ buses: [], attached: [{ id: 'a5', anchor: 'n1' }, { id: 'a6', anchor: 'nX' }], links: [], known })
    expect(d(out.get('a5')!, known.get('n1')!)).toBeCloseTo(APPLIANCE_SPACING, 1)
    expect(out.has('a6')).toBe(false) // unknown anchor
  })
})

describe('addition ids / stored positions / cache', () => {
  const adds: NetworkAddition[] = [
    { component: 'node', id: 9, name: 'N', attrs: { u_rated: 1 }, position: { x: 1, y: 2 } },
    { component: 'node', id: 10, name: 'M', attrs: { u_rated: 1 }, position: null },
    { component: 'line', id: 11, name: 'L', attrs: { from_node: 9, to_node: 10 } },
    { component: 'sym_load', id: 12, name: 'P', attrs: { node: 9 } },
  ]

  it('maps additions to cy ids and stored positions', () => {
    expect([...additionCyIds(adds)]).toEqual(['n9', 'n10', 'b11', 'a12', 'xa12'])
    expect([...storedPositions(adds)]).toEqual([['n9', { x: 1, y: 2 }]])
  })

  it('reuses a cache only for the same layout covering every laid-out bus node', () => {
    const cache: PositionCache = { layout: 'auto', positions: new Map([['n1', { x: 0, y: 0 }]]), viewport: { zoom: 1, pan: { x: 0, y: 0 } } }
    expect(canReuse(cache, 'auto', ['n1'])).toBe(true)
    expect(canReuse(cache, 'force', ['n1'])).toBe(false)
    expect(canReuse(cache, 'auto', ['n1', 'n2'])).toBe(false)
    expect(canReuse(null, 'auto', ['n1'])).toBe(false)
  })
})
