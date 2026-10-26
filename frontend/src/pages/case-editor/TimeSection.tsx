import { AlertTriangle, Clock } from 'lucide-react'
import type { CalculationMethod, CaseStudy } from '../../api/schema'
import { Card, CardBody, CardHeader, Field, NumberInput, Segmented, Select, TextInput } from '../../components/ui'
import {
  applyDurationPreset,
  computeTimesteps,
  describeWindow,
  DURATION_PRESETS,
  fromDatetimeLocal,
  MAX_TIMESTEPS,
  RESOLUTION_PRESETS,
  toDatetimeLocal,
} from '../../lib/time'

const METHODS: { value: CalculationMethod; label: string }[] = [
  { value: 'newton_raphson', label: 'Newton-Raphson' },
  { value: 'iterative_current', label: 'Iterative current' },
  { value: 'linear', label: 'Linear' },
  { value: 'linear_current', label: 'Linear current' },
]

export function TimeSection({ draft, onChange }: { draft: CaseStudy; onChange: (c: CaseStudy) => void }) {
  const t = draft.time
  const n = computeTimesteps(t)
  const isPreset = (RESOLUTION_PRESETS as readonly number[]).includes(t.resolution_minutes)
  const setTime = (patch: Partial<CaseStudy['time']>) => onChange({ ...draft, time: { ...t, ...patch } })
  const tooMany = n > MAX_TIMESTEPS
  const iterative = draft.calculation.method === 'newton_raphson' || draft.calculation.method === 'iterative_current'

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Time window" description="Timesteps run from start (inclusive) to end (exclusive)." icon={<Clock size={16} />} />
        <CardBody className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
            <Field label="Start">
              {(id) => (
                <TextInput id={id} type="datetime-local" value={toDatetimeLocal(t.start)} onChange={(e) => setTime({ start: fromDatetimeLocal(e.target.value) })} />
              )}
            </Field>
            <Field label="End" error={n <= 0 ? 'End must be after start' : undefined}>
              {(id) => (
                <TextInput id={id} type="datetime-local" value={toDatetimeLocal(t.end)} onChange={(e) => setTime({ end: fromDatetimeLocal(e.target.value) })} />
              )}
            </Field>
            <Field label="Quick duration">
              <div className="flex flex-wrap gap-1">
                {DURATION_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="h-9 rounded-md border border-border px-2.5 text-xs font-medium text-fg-2 hover:border-border-strong hover:bg-surface-3"
                    onClick={() => onChange({ ...draft, time: applyDurationPreset(t, p) })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Resolution">
              <Segmented
                value={isPreset ? t.resolution_minutes : -1}
                onChange={(v) => setTime({ resolution_minutes: v === -1 ? (isPreset ? 10 : t.resolution_minutes) : v })}
                options={[
                  ...RESOLUTION_PRESETS.map((m) => ({ value: m as number, label: m === 60 ? '1 h' : `${m} min` })),
                  { value: -1, label: 'Custom' },
                ]}
              />
            </Field>
            {!isPreset && (
              <Field label="Custom resolution" className="w-40">
                {(id) => (
                  <NumberInput id={id} integer min={1} max={1440} unit="min" value={t.resolution_minutes} onChange={(v) => v !== null && setTime({ resolution_minutes: v })} />
                )}
              </Field>
            )}
            <div className="ml-auto flex items-center gap-6 rounded-md border border-border bg-surface-2 px-4 py-2">
              <div>
                <div className="text-xs text-fg-muted">Duration</div>
                <div className="text-sm font-semibold tabular">{describeWindow(t)}</div>
              </div>
              <div>
                <div className="text-xs text-fg-muted">Timesteps</div>
                <div className={`text-sm font-semibold tabular ${tooMany ? 'text-bad' : ''}`}>{n.toLocaleString()}</div>
              </div>
            </div>
          </div>
          {tooMany && (
            <div className="flex items-center gap-2 text-xs text-bad">
              <AlertTriangle size={14} />
              At most {MAX_TIMESTEPS.toLocaleString()} timesteps are allowed. Shorten the window or coarsen the resolution.
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Calculation" description="power-grid-model power flow settings." />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Field label="Method" className="sm:col-span-3">
              {(id) => (
                <Select
                  id={id}
                  value={draft.calculation.method}
                  options={METHODS}
                  onChange={(m) => onChange({ ...draft, calculation: { ...draft.calculation, method: m } })}
                />
              )}
            </Field>
            <Field label="Error tolerance" hint={iterative ? undefined : 'Not used by linear methods'}>
              {(id) => (
                <NumberInput
                  id={id}
                  min={0}
                  disabled={!iterative}
                  value={draft.calculation.error_tolerance}
                  onChange={(v) => v !== null && onChange({ ...draft, calculation: { ...draft.calculation, error_tolerance: v } })}
                />
              )}
            </Field>
            <Field label="Max iterations">
              {(id) => (
                <NumberInput
                  id={id}
                  integer
                  min={1}
                  disabled={!iterative}
                  value={draft.calculation.max_iterations}
                  onChange={(v) => v !== null && onChange({ ...draft, calculation: { ...draft.calculation, max_iterations: v } })}
                />
              )}
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Limits" description="Thresholds used to flag violations in the results." />
          <CardBody className="grid gap-4 sm:grid-cols-3">
            <Field label="u min" error={draft.limits.u_min_pu >= draft.limits.u_max_pu ? 'Must be below u max' : undefined}>
              {(id) => (
                <NumberInput id={id} unit="pu" min={0} value={draft.limits.u_min_pu} onChange={(v) => v !== null && onChange({ ...draft, limits: { ...draft.limits, u_min_pu: v } })} />
              )}
            </Field>
            <Field label="u max">
              {(id) => (
                <NumberInput id={id} unit="pu" min={0} value={draft.limits.u_max_pu} onChange={(v) => v !== null && onChange({ ...draft, limits: { ...draft.limits, u_max_pu: v } })} />
              )}
            </Field>
            <Field label="Loading max" hint={`${Math.round(draft.limits.loading_max * 100)} % of rating`}>
              {(id) => (
                <NumberInput id={id} min={0} value={draft.limits.loading_max} onChange={(v) => v !== null && onChange({ ...draft, limits: { ...draft.limits, loading_max: v } })} />
              )}
            </Field>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
