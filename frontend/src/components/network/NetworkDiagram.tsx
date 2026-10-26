import type { Core, LayoutOptions, StylesheetJson } from 'cytoscape'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { Maximize2, Minus, Plus } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { NetworkTopology } from '../../api/schema'
import { cn } from '../../lib/utils'
import type { ChartTheme } from '../charts/theme'
import { useChartTheme } from '../charts/theme'
import type { ElementRef } from './graph'
import { branchTypeColor, buildElements, cyId, parseCyId, rootNodeIds, voltageColor, voltageLevels } from './graph'
import { branchInService, energisedNodes, ISLANDED_TIP, OOS_LABEL, OOS_TIP, OOS_WIDTH } from './energised'
import { focusZoom, prefersReducedMotion } from './selection'

declare global {
  interface Window {
    /** Dev/test only: the most recently created diagram's Cytoscape instance (used by Playwright). */
    __gridsimCy?: Core
  }
}

/** Imperative handle for selection side effects driven from outside the diagram. */
export interface NetworkDiagramHandle {
  /** Animate to centre an element, if the diagram is at least partly on screen. Returns whether it did. */
  centerOn: (ref: ElementRef) => boolean
  /** Scroll the page so the diagram is visible. */
  scrollIntoView: () => void
}

let registered = false
function ensureRegistered() {
  if (!registered) {
    cytoscape.use(fcose)
    registered = true
  }
}

export type DiagramLayout = 'auto' | 'tree' | 'force'

export interface DiagramOverlay {
  /** colour per node id (overrides voltage-level colouring) */
  nodeColor?: (id: number) => string
  /** colour per branch id (overrides branch-type colouring) */
  branchColor?: (id: number) => string
  /** width per branch id (px) */
  branchWidth?: (id: number) => number
}

export interface NetworkDiagramProps {
  topology: NetworkTopology
  selected?: ElementRef | null
  onSelect?: (ref: ElementRef | null) => void
  overlay?: DiagramOverlay
  /** Changes to this key re-apply overlay styles (cheap, no relayout). */
  overlayKey?: string | number
  showAppliances?: boolean
  showSources?: boolean
  layout?: DiagramLayout
  height?: number | string
  className?: string
  legend?: ReactNode
  /** Non-interactive overlay at the bottom-right, opposite the legend (which then wraps to leave it room). */
  corner?: ReactNode
  /** Elements to mark as changed (amber ring/halo), as `kind:id` keys, e.g. "branch:47". */
  changed?: Set<string>
  /**
   * The topology whose statuses are drawn (out-of-service branches/appliances, non-energised nodes),
   * e.g. the case's effective topology with overrides applied. Defaults to `topology`. Applied in
   * place without re-layout; `topology` alone drives the layout.
   */
  statusTopology?: NetworkTopology
  ref?: Ref<NetworkDiagramHandle>
}

