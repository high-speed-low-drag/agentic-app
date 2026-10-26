/**
 * Pure helpers turning a NetworkTopology into Cytoscape elements + colour mappings.
 * Kept free of React so they are easy to test and reuse (editor diagram, snapshot view).
 */
import type { ElementDefinition } from 'cytoscape'
import type { BranchType, NetworkTopology } from '../../api/schema'
import type { ChartTheme } from '../charts/theme'
import { mix } from '../charts/theme'
import { shuntKind } from './symbols'

export type ElementKind = 'node' | 'branch' | 'appliance' | 'source'

export interface ElementRef {
  kind: ElementKind
  id: number
}

export const cyId = (kind: ElementKind, id: number) => `${kind[0]}${id}`

export function parseCyId(s: string): ElementRef | null {
  const m = /^([nbas])(-?\d+)$/.exec(s)
  if (!m) return null
  const kind = ({ n: 'node', b: 'branch', a: 'appliance', s: 'source' } as const)[m[1] as 'n' | 'b' | 'a' | 's']
  return { kind, id: Number(m[2]) }
}

/** Cytoscape id of a 2-winding transformer's symbol overlay node (not part of the layout). */
export const xfmrSymbolId = (branchId: number) => `xf${branchId}`

/** Distinct rated voltages, highest first. */
export function voltageLevels(topo: NetworkTopology): number[] {
  return Array.from(new Set(topo.nodes.map((n) => n.u_rated))).sort((a, b) => b - a)
}

export function voltageColor(levels: number[], u: number, theme: ChartTheme): string {
  const i = levels.indexOf(u)
  return theme.series[(i < 0 ? 0 : i) % theme.series.length]
}

export const BRANCH_TYPE_LABELS: Record<BranchType, string> = {
  line: 'Line',
  link: 'Link',
  transformer: 'Transformer',
  generic_branch: 'Generic branch',
  three_winding_transformer: '3-winding transformer',
  asym_line: 'Asymmetric line',
}

export function branchTypeColor(type: BranchType, theme: ChartTheme): string {
  switch (type) {
    case 'line':
    case 'asym_line':
      return theme.fg2
    case 'link':
      return theme.muted
    case 'transformer':
    case 'three_winding_transformer':
      return theme.series[6]
    case 'generic_branch':
      return theme.series[3]
    default:
      return theme.fg2
  }
}

export interface BuildOptions {
  showAppliances: boolean
  showSources: boolean
}

