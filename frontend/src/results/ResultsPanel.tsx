import { useSearchParams } from 'react-router'
import { useResultSummary } from '../api/hooks'
import { Card, CardBody, ErrorState, LoadingState, Tabs } from '../components/ui'
import { KpiTiles } from './KpiTiles'
import { useRunContext } from './useRunContext'
import { RESULT_VIEWS } from './views'

/** KPI row + tab strip of all registered result views (driven purely by RESULT_VIEWS). */
export function ResultsPanel({ runId }: { runId: string }) {
  const summary = useResultSummary(runId)
  const { limits } = useRunContext(runId)
  const [params, setParams] = useSearchParams()
  const viewId = params.get('view')
  const active = RESULT_VIEWS.find((v) => v.id === viewId) ?? RESULT_VIEWS[0]

  if (summary.isLoading) return <LoadingState label="Loading results…" />
  if (summary.error || !summary.data)
    return <ErrorState error={summary.error ?? 'No summary'} title="Could not load results" onRetry={() => void summary.refetch()} />

  const View = active?.component
  return (
    <div className="grid gap-4">
      <KpiTiles kpis={summary.data.kpis} limits={limits} nTimesteps={summary.data.n_timesteps} />
      {RESULT_VIEWS.length > 0 && active && View && (
        <Card data-testid="result-views">
          <div className="px-4 pt-2">
            <Tabs
              value={active.id}
              onChange={(id) => {
                const next = new URLSearchParams(params)
                next.set('view', id)
                setParams(next, { replace: true })
              }}
              items={RESULT_VIEWS.map((v) => ({ id: v.id, label: v.title }))}
            />
          </div>
          <CardBody>
            {active.description && <p className="mb-4 text-xs text-fg-muted">{active.description}</p>}
            <div data-testid={`result-view-${active.id}`}>
              <View key={active.id} runId={runId} summary={summary.data} />
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
