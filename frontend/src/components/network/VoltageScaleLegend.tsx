import type { VoltageLimits } from '../../lib/voltageScale'
import { voltageStops } from '../../lib/voltageScale'
import type { ChartTheme } from '../charts/theme'

const fmt = (v: number) => v.toFixed(2)

/**
 * Read-only voltage legend for the snapshot: the five-stop ramp (blue, teal, green, yellow, red) with ticks at the
 * run's `u_min`, 1.00 and `u_max`. The ramp is drawn in equal fifths, so each tick sits under its stop.
 */
export function VoltageScaleLegend({ theme, limits }: { theme: ChartTheme; limits: VoltageLimits }) {
  const stops = voltageStops(limits, theme)
  const ticks = [
    { at: 0, label: fmt(limits.u_min_pu) },
    { at: 50, label: fmt(1) },
    { at: 100, label: fmt(limits.u_max_pu) },
  ]
  return (
    <div className="flex shrink-0 items-center gap-2" data-testid="voltage-legend" title="Limits from the run settings">
      <span className="font-medium">u</span>
      <div className="flex flex-col">
        <div className="h-2 w-40 rounded-sm" style={{ background: `linear-gradient(90deg, ${stops.map((s) => s.color).join(', ')})` }} />
        <div className="relative mt-0.5 h-3 w-40 text-[10px] text-fg-muted tabular">
          {ticks.map((t, i) => (
            <span
              key={i}
              data-testid="voltage-tick"
              className="absolute top-0"
              style={{ left: `${t.at}%`, transform: `translateX(${i === 0 ? '0' : i === 2 ? '-100%' : '-50%'})` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
