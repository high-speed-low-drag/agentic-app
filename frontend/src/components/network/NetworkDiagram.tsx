import type { Core, LayoutOptions, NodeSingular, SingularElementArgument, StylesheetJson } from 'cytoscape'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { Maximize, Minus, Plus, Scan } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type { NetworkTopology } from '../../api/schema'
import { cn } from '../../lib/utils'
import type { ChartTheme } from '../charts/theme'
import { useChartTheme } from '../charts/theme'
import type { ElementRef } from './graph'
import { branchTypeColor, buildElements, cyId, parseCyId, rootNodeIds, voltageColor, voltageLevels } from './graph'
import { branchInService, energisedNodes, ISLANDED_TIP, OOS_LABEL, OOS_TIP, OOS_WIDTH } from './energised'
import { useDiagramExpand } from './expandContext'
import { focusZoom, prefersReducedMotion } from './selection'
import type { ShuntKind, SymbolPalette } from './symbols'
import { quantisedAngle, symbolScale, symbolUri } from './symbols'

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

/**
 * Bus-node (`kind = "node"`) geometry, in model px (= rendered px at zoom 1). Every bus-node rule
 * in the stylesheet uses these, so the dot, its rings and its label stay in proportion.
 */
const NODE_SIZE = 9
/** Edited node: slightly larger, so the amber ring reads without the node jumping back to full size. */
const NODE_CHANGED_SIZE = 11
/** Thin ring (surface colour; foreground on result colours) that keeps a small dot readable. */
const NODE_BORDER = 1
const NODE_CHANGED_BORDER = 2
const NODE_SELECTED_BORDER = 2
/** Selection halo padding around a bus node (edges keep their own). */
const NODE_SELECTED_OVERLAY = 3
/** "Not energised" dashed ring. */
const NODE_HOLLOW_BORDER = 1.5
/** Gap between the dot and its label. */
const NODE_LABEL_MARGIN = 1.5
/**
 * Rendered radius (screen px) within which a click selects the nearest bus node, at any zoom.
 * Cytoscape's own hit area is the node's outer size plus 2 px a side (14 px at zoom 1); this
 * keeps a ~14 px target when zoomed out, or when a click lands on something else right beside a node: the
 * background, an edge, an appliance stub, or the rim of an overlapping symbol (see the `tap` handler).
 */
const NODE_HIT_RADIUS = 7

/** The bus node within `NODE_HIT_RADIUS` rendered px of a rendered point, nearest first. */
function busNodeNear(cy: Core, p: { x: number; y: number } | undefined): NodeSingular | null {
  if (!p) return null // a programmatic tap has no position
  let best: NodeSingular | null = null
  let bestSq = NODE_HIT_RADIUS * NODE_HIT_RADIUS
  cy.nodes('[kind = "node"]').forEach((n) => {
    if (!n.visible()) return
    const q = n.renderedPosition()
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    if (d <= bestSq) {
      bestSq = d
      best = n
    }
  })
  return best
}

const distSq = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

/** What a tap on a diagram element selects, or null when the element is not itself selectable (an appliance stub). */
function selectionFor(ele: SingularElementArgument): ElementRef | null {
  const kind = ele.data('kind')
  if (kind === 'hub' || kind === 'branch') return { kind: 'branch', id: Number(ele.data('eid')) }
  if (kind === 'stub') return null
  return parseCyId(String(ele.id()))
}

/**
 * Cytoscape caches the container's page offset and refreshes it only on scroll and resize events. When the
 * diagram moves without one (content above it changes height, or a click lands before the scroll event of a
 * just-finished scroll is dispatched), clicks are projected to the wrong point. Refresh it on every press.
 */
function refreshContainerOffset(cy: Core) {
  const r = (cy as unknown as { renderer?: () => { invalidateContainerClientCoordsCache?: () => void } | undefined }).renderer?.()
  if (r?.invalidateContainerClientCoordsCache) r.invalidateContainerClientCoordsCache()
  else cy.resize()
}

/** Model-space size (px at zoom 1) of each symbol kind. */
const SYMBOL_SIZE: Record<string, number> = { xfmr: 28, xfmr3: 28, grid: 24, gen: 18, shunt: 18 }
function symbolPalette(t: ChartTheme, stroke = t.fg2): SymbolPalette {
  return { stroke, surface: t.surface, muted: t.muted }
}

