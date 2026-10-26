import { createContext, useContext } from 'react'

/** What an expandable network layout tells the diagram inside it. */
export interface DiagramExpand {
  /** The layout fills the browser window. */
  expanded: boolean
  /** The layout is also in true (browser) full screen. */
  fullscreen: boolean
  /** Enter the expanded view. */
  expand: () => void
}

export const ExpandContext = createContext<DiagramExpand | null>(null)

/** The enclosing `ExpandableNetwork`, or null when the diagram is not expandable. */
export const useDiagramExpand = () => useContext(ExpandContext)
