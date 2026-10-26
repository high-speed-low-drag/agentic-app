import type { Core, LayoutOptions, StylesheetJson } from 'cytoscape'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { Maximize2, Minus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import type { NetworkTopology } from '../../api/schema'
import { cn } from '../../lib/utils'
import type { ChartTheme } from '../charts/theme'
import { useChartTheme } from '../charts/theme'
import type { ElementRef } from './graph'
import { branchTypeColor, buildElements, cyId, parseCyId, rootNodeIds, voltageColor, voltageLevels } from './graph'

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
  /** Elements to mark as changed (amber ring/halo), as `kind:id` keys, e.g. "branch:47". */
  changed?: Set<string>
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
    { selector: 'edge[in_service = 0]', style: { 'line-style': 'dashed', opacity: 0.5 } },
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
  changed,
}: NetworkDiagramProps) {
  const theme = useChartTheme()
  const ref = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
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
    cy.layout(layoutOptions(layout, topology, elements.length)).run()
    const ro = new ResizeObserver(() => cy.resize())
    ro.observe(el)
    return () => {
      ro.disconnect()
      cy.destroy()
      cyRef.current = null
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

  const zoom = (f: number) => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom({ level: cy.zoom() * f, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }

  return (
    <div data-testid="network-diagram" data-changed-count={changed?.size ?? 0} className={cn('relative overflow-hidden rounded-md border border-border bg-surface-2', className)} style={{ height }}>
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
      {legend && (
        <div className="pointer-events-none absolute bottom-2 left-2 max-w-[70%] rounded-md border border-border bg-surface/90 px-2.5 py-1.5 text-xs text-fg-2 shadow-sm backdrop-blur">
          {legend}
        </div>
      )}
    </div>
  )
}