/** (Re)draw one symbol node's image from its data (kind, voltage levels, status, angle) and the theme. */
function paintSymbol(n: NodeSingular, t: ChartTheme, levels: number[]) {
  const off = Number(n.data('in_service') ?? 1) === 0
  const vc = (u: unknown) => voltageColor(levels, Number(u), t)
  let img = ''
  switch (n.data('sym')) {
    case 'xfmr':
      img = symbolUri.transformer(vc(n.data('u_from')), vc(n.data('u_to')), symbolPalette(t), { off, angle: Number(n.data('angle') ?? 0) })
      break
    case 'xfmr3':
      img = symbolUri.transformer3([vc(n.data('u1')), vc(n.data('u2')), vc(n.data('u3'))], symbolPalette(t), { off })
      break
    case 'gen':
      img = symbolUri.generator(symbolPalette(t, t.series[2]), { off })
      break
    case 'grid':
      img = symbolUri.externalGrid(symbolPalette(t, t.fg), { off })
      break
    case 'shunt':
      img = symbolUri.shunt(n.data('shunt') as ShuntKind, symbolPalette(t), { off })
      break
  }
  if (n.data('img') !== img) n.data({ img, variant: off ? 'off' : 'on' })
}

/**
 * `resultNodes`: bus nodes carry a result colour (overlay), e.g. the voltage scale on the results
 * snapshot. Its mid-scale colours are dim in dark mode, so the ring uses a foreground token there
 * instead of the surface colour, keeping a small dot readable in both themes.
 */
