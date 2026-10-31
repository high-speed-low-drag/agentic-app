import { useMemo, useState } from 'react'
import { useTimeseries } from '../../api/hooks'
import type { ResultComponent, TimeseriesQuery } from '../../api/schema'
import { RESULT_FIELDS } from '../../api/schema'
import { ErrorState, Field, MultiSelect, Segmented, Select } from '../../components/ui'
import { fieldLabel, fmtPct, fmtPu } from '../../lib/format'
import { type LimitLine, loadingLimitLines, voltageLimitLines } from '../limitLines'
import { TimeseriesChart } from '../TimeseriesChart'
import type { ResultViewProps } from '../types'
import { worstIds } from '../worst'
import { useRunContext } from '../useRunContext'

const COMPONENTS: { value: ResultComponent; label: string }[] = [
  { value: 'node', label: 'Nodes' },
  { value: 'branch', label: 'Branches' },
  { value: 'source', label: 'Sources' },
  { value: 'appliance', label: 'Appliances' },
]

export function ElementTimeseriesView({ runId, summary }: ResultViewProps) {
  const ctx = useRunContext(runId)
  const [component, setComponent] = useState<ResultComponent>('node')
  const [field, setField] = useState<string>('u_pu')
  const [picked, setPicked] = useState<Partial<Record<ResultComponent, number[]>>>({})

  const options = useMemo(() => {
    const t = ctx.topology
    switch (component) {
      case 'node':
        return summary.nodes.map((n) => ({ value: n.id, label: n.name, hint: `${fmtPu(n.u_min_pu)}–${fmtPu(n.u_max_pu)}` }))
      case 'branch':
        return summary.branches.map((b) => ({ value: b.id, label: b.name, hint: fmtPct(b.loading_max) }))
      case 'source':
        return (t?.sources ?? []).map((s) => ({ value: s.id, label: s.name }))
      case 'appliance':
        return (t?.appliances ?? []).map((a) => ({ value: a.id, label: a.name, hint: a.type }))
    }
  }, [component, summary, ctx.topology])

  const defaultIds = useMemo(() => {
    const w = worstIds(summary, component)
    return w.length ? w : options.slice(0, 5).map((o) => o.value)
  }, [summary, component, options])
  const ids = picked[component] ?? defaultIds

  const query = useMemo<TimeseriesQuery | null>(() => (ids.length ? { component, field, ids } : null), [component, field, ids])
  const q = useTimeseries(runId, query)

  const limits = useMemo<LimitLine[]>(() => {
    if (component === 'node' && field === 'u_pu') return voltageLimitLines(ctx.limits)
    if (component === 'branch' && field === 'loading') return loadingLimitLines(ctx.limits)
    return []
  }, [component, field, ctx.limits])

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="grid content-start gap-3">
        <Field label="Component">
          <Segmented
            size="sm"
            value={component}
            onChange={(c) => {
              setComponent(c)
              setField(RESULT_FIELDS[c][0])
            }}
            options={COMPONENTS}
          />
        </Field>
        <Field label="Field">
          {(id) => (
            <Select id={id} value={field} onChange={setField} options={RESULT_FIELDS[component].map((f) => ({ value: f, label: `${fieldLabel(f)} · ${f}` }))} />
          )}
        </Field>
        <Field label="Elements" hint={picked[component] ? undefined : 'Default: worst 5 from the summary'}>
          <MultiSelect options={options} value={ids} onChange={(v) => setPicked((p) => ({ ...p, [component]: v }))} maxHeight={260} />
        </Field>
      </div>
      <div className="min-w-0">
        {q.error ? (
          <ErrorState error={q.error} title="Could not load time series" onRetry={() => void q.refetch()} />
        ) : ids.length === 0 ? (
          <div className="grid h-[400px] place-items-center rounded-md border border-dashed border-border text-sm text-fg-muted">
            Select one or more elements to plot.
          </div>
        ) : (
          <TimeseriesChart data={q.data} limits={limits} height={420} loading={q.isFetching} />
        )}
      </div>
    </div>
  )
}
