import { CalendarRange, FolderOpen, Network, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useCases, useDeleteCase } from '../api/hooks'
import type { CaseSummary } from '../api/schema'
import { Page, PageHeader } from '../components/layout/Page'
import { RunStatusBadge } from '../components/RunStatusBadge'
import type { Column } from '../components/ui'
import { LinkButton, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingState, Table, useToast } from '../components/ui'
import { fmtDateTime, fmtRelative } from '../lib/format'
import { computeTimesteps, describeWindow, formatResolution } from '../lib/time'
import { errorMessage } from '../lib/utils'

export function CasesPage() {
  const { data, isLoading, error, refetch } = useCases()
  const del = useDeleteCase()
  const toast = useToast()
  const navigate = useNavigate()
  const [toDelete, setToDelete] = useState<CaseSummary | null>(null)

  const columns: Column<CaseSummary>[] = [
    {
      key: 'name',
      header: 'Case',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <Link to={`/cases/${encodeURIComponent(c.id)}`} className="font-medium text-fg hover:text-accent" onClick={(e) => e.stopPropagation()}>
            {c.name}
          </Link>
          {c.description && <div className="max-w-md truncate text-xs text-fg-muted">{c.description}</div>}
        </div>
      ),
    },
    {
      key: 'network',
      header: 'Network',
      sortValue: (c) => c.network.key,
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5 text-fg-2">
          <Network size={13} className="text-fg-muted" />
          {c.network.key}
          <span className="text-xs text-fg-muted">({c.network.source})</span>
        </span>
      ),
    },
    {
      key: 'time',
      header: 'Time window',
      sortValue: (c) => c.time.start,
      cell: (c) => (
        <div className="text-fg-2">
          <div className="inline-flex items-center gap-1.5">
            <CalendarRange size={13} className="text-fg-muted" />
            {fmtDateTime(c.time.start)}
          </div>
          <div className="text-xs text-fg-muted">
            {describeWindow(c.time)} · {formatResolution(c.time.resolution_minutes)} ·{' '}
            {computeTimesteps(c.time).toLocaleString()} steps
          </div>
        </div>
      ),
    },
    {
      key: 'last_run',
      header: 'Last run',
      sortValue: (c) => c.last_run?.created_at ?? '',
      cell: (c) =>
        c.last_run ? (
          <Link to={`/runs/${encodeURIComponent(c.last_run.id)}`} onClick={(e) => e.stopPropagation()} className="inline-flex flex-col gap-0.5">
            <RunStatusBadge status={c.last_run.status} progress={c.last_run.progress} />
            <span className="text-xs text-fg-muted">{fmtRelative(c.last_run.created_at)}</span>
          </Link>
        ) : (
          <span className="text-xs text-fg-muted">Never run</span>
        ),
    },
    {
      key: 'updated',
      header: 'Updated',
      sortValue: (c) => c.updated_at,
      cell: (c) => <span className="text-xs text-fg-muted">{fmtRelative(c.updated_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) => (
        <IconButton
          label="Delete case"
          size="sm"
          icon={<Trash2 size={14} />}
          onClick={(e) => {
            e.stopPropagation()
            setToDelete(c)
          }}
        />
      ),
    },
  ]

  return (
    <Page>
      <PageHeader
        title="Cases"
        subtitle="Study definitions: network, time window, profiles and limits."
        actions={
          <LinkButton to="/cases/new" variant="primary" icon={<Plus size={16} />}>
              New case
</LinkButton>
        }
      />
      <Card data-testid="cases-list">
        {isLoading ? (
          <LoadingState label="Loading cases…" />
        ) : error ? (
          <div className="p-4">
            <ErrorState error={error} title="Could not load cases" onRetry={() => void refetch()} />
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={<FolderOpen size={20} />}
            title="No cases yet"
            description="Create a case to pick a network, define a time window and assign load / generation profiles."
            action={
              <LinkButton to="/cases/new" variant="primary" icon={<Plus size={16} />}>
                  New case
</LinkButton>
            }
          />
        ) : (
          <Table
            columns={columns}
            rows={data}
            rowKey={(c) => c.id}
            initialSort={{ key: 'updated', dir: 'desc' }}
            onRowClick={(c) => navigate(`/cases/${encodeURIComponent(c.id)}`)}
          />
        )}
      </Card>
      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Delete case?"
        message={
          <>
            <b className="text-fg">{toDelete?.name}</b> and all of its runs will be permanently deleted.
          </>
        }
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return
          del.mutate(toDelete.id, {
            onSuccess: () => {
              toast.success('Case deleted', toDelete.name)
              setToDelete(null)
            },
            onError: (e) => toast.error('Delete failed', errorMessage(e)),
          })
        }}
      />
    </Page>
  )
}