function stylesheet(t: ChartTheme): StylesheetJson {
  return [
    {
      selector: 'node',
      style: {
        width: 14,
        height: 14,
        'background-color': 'data(color)',
        'border-width': 1.5,
        'border-color': t.surface,
        label: 'data(label)',
        'font-size': 9,
        color: t.fg2,
        'text-valign': 'bottom',
        'text-margin-y': 3,
        'min-zoomed-font-size': 7,
        'text-background-color': t.surface,
        'text-background-opacity': 0.7,
        'text-background-padding': '1px',
      },
    },
    { selector: 'node.hub', style: { width: 8, height: 8, shape: 'diamond', 'background-color': t.series[6], label: '' } },
    {
      selector: 'node.source',
      style: { shape: 'round-rectangle', width: 16, height: 16, 'background-color': t.fg, 'font-size': 8 },
    },
    {
      selector: 'node.appliance',
      style: { width: 7, height: 7, 'border-width': 0, 'background-color': t.muted, label: '' },
    },
    { selector: 'node.load', style: { shape: 'triangle' } },
    { selector: 'node.gen', style: { shape: 'ellipse', 'background-color': t.series[2] } },
    { selector: 'node.shunt', style: { shape: 'rectangle' } },
    {
      selector: 'edge',
      style: {
        width: 'data(width)',
        'line-color': 'data(color)',
        'curve-style': 'bezier',
        label: '',
        opacity: 0.9,
      },
    },
    { selector: 'edge.stub', style: { width: 0.8, 'line-color': t.axis, 'line-style': 'dotted' } },
    {
      selector: ':selected',
      style: { 'overlay-color': t.accent, 'overlay-opacity': 0.25, 'overlay-padding': 5 },
    },
    {
      selector: 'node.changed',
      style: { 'border-color': t.warn, 'border-width': 3, 'border-opacity': 1, width: 16, height: 16 },
    },
    { selector: 'node.appliance.changed', style: { width: 10, height: 10, 'border-width': 2.5 } },
    {
      selector: 'edge.changed',
      style: { 'underlay-color': t.warn, 'underlay-opacity': 0.55, 'underlay-padding': 4 } as never,
    },
    // status cues come last so they win over the overlay colour/width and the changed halo
    {
      selector: 'node[kind = "node"][energised = 0]',
      style: { 'background-opacity': 0, 'border-width': 2, 'border-color': t.muted, 'border-opacity': 1 },
    },
    {
      selector: 'node.appliance[in_service = 0], node.hub[in_service = 0]',
      style: { 'background-opacity': 0, 'border-width': 1.2, 'border-color': t.muted, 'border-opacity': 1 },
    },
    { selector: 'edge.stub[in_service = 0]', style: { 'line-style': 'dashed', 'line-dash-pattern': [3, 2], 'line-color': t.muted, width: 0.8 } },
    {
      selector: 'edge.branch[in_service = 0]',
      style: { width: OOS_WIDTH, 'line-color': t.muted, 'line-style': 'dashed', 'line-dash-pattern': [6, 5], opacity: 1 },
    },
    {
      selector: 'edge.branch[in_service = 0][leg = 0]',
      style: {
        label: OOS_LABEL,
        'font-size': 8,
        'font-weight': 600,
        color: t.fg2,
        'text-rotation': 'none',
        'text-background-color': t.surface,
        'text-background-opacity': 1,
        'text-background-padding': '1.5px',
        'text-background-shape': 'roundrectangle',
        'text-border-width': 1,
        'text-border-color': t.muted,
        'text-border-opacity': 1,
        'min-zoomed-font-size': 5,
      },
    },
    // edited and out of service: a thin amber underlay that keeps the dashes visible, amber marker border
    {
      selector: 'edge.branch.changed[in_service = 0]',
      style: { 'underlay-padding': 1.5, 'underlay-opacity': 0.4, 'text-border-color': t.warn } as never,
    },
    { selector: 'node:selected', style: { 'border-color': t.accent, 'border-width': 3 } },
  ]
}

function layoutOptions(kind: DiagramLayout, topo: NetworkTopology, nElements: number): LayoutOptions {
  const roots = rootNodeIds(topo)
  const tree = kind === 'tree' || (kind === 'auto' && topo.branches.length <= topo.nodes.length && roots.length > 0)
  if (tree && roots.length) {
    return {
      name: 'breadthfirst',
      roots: roots.map((r) => `#${r}`).join(','),
      directed: false,
      spacingFactor: 1.1,
      animate: false,
      fit: true,
      padding: 24,
      circle: false,
    } as LayoutOptions
  }
  return {
    name: 'fcose',
    quality: nElements > 1500 ? 'draft' : 'default',
    randomize: true,
    animate: false,
    fit: true,
    padding: 24,
    nodeRepulsion: 6000,
    idealEdgeLength: (e: { data: (k: string) => unknown }) => (e.data('kind') === 'stub' ? 10 : 50),
    edgeElasticity: (e: { data: (k: string) => unknown }) => (e.data('kind') === 'stub' ? 0.9 : 0.45),
    numIter: 2500,
  } as LayoutOptions
}

/**
 * Interactive Cytoscape network diagram. Layout runs once per topology/layout choice;
 * colours (theme, overlay) are applied in place without re-layout.
 */
