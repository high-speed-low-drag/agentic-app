import { SlidersHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Limits } from '../../api/schema'
import type { VoltageScale } from '../../lib/voltageScale'
import { DEFAULT_VOLTAGE_SCALE, EDGE_TINT, matchLimits, SCALE_MAX_PU, SCALE_MIN_PU, useVoltageScale, validateScale } from '../../lib/voltageScale'
import type { ChartTheme } from '../charts/theme'
import { mix } from '../charts/theme'
import { Button, Field, IconButton, NumberInput } from '../ui'

const fmt = (v: number) => v.toFixed(2)
const FIELDS = ['Full blue below', 'Band from', 'Band to', 'Full red above'] as const

/**
 * Voltage legend for the snapshot: blue ramp, a flat neutral "within band" section and a red ramp,
 * with ticks at the four scale values, plus an "Edit scale" popover (stored per browser).
 */
export function VoltageScaleLegend({ theme, limits }: { theme: ChartTheme; limits?: Pick<Limits, 'u_min_pu' | 'u_max_pu'> }) {
  const [scale] = useVoltageScale()
  const [open, setOpen] = useState(false)
  const edgeUnder = mix(theme.voltMid, theme.voltUnder, EDGE_TINT)
  const edgeOver = mix(theme.voltMid, theme.voltOver, EDGE_TINT)
  return (
    <div className="relative flex shrink-0 items-center gap-2" data-testid="voltage-legend">
      <span className="font-medium">u</span>
      <div className="flex flex-col">
        <div className="flex h-2 w-40 overflow-hidden rounded-sm">
          <span className="flex-1" style={{ background: `linear-gradient(90deg, ${theme.voltUnder}, ${edgeUnder})` }} />
          <span className="flex-1 border-y border-border" style={{ background: theme.voltMid }} title="within band" />
          <span className="flex-1" style={{ background: `linear-gradient(90deg, ${edgeOver}, ${theme.voltOver})` }} />
        </div>
        <div className="relative mt-0.5 h-3 w-40 text-[10px] text-fg-muted tabular">
          {scale.map((v, i) => (
            <span
              key={i}
              data-testid="voltage-tick"
              className="absolute top-0"
              style={{ left: `${(i / 3) * 100}%`, transform: `translateX(${i === 0 ? '0' : i === 3 ? '-100%' : '-50%'})` }}
            >
              {fmt(v)}
            </span>
          ))}
        </div>
        <span className="w-40 text-center text-[10px] leading-none text-fg-muted">within band</span>
      </div>
      <IconButton
        size="sm"
        label="Edit scale"
        className="pointer-events-auto -my-1 h-6 w-6 shrink-0 border border-border bg-surface text-fg-2 hover:text-fg"
        icon={<SlidersHorizontal size={14} className="shrink-0" />}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && <VoltageScalePopover limits={limits} onClose={() => setOpen(false)} />}
    </div>
  )
}

function VoltageScalePopover({ limits, onClose }: { limits?: Pick<Limits, 'u_min_pu' | 'u_max_pu'>; onClose: () => void }) {
  const [scale, setScale] = useVoltageScale()
  const [draft, setDraft] = useState<(number | null)[]>(() => [...scale])
  const ref = useRef<HTMLDivElement>(null)
  const error = validateScale(draft)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const onDown = (e: MouseEvent) => {
      const el = ref.current
      if (el && !el.contains(e.target as Node) && !(e.target as Element).closest?.('[aria-label="Edit scale"]')) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const apply = (next: (number | null)[]) => {
    setDraft(next)
    // live: valid values apply at once (also during playback); invalid ones are kept only in the form
    if (validateScale(next) === null) setScale(next as unknown as VoltageScale)
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Voltage colour scale"
      data-testid="voltage-scale-popover"
      className="pointer-events-auto absolute bottom-full left-0 z-20 mb-2 w-64 rounded-lg border border-border bg-surface p-3 text-fg shadow-lg"
    >
      <div className="mb-2 text-xs font-semibold">Voltage colour scale</div>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((label, i) => (
          <Field key={label} label={label}>
            {(id) => (
              <NumberInput
                id={id}
                value={draft[i]}
                min={SCALE_MIN_PU}
                max={SCALE_MAX_PU}
                step={0.01}
                unit="pu"
                onChange={(v) => apply(draft.map((x, j) => (j === i ? v : x)))}
              />
            )}
          </Field>
        ))}
      </div>
      {error && (
        <div className="mt-2 text-xs text-bad" role="alert" data-testid="voltage-scale-error">
          {error} Not applied.
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!limits}
          title={limits ? `Band ${fmt(limits.u_min_pu)}–${fmt(limits.u_max_pu)} pu from the run's case limits` : undefined}
          onClick={() => limits && apply([...matchLimits(scale, limits.u_min_pu, limits.u_max_pu)])}
        >
          Match run limits
        </Button>
        <Button size="sm" variant="ghost" onClick={() => apply([...DEFAULT_VOLTAGE_SCALE])}>
          Reset to defaults
        </Button>
      </div>
      <div className="mt-2 text-[11px] text-fg-muted">Saved in this browser; applies to every run.</div>
    </div>
  )
}
