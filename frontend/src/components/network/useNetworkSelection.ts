import { useCallback, useRef, useState } from 'react'
import type { ElementTableHandle } from './ElementTable'
import type { ElementRef } from './graph'
import type { NetworkDiagramHandle } from './NetworkDiagram'
import type { SelectionSource } from './selection'
import { selectionEffects } from './selection'

/**
 * Shared diagram/table/details selection. `focusElement(ref, source)` sets the selection and runs
 * the side effects for that source once, from the event (never from an effect, so nothing loops):
 * - 'diagram': quietly select the row in the table (switch tab, scroll inside the table only);
 * - 'table' / 'details': centre the diagram on the element if it is on screen.
 * `revealInTable` ("Edit in table") is the only path that jumps to the table (page scroll, flash,
 * clear hiding filters).
 */
export function useNetworkSelection() {
  const [selected, setSelected] = useState<ElementRef | null>(null)
  const tableRef = useRef<ElementTableHandle>(null)
  const diagramRef = useRef<NetworkDiagramHandle>(null)

  const run = useCallback((ref: ElementRef | null, source: SelectionSource, reveal: boolean) => {
    setSelected(ref)
    if (!ref) return
    const fx = selectionEffects(source, reveal)
    if (fx.table === 'quiet') tableRef.current?.select(ref)
    if (fx.table === 'reveal') tableRef.current?.reveal(ref)
    if (fx.centreDiagram) diagramRef.current?.centerOn(ref)
  }, [])

  const focusElement = useCallback((ref: ElementRef | null, source: SelectionSource) => run(ref, source, false), [run])

  /** "Edit in table": jump to the element's row, ready to edit. */
  const revealInTable = useCallback((ref: ElementRef) => run(ref, 'details', true), [run])

  const backToDiagram = useCallback(() => diagramRef.current?.scrollIntoView(), [])

  return { selected, focusElement, revealInTable, backToDiagram, tableRef, diagramRef }
}
