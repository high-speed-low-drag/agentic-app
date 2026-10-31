import { AlertTriangle, ArrowLeft, Ban, BarChart3, CheckCircle2, Radio, RefreshCw, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { isTerminal, useCancelRun, useRun, useRunLive } from '../api/hooks'
import type { RunInfo } from '../api/schema'
import { Page, PageHeader } from '../components/layout/Page'
import { RunStatusBadge } from '../components/RunStatusBadge'
import { Button, Card, CardBody, ErrorState, LinkButton, LoadingState, Progress, useToast } from '../components/ui'
import { fmtDateTime, fmtDuration, fmtInt, toDate } from '../lib/format'
import { errorMessage } from '../lib/utils'
import { ResultsPanel } from '../results/ResultsPanel'

function useNow(active: boolean, ms = 500) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const h = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(h)
  }, [active, ms])
  return now
}

function elapsedSeconds(run: RunInfo, now: number): number | null {
  if (run.duration_s !== null && run.duration_s !== undefined) return run.duration_s
  const from = run.started_at ?? run.created_at
  if (!from) return null
  const end = run.finished_at ? toDate(run.finished_at).getTime() : now
  return Math.max(0, (end - toDate(from).getTime()) / 1000)
}

export function RunPage({ tab }: { tab?: 'results' }) {
  const { runId } = useParams()
  const run = useRun(runId)
  const live = useRunLive(runId, !!run.data && !isTerminal(run.data))
  const cancel = useCancelRun()
  const toast = useToast()
  const r = run.data
  const running = !!r && !isTerminal(r)
  const now = useNow(running)

  if (run.isLoading) return <LoadingState label="Loading run…" />
  if (run.error || !r)
    return (
      <Page>
        <ErrorState error={run.error ?? 'Run not found'} title="Could not load run" onRetry={() => void run.refetch()} />
      </Page>
    )

  const tone = r.status === 'failed' ? 'bad' : r.status === 'cancelled' ? 'warn' : r.status === 'succeeded' ? 'good' : 'accent'
  const compact = r.status === 'succeeded' && tab === 'results'

  return (
    <Page wide>
      <PageHeader
        breadcrumb={
          <>
            <Link to="/runs" className="hover:text-fg">
              Runs
            </Link>{' '}
            / <span className="font-mono">{r.id}</span>
          </>
        }
        title={
          <span className="inline-flex items-center gap-3">
            {r.case_name}
            <span data-testid="run-status" data-status={r.status}>
              <RunStatusBadge status={r.status} progress={r.progress} />
            </span>
          </span>
        }
        subtitle={
          <>
            Started {fmtDateTime(r.started_at ?? r.created_at)} · {fmtInt(r.n_timesteps)} timesteps
            {r.status !== 'queued' && <> · {fmtDuration(elapsedSeconds(r, now))}</>}
          </>
        }
        actions={
          <>
            <LinkButton to={`/cases/${encodeURIComponent(r.case_id)}`} icon={<ArrowLeft size={15} />}>
              Edit case
            </LinkButton>
            {running && (
              <Button
                variant="danger"
                icon={<Ban size={15} />}
                loading={cancel.isPending}
                onClick={() =>
                  cancel.mutate(r.id, {
                    onSuccess: () => toast.show({ title: 'Cancellation requested', tone: 'warning' }),
                    onError: (e) => toast.error('Cancel failed', errorMessage(e)),
                  })
                }
              >
                Cancel run
              </Button>
            )}
          </>
        }
      />

      {!compact && (
        <Card className="mb-4">
          <CardBody className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-2 text-fg-2">
                {r.status === 'succeeded' && <CheckCircle2 size={16} className="text-good" />}
                {r.status === 'failed' && <XCircle size={16} className="text-bad" />}
                {r.status === 'cancelled' && <Ban size={16} className="text-warn" />}
                <span>{r.message || (r.status === 'queued' ? 'Waiting to start…' : r.status)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-fg-muted">
                <span className="font-semibold text-fg tabular">{Math.round(r.progress * 100)} %</span>
                {running && (
                  <span className="inline-flex items-center gap-1" title={live === 'sse' ? 'Live updates via server-sent events' : 'Polling for updates'}>
                    {live === 'sse' ? <Radio size={12} className="text-good" /> : <RefreshCw size={12} className="animate-spin" />}
                    {live === 'sse' ? 'live' : 'polling'}
                  </span>
                )}
              </div>
            </div>
            <Progress value={r.status === 'succeeded' ? 1 : r.progress} tone={tone} animated={running} />
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <Stat label="Created" value={fmtDateTime(r.created_at)} />
              <Stat label="Finished" value={fmtDateTime(r.finished_at)} />
              <Stat label="Elapsed" value={fmtDuration(elapsedSeconds(r, now))} />
              <Stat label="Failed timesteps" value={fmtInt(r.n_failed_timesteps)} bad={r.n_failed_timesteps > 0} />
            </div>
            {r.error && (
              <div className="flex items-start gap-2 rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-fg-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-bad" />
                <pre className="font-sans break-words whitespace-pre-wrap">{r.error}</pre>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {r.status === 'succeeded' ? (
        <>
          {!compact && (
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
              <BarChart3 size={16} /> Results
            </div>
          )}
          <ResultsPanel runId={r.id} />
        </>
      ) : isTerminal(r) ? (
        <Card>
          <CardBody className="text-sm text-fg-muted">No results: this run {r.status === 'failed' ? 'failed' : 'was cancelled'}.</CardBody>
        </Card>
      ) : null}
    </Page>
  )
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <div className="text-fg-muted">{label}</div>
      <div className={`font-medium tabular ${bad ? 'text-bad' : 'text-fg'}`}>{value}</div>
    </div>
  )
}
