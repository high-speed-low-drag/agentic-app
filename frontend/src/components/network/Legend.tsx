import type { NetworkTopology } from '../../api/schema'
import type { ChartTheme } from '../charts/theme'
import { useMemo } from 'react'
import { branchInService, energisedNodes, ISLANDED_TIP, OOS_TIP } from './energised'
import { BRANCH_TYPE_LABELS, branchTypeColor, voltageColor, voltageLevels } from './graph'
import type { ShuntKind } from './symbols'
import { shuntKind, symbolUri } from './symbols'

export function Swatch({ color, shape = 'dot' }: { color: string; shape?: 'dot' | 'line' }) {
  return shape === 'line' ? (
    <span className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: color }} />
  ) : (
    <span className="inline-block size-2.5 rounded-full" style={{ background: color }} />
  )
}

/** A diagram symbol as a small legend icon (the same SVG the diagram draws). */
function SymbolIcon({ src, label, wide }: { src: string; label: string; wide?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1" data-testid="legend-symbol" data-symbol={label}>
      <img src={src} alt="" aria-hidden className={wide ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      {label}
    </span>
  )
}

/** Legend entries for the equipment symbols present in `topology` (transformer, generator, external grid, shunt). */
export function SymbolLegend({ topology, theme }: { topology: NetworkTopology; theme: ChartTheme }) {
  const icons = useMemo(() => {
    const levels = voltageLevels(topology)
    const p = { stroke: theme.fg2, surface: theme.surface, muted: theme.muted }
    const out: { label: string; src: string; wide?: boolean }[] = []
    if (topology.branches.some((b) => b.type === 'transformer' || b.type === 'three_winding_transformer')) {
      const hi = voltageColor(levels, levels[0] ?? 0, theme)
      const lo = voltageColor(levels, levels[1] ?? levels[0] ?? 0, theme)
      out.push({ label: 'Transformer', src: symbolUri.transformer(hi, lo, p), wide: true })
    }
    if (topology.appliances.some((a) => a.type.includes('gen'))) {
      out.push({ label: 'Generator', src: symbolUri.generator({ ...p, stroke: theme.series[2] }) })
    }
    if (topology.sources.length) out.push({ label: 'External grid', src: symbolUri.externalGrid({ ...p, stroke: theme.fg }) })
    const kinds = new Set<ShuntKind>(topology.appliances.filter((a) => a.type === 'shunt').map((a) => shuntKind(a.b1)))
    const shuntLabels: Record<ShuntKind, string> = { capacitor: 'Capacitor', reactor: 'Reactor', generic: 'Shunt' }
    for (const k of ['capacitor', 'reactor', 'generic'] as const) {
      if (kinds.has(k)) out.push({ label: shuntLabels[k], src: symbolUri.shunt(k, p) })
    }
    return out
  }, [topology, theme])
  if (!icons.length) return null
  return (
    <>
      <span className="h-3 w-px bg-border" />
      {icons.map((i) => (
        <SymbolIcon key={i.label} {...i} />
      ))}
    </>
  )
}

/** Legend entries for the status cues; each shows only when such elements exist in `topology`. */
export function StatusLegend({ topology, theme }: { topology: NetworkTopology; theme: ChartTheme }) {
  const { off, islanded } = useMemo(() => {
    const energised = energisedNodes(topology)
    return {
      off: topology.branches.some((b) => !branchInService(b)) || topology.appliances.some((a) => !a.in_service),
      islanded: topology.nodes.some((n) => !energised.has(n.id)),
    }
  }, [topology])
  if (!off && !islanded) return null
  return (
    <span data-testid="status-legend" className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="h-3 w-px bg-border" />
      {off && (
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3.5 border-t-[1.5px] border-dashed" style={{ borderColor: theme.muted }} />
          {OOS_TIP}
        </span>
      )}
      {islanded && (
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full border-2" style={{ borderColor: theme.muted }} />
          {ISLANDED_TIP}
        </span>
      )}
    </span>
  )
}

/**
 * Default legend: voltage levels + branch types present in the topology. `status` (the effective
 * topology) adds the out-of-service / not-energised entries.
 */
export function TopologyLegend({
  topology,
  theme,
  changed,
  status,
}: {
  topology: NetworkTopology
  theme: ChartTheme
  changed?: boolean
  status?: NetworkTopology
}) {
  const levels = voltageLevels(topology)
  // transformers are drawn as symbols (SymbolLegend), the other branch types as coloured lines
  const types = Array.from(new Set(topology.branches.map((b) => b.type))).filter(
    (t) => t !== 'transformer' && t !== 'three_winding_transformer',
  )
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {levels.slice(0, 8).map((u) => (
        <span key={u} className="inline-flex items-center gap-1">
          <Swatch color={voltageColor(levels, u, theme)} />
          {+(u / 1000).toFixed(2)} kV
        </span>
      ))}
      <span className="h-3 w-px bg-border" />
      {types.map((t) => (
        <span key={t} className="inline-flex items-center gap-1">
          <Swatch shape="line" color={branchTypeColor(t, theme)} />
          {BRANCH_TYPE_LABELS[t] ?? t}
        </span>
      ))}
      <SymbolLegend topology={topology} theme={theme} />
      {changed && (
        <>
          <span className="h-3 w-px bg-border" />
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full border-2" style={{ borderColor: theme.warn }} />
            Changed
          </span>
        </>
      )}
      <StatusLegend topology={status ?? topology} theme={theme} />
    </div>
  )
}

/** Gradient legend bar for value overlays. */
export function GradientLegend({
  label,
  stops,
  ticks,
}: {
  label: string
  stops: string[]
  ticks: string[]
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium">{label}</span>
      <div className="flex flex-col">
        <span className="h-2 w-32 rounded-sm" style={{ background: `linear-gradient(90deg, ${stops.join(',')})` }} />
        <span className="mt-0.5 flex w-32 justify-between text-[10px] text-fg-muted tabular">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </span>
      </div>
    </div>
  )
}
