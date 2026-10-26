import { ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTimeseries } from '../../api/hooks'
import type { BranchExtremes, NodeExtremes, Violation } from '../../api/schema'
import type { Column } from '../../components/ui'
import { Badge, EmptyState, ErrorState, Modal, Table, Tabs } from '../../components/ui'
import { fmtDateTime, fmtInt, fmtPct, fmtPu } from '../../lib/format'
import { TimeseriesChart } from '../TimeseriesChart'
import type { ResultViewProps } from '../types'
import { useRunContext } from '../useRunContext'

type Focus = { component: 'node' | 'branch'; id: number; name: string } | null

const KIND_TONE = { undervoltage: 'bad', overvoltage: 'warn', overloading: 'bad' } as const

function fmtValue(component: 'node' | 'branch', v: number | null | undefined) {
  return component === 'node' ? `${fmtPu(v)} pu` : fmtPct(v)
}

export function ViolationsView({ runId, summary }: ResultViewProps) {
  const [tab, setTab] = useState<'episodes' | 'nodes' | 'branches'>(summary.violations.length ? 'episodes' : 'nodes')
  const [focus, setFocus] = useState<Focus>(null)
  const { limits } = useRunContext(runId)

  const episodeCols: Column<Violation>[] = [
    { key: 'name', header: 'Element', sortValue: (v) => v.name, cell: (v) => <span className="font-medium">{v.name}</span> },
    { key: 'component', header: 'Type', sortValue: (v) => v.component, cell: (v) => <Badge>{v.component}</Badge> },
    { key: 'kind', header: 'Kind', sortValue: (v) => v.kind, cell: (v) => <Badge tone={KIND_TONE[v.kind] ?? 'bad'}>{v.kind}</Badge> },
    { key: 'start', header: 'Start', sortValue: (v) => v.start, cell: (v) => <span className="text-fg-2">{fmtDateTime(v.start)}</span> },
    { key: 'end', header: 'End', sortValue: (v) => v.end, cell: (v) => <span className="text-fg-2">{fmtDateTime(v.end)}</span> },
    { key: 'n', header: 'Steps', align: 'right', sortValue: (v) => v.n_timesteps, cell: (v) => <span className="tabular">{fmtInt(v.n_timesteps)}</span> },
    {
      key: 'worst',
      header: 'Worst',
      align: 'right',
      sortValue: (v) => (v.kind === 'undervoltage' ? -v.worst_value : v.worst_value),
      cell: (v) => <span className="font-medium text-bad tabular">{fmtValue(v.component, v.worst_value)}</span>,
    },
    { key: 'limit', header: 'Limit', align: 'right', sortValue: (v) => v.limit, cell: (v) => <span className="text-fg-muted tabular">{fmtValue(v.component, v.limit)}</span> },
  ]

  const nodeCols: Column<NodeExtremes>[] = [
    { key: 'name', header: 'Node', sortValue: (n) => n.name, cell: (n) => <span className="font-medium">{n.name}</span> },
    {
      key: 'min',
      header: 'u min',
      align: 'right',
      sortValue: (n) => n.u_min_pu,
      cell: (n) => <span className={`tabular ${n.u_min_pu !== null && n.u_min_pu < limits.u_min_pu ? 'font-medium text-bad' : ''}`}>{fmtPu(n.u_min_pu)}</span>,
    },
    { key: 'tmin', header: 'at', sortValue: (n) => n.t_u_min, cell: (n) => <span className="text-xs text-fg-muted">{fmtDateTime(n.t_u_min)}</span> },
    { key: 'mean', header: 'u mean', align: 'right', sortValue: (n) => n.u_mean_pu, cell: (n) => <span className="tabular text-fg-2">{fmtPu(n.u_mean_pu)}</span> },
    {
      key: 'max',
      header: 'u max',
      align: 'right',
      sortValue: (n) => n.u_max_pu,
      cell: (n) => <span className={`tabular ${n.u_max_pu !== null && n.u_max_pu > limits.u_max_pu ? 'font-medium text-bad' : ''}`}>{fmtPu(n.u_max_pu)}</span>,
    },
    { key: 'tmax', header: 'at', sortValue: (n) => n.t_u_max, cell: (n) => <span className="text-xs text-fg-muted">{fmtDateTime(n.t_u_max)}</span> },
  ]

  const branchCols: Column<BranchExtremes>[] = [
    { key: 'name', header: 'Branch', sortValue: (b) => b.name, cell: (b) => <span className="font-medium">{b.name}</span> },
    { key: 'type', header: 'Type', sortValue: (b) => b.type, cell: (b) => <Badge>{b.type}</Badge> },
    {
      key: 'max',
      header: 'Max loading',
      align: 'right',
      sortValue: (b) => b.loading_max,
      cell: (b) => (
        <span className={`tabular ${b.loading_max !== null && b.loading_max > limits.loading_max ? 'font-medium text-bad' : ''}`}>{fmtPct(b.loading_max)}</span>
      ),
    },
    { key: 'tmax', header: 'at', sortValue: (b) => b.t_loading_max, cell: (b) => <span className="text-xs text-fg-muted">{fmtDateTime(b.t_loading_max)}</span> },
    { key: 'mean', header: 'Mean loading', align: 'right', sortValue: (b) => b.loading_mean, cell: (b) => <span className="tabular text-fg-2">{fmtPct(b.loading_mean)}</span> },
  ]

  return (
    <div className="grid gap-3">
      <Tabs
        size="sm"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'episodes', label: `Violation episodes (${summary.violations.length})` },
          { id: 'nodes', label: `Node extremes (${summary.nodes.length})` },
          { id: 'branches', label: `Branch extremes (${summary.branches.length})` },
        ]}
      />
      <p className="text-xs text-fg-muted">Click a row to plot that element over time.</p>
      <div className="rounded-md border border-border">
        {tab === 'episodes' &&
          (summary.violations.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={20} />} title="No violations" description="All voltages and loadings stayed within the case limits." />
          ) : (
            <Table
              dense
              maxHeight={440}
              columns={episodeCols}
              rows={summary.violations}
              rowKey={(v) => `${v.component}-${v.id}-${v.start}-${v.kind}`}
              initialSort={{ key: 'n', dir: 'desc' }}
              onRowClick={(v) => setFocus({ component: v.component, id: v.id, name: v.name })}
            />
          ))}
        {tab === 'nodes' && (
          <Table
            dense
            maxHeight={440}
            columns={nodeCols}
            rows={summary.nodes}
            rowKey={(n) => n.id}
            initialSort={{ key: 'min', dir: 'asc' }}
            onRowClick={(n) => setFocus({ component: 'node', id: n.id, name: n.name })}
          />
        )}
        {tab === 'branches' && (
          <Table
            dense
            maxHeight={440}
            columns={branchCols}
            rows={summary.branches}
            rowKey={(b) => b.id}
            initialSort={{ key: 'max', dir: 'desc' }}
            onRowClick={(b) => setFocus({ component: 'branch', id: b.id, name: b.name })}
          />
        )}
      </div>
      <FocusModal runId={runId} focus={focus} onClose={() => setFocus(null)} limits={limits} />
    </div>
  )
}

function FocusModal({
  runId,
  focus,
  onClose,
  limits,
}: {
  runId: string
  focus: Focus
  onClose: () => void
  limits: { u_min_pu: number; u_max_pu: number; loading_max: number }
}) {
  const query = useMemo(
    () => (focus ? { component: focus.component, field: focus.component === 'node' ? 'u_pu' : 'loading', ids: [focus.id] } : null),
    [focus],
  )
  const q = useTimeseries(runId, query)
  const lines = useMemo(
    () =>
      focus?.component === 'node'
        ? [
            { value: limits.u_min_pu, label: 'u_min' },
            { value: limits.u_max_pu, label: 'u_max' },
          ]
        : [{ value: limits.loading_max, label: 'limit' }],
    [focus, limits],
  )
  return (
    <Modal open={!!focus} onClose={onClose} size="xl" title={focus ? `${focus.name} · ${focus.component === 'node' ? 'voltage' : 'loading'}` : ''}>
      {q.error ? <ErrorState error={q.error} /> : <TimeseriesChart data={q.data} limits={lines} height={380} loading={q.isFetching} />}
    </Modal>
  )
}