/** Build cytoscape elements. Colours are attached later via `applyStyling`. */
export function buildElements(topo: NetworkTopology, opts: BuildOptions): ElementDefinition[] {
  const els: ElementDefinition[] = []
  const nodeIds = new Set(topo.nodes.map((n) => n.id))
  const kv = (u: number) => `${+(u / 1000).toFixed(2)} kV`
  const uRated = new Map(topo.nodes.map((n) => [n.id, n.u_rated]))

  for (const n of topo.nodes) {
    els.push({
      group: 'nodes',
      data: { id: cyId('node', n.id), label: n.name, kind: 'node', eid: n.id, u_rated: n.u_rated, sub: kv(n.u_rated), energised: 1 },
    })
  }
  for (const b of topo.branches) {
    if (!nodeIds.has(b.from_node) || !nodeIds.has(b.to_node)) continue
    // `leg` 0 carries the "off" marker when out of service (one per branch, also for 3-winding stars)
    const base = { kind: 'branch', eid: b.id, btype: b.type, label: b.name, in_service: b.in_service ? 1 : 0, leg: 0 }
    if (b.type === 'three_winding_transformer' && b.node_3 != null && nodeIds.has(b.node_3)) {
      // star representation: hidden hub node + three legs, all mapping to the same branch
      const hub = `t${b.id}`
      const u = [b.from_node, b.to_node, b.node_3].map((n) => uRated.get(n))
      els.push({
        group: 'nodes',
        data: { id: hub, kind: 'hub', eid: b.id, label: '', in_service: base.in_service, sym: 'xfmr3', u1: u[0], u2: u[1], u3: u[2] },
        classes: 'hub sym',
      })
      ;[b.from_node, b.to_node, b.node_3].forEach((nid, i) => {
        els.push({
          group: 'edges',
          data: { ...base, id: `${cyId('branch', b.id)}_${i}`, source: hub, target: cyId('node', nid), label: i === 0 ? b.name : '', leg: i },
          classes: 'branch',
        })
      })
    } else if (b.type === 'transformer') {
      // the edge keeps the loading colour/width; an overlay node on its midpoint draws the symbol
      const xf = xfmrSymbolId(b.id)
      els.push({
        group: 'edges',
        data: { ...base, id: cyId('branch', b.id), source: cyId('node', b.from_node), target: cyId('node', b.to_node), xf },
        classes: 'branch xfmr',
      })
      els.push({
        group: 'nodes',
        data: {
          id: xf,
          kind: 'branch',
          eid: b.id,
          label: '',
          in_service: base.in_service,
          sym: 'xfmr',
          edge: cyId('branch', b.id),
          u_from: uRated.get(b.from_node),
          u_to: uRated.get(b.to_node),
          angle: 0,
        },
        classes: 'xfmr-symbol sym',
        grabbable: false,
        pannable: true,
      })
    } else {
      els.push({
        group: 'edges',
        data: { ...base, id: cyId('branch', b.id), source: cyId('node', b.from_node), target: cyId('node', b.to_node) },
        classes: 'branch',
      })
    }
  }
  if (opts.showSources) {
    for (const s of topo.sources) {
      if (!nodeIds.has(s.node)) continue
      els.push({
        group: 'nodes',
        data: { id: cyId('source', s.id), kind: 'source', eid: s.id, label: s.name, sym: 'grid', in_service: 1 },
        classes: 'source sym',
      })
      els.push({
        group: 'edges',
        data: { id: `x${cyId('source', s.id)}`, source: cyId('source', s.id), target: cyId('node', s.node), kind: 'stub' },
        classes: 'stub',
      })
    }
  }
  if (opts.showAppliances) {
    for (const a of topo.appliances) {
      if (!nodeIds.has(a.node)) continue
      const gen = a.type.includes('gen')
      const shunt = a.type === 'shunt'
      const cls = gen ? 'appliance gen sym' : shunt ? 'appliance shunt sym' : 'appliance load'
      const in_service = a.in_service ? 1 : 0
      const sym = gen ? { sym: 'gen' } : shunt ? { sym: 'shunt', shunt: shuntKind(a.b1) } : {}
      els.push({
        group: 'nodes',
        data: { id: cyId('appliance', a.id), kind: 'appliance', eid: a.id, atype: a.type, label: '', in_service, ...sym },
        classes: cls,
      })
      els.push({
        group: 'edges',
        data: { id: `x${cyId('appliance', a.id)}`, source: cyId('appliance', a.id), target: cyId('node', a.node), kind: 'stub', in_service },
        classes: 'stub',
      })
    }
  }
  return els
}

/** Sequential loading colour: 0 -> neutral, 1 -> warn-ish, >= 1.2 -> bad. */
export function loadingColor(l: number | null | undefined, theme: ChartTheme): string {
  if (l === null || l === undefined || !Number.isFinite(l)) return theme.axis
  if (l <= 0.6) return mix(theme.axis, theme.good, l / 0.6)
  if (l <= 1.0) return mix(theme.good, '#eda100', (l - 0.6) / 0.4)
  return mix('#eda100', theme.bad, Math.min(1, (l - 1) / 0.2))
}

/** Node ids where sources connect, useful as breadthfirst roots. */
export function rootNodeIds(topo: NetworkTopology): string[] {
  return topo.sources.map((s) => cyId('node', s.node))
}
