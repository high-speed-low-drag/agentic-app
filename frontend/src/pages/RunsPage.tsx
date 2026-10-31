import { Activity, BarChart3, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { isTerminal, useDeleteRun, useRuns } from '../api/hooks'
import type { RunInfo } from '../api/schema'
import { Page, PageHeader } from '../components/layout/Page'
import { RunStatusBadge } from '../components/RunStatusBadge'
import type { Column } from '../components/ui'
import { LinkButton, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingState, Progress, Table, useToast } from '../components/ui'
import { fmtDateTime, fmtDuration, fmtInt } from '../lib/format'
import { errorMessage } from '../lib/utils'

export function RunsPage() {
  const { data, isLoading, error, refetch } = useRuns()
  const navigate = useNavigate()
  const del = useDeleteRun()
  const toast = useToast()
  const [toDelete, setToDelete] = useState<RunInfo | null>(null)

  const columns: Column<RunInfo>[] = [
    {
      key: 'id',
      header: 'Run',
      sortValue: (r) => r.id,
      cell: (r) => (
        <Link to={`/runs/${encodeURIComponent(r.id)}`} className="font-mono text-xs text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
          {r.id}
        </Link>
      ),
    },
    {
      key: 'case',
      header: 'Case',
      sortValue: (r) => r.case_name,
      cell: (r) => (
        <Link to={`/cases/${encodeURIComponent(r.case_id)}`} className="text-fg-2 hover:text-accent" onClick={(e) => e.stopPropagation()}>
          {r.case_name}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) =>
        r.status === 'running' ? (
          <div className="flex w-36 flex-col gap-1">
            <RunStatusBadge status={r.status} progress={r.progress} />
            <Progress value={r.progress} />
          </div>
        ) : (
          <RunStatusBadge status={r.status} />
        ),
    },
    { key: 'steps', header: 'Timesteps', align: 'right', sortValue: (r) => r.n_timesteps, cell: (r) => <span className="tabular">{fmtInt(r.n_timesteps)}</span> },
    {
      key: 'failed',
      header: 'Failed steps',
      align: 'right',
      sortValue: (r) => r.n_failed_timesteps,
      cell: (r) => <span className={r.n_failed_timesteps ? 'text-bad tabular' : 'text-fg-muted tabular'}>{fmtInt(r.n_failed_timesteps)}</span>,
    },
    { key: 'created', header: 'Created', sortValue: (r) => r.created_at, cell: (r) => <span className="text-fg-2">{fmtDateTime(r.created_at)}</span> },
    { key: 'duration', header: 'Duration', align: 'right', sortValue: (r) => r.duration_s ?? -1, cell: (r) => <span className="tabular text-fg-2">{fmtDuration(r.duration_s)}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          {r.status === 'succeeded' && (
            <LinkButton
              to={`/runs/${encodeURIComponent(r.id)}/results`}
              onClick={(e) => e.stopPropagation()}
              size="sm"
              variant="ghost"
              icon={<BarChart3 size={14} />}
            >
              Results
            </LinkButton>
          )}
          <IconButton
            size="sm"
            label="Delete run"
            disabled={!isTerminal(r)}
            icon={<Trash2 size={14} />}
            onClick={(e) => {
              e.stopPropagation()
              setToDelete(r)
            }}
          />
        </div>
      ),
    },
  ]

  return (
    <Page wide>
      <PageHeader title="Runs" subtitle="All simulation runs, newest first." />
      <Card>
        {isLoading ? (
          <LoadingState label="Loading runs…" />
        ) : error ? (
          <div className="p-4">
            <ErrorState error={error} title="Could not load runs" onRetry={() => void refetch()} />
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={<Activity size={20} />}
            title="No runs yet"
            description="Open a case and press Run to start a time-series load flow."
            action={
              <LinkButton to="/">
Go to cases
</LinkButton>
            }
          />
        ) : (
          <Table columns={columns} rows={data} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/runs/${encodeURIComponent(r.id)}`)} />
        )}
      </Card>
      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Delete run?"
        message={
          <>
            Run <span className="font-mono text-fg">{toDelete?.id}</span> and its results will be permanently deleted.
          </>
        }
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return
          del.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success('Run deleted')
              setToDelete(null)
            },
            onError: (e) => toast.error('Delete failed', errorMessage(e)),
          })
        }}
      />
    </Page>
  )
}
