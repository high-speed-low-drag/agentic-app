/**
 * Diagram edit mode (T32): add equipment by clicking on the case editor's network diagram.
 * A pure state machine: diagram clicks and Esc go in, the next state and (when a click completes
 * an element) a seed for the add form come out.
 */
import type { AddableComponent, AddableComponentSpec, Position } from '../../api/schema'
import type { AdditionSeed } from './additions'
import { roundPosition } from './placement'

export type EditTool = Extract<AddableComponent, 'node' | 'line' | 'link' | 'sym_load' | 'sym_gen' | 'shunt'>

/** Toolbar order and labels. */
export const EDIT_TOOLS: { tool: EditTool; label: string }[] = [
  { tool: 'node', label: 'Node' },
  { tool: 'line', label: 'Line' },
  { tool: 'link', label: 'Link' },
  { tool: 'sym_load', label: 'Load' },
  { tool: 'sym_gen', label: 'Generator' },
  { tool: 'shunt', label: 'Shunt' },
]

/** The tools offered for the addable components (in toolbar order). */
export function availableTools(specs: Pick<AddableComponentSpec, 'component'>[] | undefined): typeof EDIT_TOOLS {
  const have = new Set((specs ?? []).map((s) => s.component))
  return EDIT_TOOLS.filter((t) => have.has(t.tool))
}

export interface EditState {
  tool: EditTool
  /** first node of a half-drawn line/link */
  first: number | null
}

export type EditEvent =
  | { type: 'tool'; tool: EditTool }
  /** a click on the diagram: the bus node under the pointer (or null for empty canvas) and the model position */
  | { type: 'click'; node: number | null; position: Position }
  | { type: 'escape' }

export interface EditStep {
  state: EditState
  /** open the add form with this seed */
  seed?: AdditionSeed
  /** the event did something (an Esc that cancelled a half-drawn line must not also close the overlay) */
  handled: boolean
}

const isBranch = (t: EditTool) => t === 'line' || t === 'link'

export const initialEditState = (tool: EditTool = 'node'): EditState => ({ tool, first: null })

export function editStep(state: EditState, event: EditEvent): EditStep {
  switch (event.type) {
    case 'tool':
      return { state: { tool: event.tool, first: null }, handled: true }
    case 'escape':
      return state.first === null ? { state, handled: false } : { state: { ...state, first: null }, handled: true }
    case 'click': {
      const { tool } = state
      if (tool === 'node') {
        // empty canvas only: a click on a node does not place another node on top of it
        if (event.node !== null) return { state, handled: false }
        return { state, seed: { component: 'node', position: roundPosition(event.position) }, handled: true }
      }
      if (event.node === null) return { state, handled: false }
      if (isBranch(tool)) {
        if (state.first === null) return { state: { ...state, first: event.node }, handled: true }
        // the same node again cancels the half-drawn line
        if (state.first === event.node) return { state: { ...state, first: null }, handled: true }
        return { state: { ...state, first: null }, seed: { component: tool, attrs: { from_node: state.first, to_node: event.node } }, handled: true }
      }
      return { state, seed: { component: tool, attrs: { node: event.node } }, handled: true }
    }
  }
}

const APPLIANCE_WORD: Partial<Record<EditTool, string>> = { sym_load: 'a load', sym_gen: 'a generator', shunt: 'a shunt' }

/** The hint line under the toolbar. */
export function editHint(state: EditState, nodeName?: (id: number) => string | undefined): string {
  if (state.tool === 'node') return 'Click empty canvas to place a node'
  if (isBranch(state.tool)) {
    if (state.first === null) return `Click the first node of the ${state.tool}`
    const name = nodeName?.(state.first)
    return `Click the second node${name ? ` (from ${name})` : ''} — Esc or the same node cancels`
  }
  return `Click a node to attach ${APPLIANCE_WORD[state.tool]}`
}