function stylesheet(t: ChartTheme, resultNodes = false): StylesheetJson {
  return [
    {
      selector: 'node',
      style: {
        width: NODE_SIZE,
        height: NODE_SIZE,
        'background-color': 'data(color)',
        'border-width': NODE_BORDER,
        'border-color': resultNodes ? t.fg2 : t.surface,
        label: 'data(label)',
        'font-size': 9,
        color: t.fg2,
        'text-valign': 'bottom',
        'text-margin-y': NODE_LABEL_MARGIN,
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
    // IEC symbols: an SVG image on a transparent, borderless ellipse (the border is the changed/selected ring)
    {
      selector: 'node.sym',
      style: {
        shape: 'ellipse',
        width: 'data(sz)',
        height: 'data(sz)',
        'background-color': t.surface,
        'background-opacity': 0,
        'background-image': 'data(img)',
        'background-fit': 'contain',
        'background-width': '86%',
        'background-height': '86%',
        'background-clip': 'none',
        'background-image-containment': 'over',
        'border-width': 0,
        'border-opacity': 0,
      } as never,
    },
    { selector: 'node.xfmr-symbol', style: { 'background-width': '100%', 'background-height': '100%', label: '' } },
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
      style: { 'border-color': t.warn, 'border-width': NODE_CHANGED_BORDER, 'border-opacity': 1, width: NODE_CHANGED_SIZE, height: NODE_CHANGED_SIZE },
    },
    { selector: 'node.appliance.changed', style: { width: 10, height: 10, 'border-width': 2.5 } },
    { selector: 'node.sym.changed', style: { width: 'data(sz)', height: 'data(sz)', 'border-width': 2, 'border-color': t.warn, 'border-opacity': 1 } },
    {
      selector: 'edge.changed',
      style: { 'underlay-color': t.warn, 'underlay-opacity': 0.55, 'underlay-padding': 4 } as never,
    },
    // status cues come last so they win over the overlay colour/width and the changed halo
    // not energised: no fill, dashed muted ring, a muted × through the centre, italic muted label
    {
      selector: 'node[kind = "node"][energised = 0]',
      style: {
        'background-opacity': 0,
        'background-image': symbolUri.notEnergised(symbolPalette(t)),
        'background-fit': 'contain',
        'background-clip': 'none',
        'border-width': NODE_HOLLOW_BORDER,
        'border-style': 'dashed',
        'border-color': t.muted,
        'border-opacity': 1,
        color: t.muted,
        'font-style': 'italic',
      } as never,
    },
    // edited and not energised: the dashed ring turns amber (keeps the larger changed size)
    { selector: 'node[kind = "node"][energised = 0].changed', style: { 'border-color': t.warn, 'border-width': NODE_CHANGED_BORDER } },
    {
      selector: 'node.appliance[in_service = 0], node.hub[in_service = 0]',
      style: { 'background-opacity': 0, 'border-width': 1.2, 'border-color': t.muted, 'border-opacity': 1 },
    },
    // symbols draw their own out-of-service variant (hollow, muted); keep only the changed ring
    { selector: 'node.sym[in_service = 0]', style: { 'border-width': 0, 'border-opacity': 0 } },
    { selector: 'node.sym.changed[in_service = 0]', style: { 'border-width': 2, 'border-color': t.warn, 'border-opacity': 1 } },
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
    // the transformer symbol sits on the midpoint: lift the "off" marker clear of it
    { selector: 'edge.branch.xfmr[in_service = 0][leg = 0]', style: { 'text-margin-y': -19 } },
    // edited and out of service: a thin amber underlay that keeps the dashes visible, amber marker border
    {
      selector: 'edge.branch.changed[in_service = 0]',
      style: { 'underlay-padding': 1.5, 'underlay-opacity': 0.4, 'text-border-color': t.warn } as never,
    },
    { selector: 'node:selected', style: { 'border-color': t.accent, 'border-width': 3 } },
    {
      selector: 'node[kind = "node"]:selected',
      style: { 'border-width': NODE_SELECTED_BORDER, 'overlay-padding': NODE_SELECTED_OVERLAY },
    },
    { selector: 'node.sym:selected', style: { 'border-width': 2, 'border-opacity': 1 } },
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
  const expand = useDiagramExpand()
  const expanded = !!expand?.expanded
  const fullscreen = !!expand?.fullscreen
  /** Latest expanded state, read when an instance is created (a relayout re-creates it). */
  const expandedRef = useRef(expanded)
  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])
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
  /** Latest theme and voltage levels, for symbol images redrawn from Cytoscape event handlers. */
  const paintRef = useRef({ theme, levels })
  useEffect(() => {
    paintRef.current = { theme, levels }
  }, [theme, levels])

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
      // collapsed: the wheel scrolls the page, zoom with the + / − buttons (this also turns off pinch-zoom);
      // the wheel zooms only in the expanded view, where the diagram fills the window
      userZoomingEnabled: expandedRef.current,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      selectionType: 'single',
    })
    cyRef.current = cy
    if (import.meta.env.DEV) window.__gridsimCy = cy
    cy.on('tap', (evt) => {
      const target: SingularElementArgument | null = evt.target === cy ? null : evt.target
      const own = target ? selectionFor(target) : null
      // small bus dots get a ~14 px target: a tap within NODE_HIT_RADIUS of one selects it, unless the tap is on
      // a selectable symbol or appliance and nearer that element's centre (a programmatic tap has no position)
      const p = evt.renderedPosition
      const near = busNodeNear(cy, p)
      if (near && p) {
        const keep = !!own && !!target?.isNode() && distSq(p, target.renderedPosition()) <= distSq(p, near.renderedPosition())
        if (!keep) {
          onSelectRef.current?.({ kind: 'node', id: Number(near.data('eid')) })
          return
        }
      }
      if (!target) onSelectRef.current?.(null)
      else if (own) onSelectRef.current?.(own)
      // a non-selectable element (an appliance stub) away from any bus node leaves the selection as it is
    })
    // native tooltip for status cues (out of service / not energised)
    cy.on('mouseover', 'node, edge', (evt) => {
      const tip = evt.target.data('tip')
      if (tip) el.title = tip
      else el.removeAttribute('title')
    })
    cy.on('mouseout', 'node, edge', () => el.removeAttribute('title'))
    // 2-winding transformer symbols ride on their edge's midpoint, rotated to the edge angle; they are not laid out
    const placeSymbols = (edges = cy.edges('.xfmr')) => {
      const { theme: t, levels: lv } = paintRef.current
      cy.batch(() => {
        edges.forEach((e) => {
          const sym = cy.getElementById(String(e.data('xf')))
          if (sym.empty()) return
          const a = e.source().position()
          const b = e.target().position()
          sym.position({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
          const angle = quantisedAngle(b.x - a.x, b.y - a.y)
          if (sym.data('angle') !== angle) {
            sym.data('angle', angle)
            paintSymbol(sym as unknown as NodeSingular, t, lv)
          }
        })
      })
    }
    cy.on('position', 'node[kind = "node"]', (evt) => placeSymbols(evt.target.connectedEdges('.xfmr')))
    // symbols keep a legible rendered size across zoom levels
    let scale = 0
    const sizeSymbols = () => {
      const f = symbolScale(cy.zoom())
      if (f === scale) return
      scale = f
      cy.batch(() => cy.nodes('.sym').forEach((n) => void n.data('sz', (SYMBOL_SIZE[n.data('sym')] ?? 20) * f)))
    }
    cy.on('zoom', sizeSymbols)
    // `data-layout-ready` on the root: "1" once the layout (and its fit) has finished, "0" while one runs
    const outer = outerRef.current
    const setReady = (ready: boolean) => outer?.setAttribute('data-layout-ready', ready ? '1' : '0')
    setReady(false)
    let stopped = false
    let afterRun = false
    const lay = cy.elements().not('.xfmr-symbol').layout(layoutOptions(layout, topology, elements.length))
    lay.on('layoutstop', () => {
      stopped = true
      placeSymbols()
      if (afterRun) setReady(true) // an asynchronous layout
    })
    lay.run()
    afterRun = true
    placeSymbols()
    sizeSymbols()
    if (stopped) setReady(true)
    const ro = new ResizeObserver(() => cy.resize())
    ro.observe(el)
    const onPress = () => refreshContainerOffset(cy)
    // capture phase on an ancestor: runs before Cytoscape's own mousedown/touchstart handlers
    outer?.addEventListener('pointerdown', onPress, true)
    return () => {
      outer?.removeEventListener('pointerdown', onPress, true)
      setReady(false)
      ro.disconnect()
      cy.destroy()
      cyRef.current = null
      if (import.meta.env.DEV && window.__gridsimCy === cy) delete window.__gridsimCy
    }
  }, [elements, layout, topology])

  // expanded: wheel zoom on; the container changed size, so resize and refit (the instance itself is kept)
  const sizeKey = useRef(`${expanded}/${fullscreen}`)
  useEffect(() => {
    cyRef.current?.userZoomingEnabled(expanded)
    const key = `${expanded}/${fullscreen}`
    if (sizeKey.current === key) return
    sizeKey.current = key
    const raf = requestAnimationFrame(() => {
      const cy = cyRef.current
      if (!cy) return
      cy.resize()
      cy.fit(undefined, 24)
    })
    return () => cancelAnimationFrame(raf)
  }, [expanded, fullscreen, elements, layout])

  // styling: theme + overlay
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.style(stylesheet(theme, !!overlay?.nodeColor))
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
      cy.nodes('.sym').forEach((n) => paintSymbol(n, theme, levels))
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
      cy.elements('.branch, .hub, .xfmr-symbol').forEach((e) => {
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
      const { theme: t, levels: lv } = paintRef.current
      cy.nodes('.sym').forEach((n) => paintSymbol(n, t, lv))
    })
  }, [status, elements, layout])

  // selection sync
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().unselect()
    if (!selected) return
    const id = cyId(selected.kind, selected.id)
    // a branch selects its edge(s) and, for a 2-winding transformer, its symbol
    const target = selected.kind === 'branch' ? cy.$(`[kind = "branch"][eid = ${selected.id}]`) : cy.getElementById(id)
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
      data-expanded={expanded ? '1' : '0'}
      data-selected={selected ? `${selected.kind}:${selected.id}` : ''}
      className={cn('relative overflow-hidden rounded-md border border-border bg-surface-2', expanded && 'min-h-64', className)}
      style={{ height: expanded ? '100%' : height }}
    >
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
          <Scan size={14} />
        </button>
        {expand && !expand.expanded && (
          <button
            className="border-t border-border p-1.5 text-fg-2 hover:bg-surface-3"
            onClick={expand.expand}
            aria-label="Expand diagram"
            title="Expand diagram"
          >
            <Maximize size={14} />
          </button>
        )}
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
