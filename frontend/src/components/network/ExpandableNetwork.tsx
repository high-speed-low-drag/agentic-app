import { Fullscreen, Minimize } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { Button } from '../ui'
import type { DiagramExpand } from './expandContext'
import { ExpandContext } from './expandContext'

export interface ExpandableState {
  expanded: boolean
  /** Leave the expanded view. `restoreFocus: false` skips moving focus back to the Expand button. */
  collapse: (opts?: { restoreFocus?: boolean }) => void
}

/** Overflow of every scrolling ancestor is locked while expanded, so nothing behind the overlay scrolls. */
function lockScroll(from: HTMLElement) {
  const locked: [HTMLElement, string][] = []
  for (let el: HTMLElement | null = from.parentElement; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY
    if (el === document.body || el === document.documentElement || oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
      locked.push([el, el.style.overflow])
      el.style.overflow = 'hidden'
    }
  }
  return () => locked.forEach(([el, v]) => (el.style.overflow = v))
}

/**
 * Layout wrapper that can fill the browser window ("expanded"). The expanded view is the same element switched to
 * `position: fixed`, not a portal, so everything inside (the Cytoscape instance, its selection, zoom and pan, the
 * playback state) stays mounted. It adds a header with Collapse and (when the browser allows it) Full screen, closes
 * on Esc, locks page scrolling and returns the focus to the diagram's Expand button.
 *
 * `children` may be a function of the state, so the layout can adapt (the diagram fills the available height, the
 * table is left out, ...). The diagram inside reads the state through `useDiagramExpand`.
 */
export function ExpandableNetwork({
  title,
  className,
  children,
}: {
  title: string
  /** Layout classes while collapsed. */
  className?: string
  children: ReactNode | ((state: ExpandableState) => ReactNode)
}) {
  // elements are held as state (not refs) so the callbacks below can go into context and the render-prop
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const collapseButtonRef = useRef<HTMLButtonElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  /** Collapsed height, held as a spacer while the layout is fixed so the page behind does not jump. */
  const [spacer, setSpacer] = useState(0)

  const expand = useCallback(() => {
    setSpacer(root?.offsetHeight ?? 0)
    setExpanded(true)
  }, [root])
  const collapse = useCallback((opts?: { restoreFocus?: boolean }) => {
    setExpanded(false)
    // the Expand button is back once the collapsed layout has rendered
    if (opts?.restoreFocus !== false) {
      requestAnimationFrame(() => root?.querySelector<HTMLButtonElement>('button[aria-label="Expand diagram"]')?.focus())
    }
  }, [root])

  useLayoutEffect(() => {
    if (!expanded || !root) return
    return lockScroll(root)
  }, [expanded, root])

  useEffect(() => {
    if (expanded) collapseButtonRef.current?.focus()
  }, [expanded])

  // Esc collapses. Browsers use the first Esc to leave true full screen themselves (the page never sees it).
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.fullscreenElement) return
      // the voltage-scale popover closes itself on Esc; leave the overlay for the next one
      if (document.querySelector('[data-testid="voltage-scale-popover"]')) return
      collapse()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded, collapse])

  // true full screen: keep the state in sync with the browser, which can also leave it by itself
  useEffect(() => {
    const onChange = () => setFullscreen(!!root && document.fullscreenElement === root)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [root])
  // collapsing (or unmounting) while in full screen leaves it too
  useEffect(() => {
    if (!root || expanded) return
    if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => undefined)
  }, [expanded, root])
  useEffect(() => {
    if (!root) return
    return () => {
      if (document.fullscreenElement === root) void document.exitFullscreen().catch(() => undefined)
    }
  }, [root])
  const toggleFullscreen = () => {
    if (!root) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void root.requestFullscreen().catch(() => undefined)
  }

  const ctx = useMemo<DiagramExpand>(() => ({ expanded, fullscreen, expand }), [expanded, fullscreen, expand])
  const state = useMemo<ExpandableState>(() => ({ expanded, collapse }), [expanded, collapse])

  return (
    <ExpandContext.Provider value={ctx}>
      {expanded && <div aria-hidden style={{ height: spacer }} />}
      <div
        ref={setRoot}
        data-testid="expandable-network"
        data-expanded={expanded ? '1' : '0'}
        {...(expanded ? { role: 'dialog', 'aria-modal': true, 'aria-label': title } : {})}
        className={cn(
          expanded
            ? 'fixed inset-0 z-50 flex min-h-0 flex-col gap-3 overscroll-contain bg-bg p-3 text-fg sm:p-4'
            : className,
        )}
      >
        {expanded && (
          <div className="flex shrink-0 items-center gap-3">
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{title}</h2>
            {typeof document !== 'undefined' && document.fullscreenEnabled && (
              <Button size="sm" icon={<Fullscreen size={14} />} aria-pressed={fullscreen} onClick={toggleFullscreen}>
                {fullscreen ? 'Exit full screen' : 'Full screen'}
              </Button>
            )}
            <Button ref={collapseButtonRef} size="sm" icon={<Minimize size={14} />} aria-label="Collapse diagram" onClick={() => collapse()}>
              Collapse
            </Button>
          </div>
        )}
        {typeof children === 'function' ? children(state) : children}
      </div>
    </ExpandContext.Provider>
  )
}
