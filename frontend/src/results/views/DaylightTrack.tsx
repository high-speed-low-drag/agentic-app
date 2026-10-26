import { useMemo, type ReactNode } from 'react'
import type { SolarSource } from '../../lib/solar'
import { useElementWidth } from '../../lib/useElementWidth'
import { cn } from '../../lib/utils'
import { MIN_LABEL_PX, trackLayout } from './clock'

/** Half the native range thumb (16 px): the thumb centre runs from this inset to width − inset. */
const THUMB_INSET_PX = 8

const pct = (x: number) => `${(x * 100).toFixed(3)}%`

/**
 * Wraps the native range input and draws a daylight-shaded strip under it: warm segments for daylight, muted for
 * night, thin day dividers and weekday labels (≤ 31 days); month dividers, labels and a seasonal shade beyond that.
 */
export function DaylightTrack({
  startMs,
  stepMs,
  n,
  source,
  className,
  children,
}: {
  startMs: number
  stepMs: number
  n: number
  source: SolarSource
  className?: string
  children: ReactNode
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const layout = useMemo(
    () => trackLayout(startMs, stepMs, n, source.latitude, source.solarNoon),
    [startMs, stepMs, n, source.latitude, source.solarNoon],
  )
  const usable = Math.max(0, width - 2 * THUMB_INSET_PX)
  const perLabel = usable / Math.max(1, layout.mode === 'days' ? layout.nDays : layout.labels.length)
  const inset = { marginLeft: THUMB_INSET_PX, marginRight: THUMB_INSET_PX }

  return (
    <div ref={ref} className={cn('relative', className)} title={source.label} data-testid="daylight-track" data-mode={layout.mode}>
      {children}
      <div className="relative h-2 overflow-hidden rounded-sm bg-night" style={inset} aria-hidden>
        {layout.mode === 'days'
          ? layout.daylight.map((s, i) => (
              <div key={i} data-daylight-segment className="absolute inset-y-0 bg-daylight" style={{ left: pct(s.x0), width: pct(s.x1 - s.x0) }} />
            ))
          : layout.shade.map((s, i) => (
              <div
                key={i}
                className="absolute inset-y-0 bg-daylight"
                style={{ left: pct(s.x0), width: pct(s.x1 - s.x0), opacity: 0.15 + 0.85 * s.level }}
              />
            ))}
        {layout.dividers.map((x, i) => (
          <div key={i} className="absolute inset-y-0 w-px -translate-x-1/2 bg-surface" style={{ left: pct(x) }} />
        ))}
      </div>
      {perLabel >= MIN_LABEL_PX && (
        <div className="relative h-3.5" style={inset} aria-hidden data-testid="daylight-labels">
          {layout.labels.map((l, i) => (
            <span
              key={i}
              className="absolute top-0.5 overflow-hidden text-center text-[10px] leading-none whitespace-nowrap text-fg-muted"
              style={{ left: pct(l.x0), width: pct(l.x1 - l.x0) }}
            >
              {l.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
