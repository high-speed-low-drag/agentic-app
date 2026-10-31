import { daylight, fmtClockHour, isDaylight, type SolarSource } from '../../lib/solar'
import { cn } from '../../lib/utils'
import { clockLabels } from './clock'

const DIAL = 112
const C = DIAL / 2
const R = 36 // radius of the day/night ring
const RING = 9

/** Point on the 24-hour dial: midnight at the top, clockwise. */
function polar(hour: number, r: number): [number, number] {
  const a = (hour / 24) * 2 * Math.PI
  return [C + r * Math.sin(a), C - r * Math.cos(a)]
}

function arc(from: number, to: number, r: number): string {
  const span = (((to - from) % 24) + 24) % 24
  const [x0, y0] = polar(from, r)
  const [x1, y1] = polar(to, r)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

/**
 * 24-hour day/night clock overlay for the network snapshot: a dial with the daylight arc and a hand at the current
 * time, the digital time, date, a Daylight/Night badge and sunrise/sunset. `compact` shows the digital time only.
 */
export function SnapshotClock({ ms, source, compact = false, className }: { ms: number; source: SolarSource; compact?: boolean; className?: string }) {
  const { time, date, hour } = clockLabels(ms)
  const day = isDaylight(ms, source.latitude, source.solarNoon)
  const dl = daylight(new Date(ms), source.latitude, source.solarNoon)
  const sun =
    dl.sunrise === null || dl.sunset === null
      ? 'No sunrise'
      : dl.kind === 'polar-day'
        ? 'Sun up all day'
        : `Sunrise ${fmtClockHour(dl.sunrise)} · sunset ${fmtClockHour(dl.sunset)}`
  const [hx, hy] = polar(hour, R - RING / 2 - 4)

  return (
    <div
      data-testid="snapshot-clock"
      data-daylight={day ? 'day' : 'night'}
      title={source.label}
      aria-label={`${time}, ${date}, ${day ? 'daylight' : 'night'}. ${sun}. ${source.label}`}
      className={cn(
        'pointer-events-none flex items-center gap-2.5 rounded-md border border-border bg-surface/90 px-2 py-1.5 text-xs text-fg-2 shadow-sm backdrop-blur',
        className,
      )}
    >
      {!compact && (
        <svg width={DIAL} height={DIAL} viewBox={`0 0 ${DIAL} ${DIAL}`} aria-hidden className="shrink-0">
          <circle cx={C} cy={C} r={R} fill="none" stroke="var(--c-night)" strokeWidth={RING} />
          {dl.kind === 'polar-day' && <circle cx={C} cy={C} r={R} fill="none" stroke="var(--c-daylight)" strokeWidth={RING} />}
          {dl.kind === 'normal' && dl.sunrise !== null && dl.sunset !== null && (
            <path d={arc(dl.sunrise, dl.sunset, R)} fill="none" stroke="var(--c-daylight)" strokeWidth={RING} />
          )}
          {Array.from({ length: 24 }, (_, h) => {
            const [x0, y0] = polar(h, R - RING / 2)
            const [x1, y1] = polar(h, R + RING / 2)
            return <line key={h} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--c-surface)" strokeWidth={h % 6 === 0 ? 1.5 : 0.75} />
          })}
          {[0, 6, 12, 18].map((h) => {
            const [x, y] = polar(h, R + RING / 2 + 7)
            return (
              <text key={h} x={x} y={y} fontSize={9} textAnchor="middle" dominantBaseline="central" fill="var(--c-fg-muted)" className="tabular">
                {String(h).padStart(2, '0')}
              </text>
            )
          })}
          <line x1={C} y1={C} x2={hx} y2={hy} stroke="var(--c-fg)" strokeWidth={2} strokeLinecap="round" />
          <circle cx={C} cy={C} r={3} fill="var(--c-fg)" />
        </svg>
      )}
      <div className="grid gap-1">
        <div data-testid="clock-time" className="font-mono text-lg leading-none font-semibold text-fg tabular">
          {time}
        </div>
        {!compact && (
          <>
            <div data-testid="clock-date" className="text-fg-2">
              {date}
            </div>
            <div>
              <span
                data-testid="clock-daylight"
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                  day ? 'border-warn-border bg-warn-soft text-warn' : 'border-border bg-surface-3 text-fg-2',
                )}
              >
                {day ? 'Daylight' : 'Night'}
              </span>
            </div>
            <div className="text-[11px] whitespace-nowrap text-fg-muted tabular">{sun}</div>
          </>
        )}
      </div>
    </div>
  )
}
