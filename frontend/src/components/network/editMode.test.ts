import { describe, expect, it } from 'vitest'
import type { EditState } from './editMode'
import { availableTools, editHint, editStep, initialEditState } from './editMode'

const at = { x: 12.345, y: -7.06 }

describe('editStep', () => {
  it('places a node on empty canvas at the rounded model position', () => {
    const r = editStep(initialEditState('node'), { type: 'click', node: null, position: at })
    expect(r.seed).toEqual({ component: 'node', position: { x: 12.3, y: -7.1 } })
    expect(r.handled).toBe(true)
  })

  it('ignores a node click with the node tool', () => {
    const r = editStep(initialEditState('node'), { type: 'click', node: 3, position: at })
    expect(r.seed).toBeUndefined()
    expect(r.handled).toBe(false)
  })

  it('draws a line: first node, then second node opens the form with from/to', () => {
    let s: EditState = initialEditState('line')
    const r1 = editStep(s, { type: 'click', node: 4, position: at })
    expect(r1.state.first).toBe(4)
    expect(r1.seed).toBeUndefined()
    s = r1.state
    // empty canvas keeps the half-drawn line
    expect(editStep(s, { type: 'click', node: null, position: at }).state.first).toBe(4)
    const r2 = editStep(s, { type: 'click', node: 9, position: at })
    expect(r2.seed).toEqual({ component: 'line', attrs: { from_node: 4, to_node: 9 } })
    expect(r2.state.first).toBeNull()
  })

  it('draws a link the same way', () => {
    const s = editStep(initialEditState('link'), { type: 'click', node: 1, position: at }).state
    expect(editStep(s, { type: 'click', node: 2, position: at }).seed).toEqual({ component: 'link', attrs: { from_node: 1, to_node: 2 } })
  })

  it('cancels a half-drawn line with the same node or Esc', () => {
    const s = editStep(initialEditState('line'), { type: 'click', node: 4, position: at }).state
    const same = editStep(s, { type: 'click', node: 4, position: at })
    expect(same.state.first).toBeNull()
    expect(same.seed).toBeUndefined()
    const esc = editStep(s, { type: 'escape' })
    expect(esc.state.first).toBeNull()
    expect(esc.handled).toBe(true)
  })

  it('leaves Esc unhandled when nothing is half drawn (the overlay may close)', () => {
    const s = initialEditState('line')
    const r = editStep(s, { type: 'escape' })
    expect(r.handled).toBe(false)
    expect(r.state).toBe(s)
  })

  it('attaches appliances to the clicked node', () => {
    for (const tool of ['sym_load', 'sym_gen', 'shunt'] as const) {
      expect(editStep(initialEditState(tool), { type: 'click', node: 7, position: at }).seed).toEqual({ component: tool, attrs: { node: 7 } })
      expect(editStep(initialEditState(tool), { type: 'click', node: null, position: at }).seed).toBeUndefined()
    }
  })

  it('switching tools drops a half-drawn line', () => {
    const s = editStep(initialEditState('line'), { type: 'click', node: 4, position: at }).state
    expect(editStep(s, { type: 'tool', tool: 'sym_load' }).state).toEqual({ tool: 'sym_load', first: null })
  })
})

describe('editHint / availableTools', () => {
  it('describes the next click', () => {
    expect(editHint(initialEditState('node'))).toBe('Click empty canvas to place a node')
    expect(editHint(initialEditState('line'))).toBe('Click the first node of the line')
    expect(editHint({ tool: 'line', first: 3 }, () => 'KNP 3')).toBe('Click the second node (from KNP 3) — Esc or the same node cancels')
    expect(editHint(initialEditState('shunt'))).toBe('Click a node to attach a shunt')
  })

  it('offers tools for the addable components only, in toolbar order', () => {
    expect(availableTools([{ component: 'shunt' }, { component: 'node' }]).map((t) => t.tool)).toEqual(['node', 'shunt'])
    expect(availableTools(undefined)).toEqual([])
  })
})
