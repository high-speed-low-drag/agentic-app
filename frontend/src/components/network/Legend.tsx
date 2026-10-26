import type { NetworkTopology } from '../../api/schema'
import type { ChartTheme } from '../charts/theme'
import { BRANCH_TYPE_LABELS, branchTypeColor, voltageColor, voltageLevels } from './graph'

export function Swatch({ color, shape = 'dot' }: { color: string; shape?: 'dot' | 'line' }) {
  return shape === 'line' ? (
    <span className="inline-block h-[3px] w-3.5 rounded-full" style={{ background: color }} />
  ) : (
    <span className="inline-block size-2.5 rounded-full" style={{ background: color }} />
  )
}

/** Default legend: voltage levels + branch types present in the topology. */
export function TopologyLegend({ topology, theme }: { topology: NetworkTopology; theme: ChartTheme }) {
  const levels = voltageLevels(topology)
  const types = Array.from(new Set(topology.branches.map((b) => b.type)))
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
