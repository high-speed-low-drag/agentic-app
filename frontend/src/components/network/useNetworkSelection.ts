import { useCallback, useRef, useState } from 'react'
import type { ElementTableHandle } from './ElementTable'
import type { ElementRef } from './graph'
import type { NetworkDiagramHandle } from './NetworkDiagram'
import type { SelectionSource } from './selection'
import { selectionEffects } from './selection'

/**
 * Shared diagram/table/details selection. `focusElement(ref, source)` sets the selection and runs
 * the side effects for that source once, from the event (never from an effect, so nothing loops):
 * - 'diagram': reveal the row in the table (switch tab, clear hiding filters, scroll, flash);
 * - 'table' / 'details': centre the diagram on the element if it is on screen.
 */
export function useNetworkSelection() {
  const [selected, setSelected] = useState<ElementRef | null>(null)
  const tableRef = useRef<ElementTableHandle>(null)
  const diagramRef = useRef<NetworkDiagramHandle>(null)

  const focusElement = useCallback((ref: ElementRef | null, source: SelectionSource) => {
    setSelected(ref)
    if (!ref) return
    const fx = selectionEffects(source)
    if (fx.revealRow) tableRef.current?.reveal(ref)
    if (fx.centreDiagram) diagramRef.current?.centerOn(ref)
  }, [])

  /** "Edit in table": the same jump as a diagram pick, for the current element. */
  const revealInTable = useCallback((ref: ElementRef) => {
    setSelected(ref)
    tableRef.current?.reveal(ref)
  }, [])

  const backToDiagram = useCallback(() => diagramRef.current?.scrollIntoView(), [])

  return { selected, focusElement, revealInTable, backToDiagram, tableRef, diagramRef }
}