export function NetworkDiagram({
  topology,
  selected,
  onSelect,
  overlay,
  overlayKey,
  showAppliances = true,
  showSources = true,
  layout = 'auto',
  height = 480,
  className,
  legend,
  corner,
  changed,
  statusTopology,
  ref: handleRef,
}: NetworkDiagramProps) {
  const theme = useChartTheme()
  const ref = useRef<HTMLDivElement>(null)
  const outerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  /** Whether the diagram is at least partly in the viewport (IntersectionObserver). */
  const visibleRef = useRef(true)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const elements = useMemo(
    () => buildElements(topology, { showAppliances, showSources }),
    [topology, showAppliances, showSources],
  )
  const levels = useMemo(() => voltageLevels(topology), [topology])
  const branchTypes = useMemo(() => new Map(topology.branches.map((b) => [b.id, b.type])), [topology])

  // create / destroy instance per element set + layout
  useEffect(() => {
    ensureRegistered()
    const el = ref.current
    if (!el) return
    const cy = cytoscape({
      container: el,
      elements,
      minZoom: 0.05,
      maxZoom: 6,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
      selectionType: 'single',
    })
    cyRef.current = cy
    if (import.meta.env.DEV) window.__gridsimCy = cy
    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        onSelectRef.current?.(null)
        return
      }
      const raw = String(evt.target.id())
      const ele = evt.target
      if (ele.data('kind') === 'hub' || ele.data('kind') === 'branch') {
        onSelectRef.current?.({ kind: 'branch', id: Number(ele.data('eid')) })
        return
      }
      if (ele.data('kind') === 'stub') return
      const r = parseCyId(raw)
      if (r) onSelectRef.current?.(r)
    })
    // native tooltip for status cues (out of service / not energised)
    cy.on('mouseover', 'node, edge', (evt) => {
      const tip = evt.target.data('tip')
      if (tip) el.title = tip
      else el.removeAttribute('title')
    })
    cy.on('mouseout', 'node, edge', () => el.removeAttribute('title'))
    cy.layout(layoutOptions(layout, topology, elements.length)).run()
    const ro = new ResizeObserver(() => cy.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      cy.destroy()
      cyRef.current = null
      if (import.meta.env.DEV && window.__gridsimCy === cy) delete window.__gridsimCy
    }
  }, [elements, layout, topology])

  // styling: theme + overlay
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.style(stylesheet(theme))
      cy.nodes('[kind = "node"]').forEach((n) => {
        const id = Number(n.data('eid'))
        n.data('color', overlay?.nodeColor ? overlay.nodeColor(id) : voltageColor(levels, Number(n.data('u_rated')), theme))
      })
      cy.edges('.branch').forEach((e) => {
        const id = Number(e.data('eid'))
        const type = branchTypes.get(id) ?? 'line'
        e.data('color', overlay?.branchColor ? overlay.branchColor(id) : branchTypeColor(type, theme))
        e.data('width', overlay?.branchWidth ? overlay.branchWidth(id) : type === 'line' || type === 'asym_line' ? 1.8 : 2.6)
      })
    })
    // overlayKey intentionally retriggers this effect
  }, [theme, overlay, overlayKey, levels, branchTypes, elements, layout])

  // changed-element markers
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.elements().removeClass('changed')
      for (const key of changed ?? []) {
        const [kind, raw] = key.split(':')
        const id = Number(raw)
        if (kind === 'branch') cy.$(`[kind = "branch"][eid = ${id}], [kind = "hub"][eid = ${id}]`).addClass('changed')
        else cy.getElementById(cyId(kind as ElementRef['kind'], id)).addClass('changed')
      }
    })
  }, [changed, elements, layout])

  // statuses: out-of-service branches/appliances and non-energised nodes, from the status topology
  const status = useMemo(() => {
    const st = statusTopology ?? topology
    return {
      branchOff: new Set(st.branches.filter((b) => !branchInService(b)).map((b) => b.id)),
      applianceOff: new Set(st.appliances.filter((a) => !a.in_service).map((a) => a.id)),
      energised: energisedNodes(st),
    }
  }, [statusTopology, topology])
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.elements('.branch, .hub').forEach((e) => {
        const off = status.branchOff.has(Number(e.data('eid')))
        e.data({ in_service: off ? 0 : 1, tip: off ? OOS_TIP : '' })
      })
      cy.nodes('.appliance').forEach((a) => {
        const off = status.applianceOff.has(Number(a.data('eid')))
        a.data({ in_service: off ? 0 : 1, tip: off ? OOS_TIP : '' })
        a.connectedEdges('.stub').data('in_service', off ? 0 : 1)
      })
      cy.nodes('[kind = "node"]').forEach((n) => {
        const on = status.energised.has(Number(n.data('eid')))
        n.data({ energised: on ? 1 : 0, tip: on ? '' : ISLANDED_TIP })
      })
    })
  }, [status, elements, layout])

  // selection sync
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().unselect()
    if (!selected) return
    const id = cyId(selected.kind, selected.id)
    const target =
      selected.kind === 'branch' ? cy.edges(`[kind = "branch"][eid = ${selected.id}]`) : cy.getElementById(id)
    target.select()
  }, [selected, elements, layout])

  useEffect(() => {
    const el = outerRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useImperativeHandle(
    handleRef,
    () => ({
      centerOn: (sel: ElementRef) => {
        const cy = cyRef.current
        if (!cy || !visibleRef.current) return false
        const target = sel.kind === 'branch' ? cy.$(`[kind = "branch"][eid = ${sel.id}], [kind = "hub"][eid = ${sel.id}]`) : cy.getElementById(cyId(sel.kind, sel.id))
        if (target.empty()) return false
        const bb = target.boundingBox()
        const level = focusZoom(cy.zoom(), cy.maxZoom())
        const pan = { x: cy.width() / 2 - level * (bb.x1 + bb.w / 2), y: cy.height() / 2 - level * (bb.y1 + bb.h / 2) }
        cy.stop()
        if (prefersReducedMotion()) cy.viewport({ zoom: level, pan })
        else cy.animate({ zoom: level, pan }, { duration: 350, easing: 'ease-in-out-cubic' })
        return true
      },
      scrollIntoView: () => outerRef.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }),
    }),
    [],
  )

  const zoom = (f: number) => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom({ level: cy.zoom() * f, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }

  return (
    <div
      ref={outerRef}
      data-testid="network-diagram"
      data-changed-count={changed?.size ?? 0}
      data-out-of-service-count={status.branchOff.size + status.applianceOff.size}
      data-not-energised-count={topology.nodes.length - status.energised.size}
      data-selected={selected ? `${selected.kind}:${selected.id}` : ''}
      className={cn('relative overflow-hidden rounded-md border border-border bg-surface-2', className)} style={{ height }}>
      <div ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute top-2 right-2 flex flex-col overflow-hidden rounded-md border border-border bg-surface shadow-sm">
        <button className="p-1.5 text-fg-2 hover:bg-surface-3" onClick={() => zoom(1.25)} aria-label="Zoom in" title="Zoom in">
          <Plus size={14} />
        </button>
        <button className="p-1.5 text-fg-2 hover:bg-surface-3" onClick={() => zoom(0.8)} aria-label="Zoom out" title="Zoom out">
          <Minus size={14} />
        </button>
        <button
          className="p-1.5 text-fg-2 hover:bg-surface-3"
          onClick={() => cyRef.current?.fit(undefined, 24)}
          aria-label="Fit"
          title="Fit to view"
        >
          <Maximize2 size={14} />
        </button>
      </div>
      {(legend || corner) && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
          {legend ? (
            <div className="max-w-[70%] min-w-0 rounded-md border border-border bg-surface/90 px-2.5 py-1.5 text-xs text-fg-2 shadow-sm backdrop-blur">
              {legend}
            </div>
          ) : (
            <span />
          )}
          {corner && <div className="shrink-0">{corner}</div>}
        </div>
      )}
    </div>
  )
}
