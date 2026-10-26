/** react-query hooks around ./client.ts. */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from './client'
import type {
  CaseStudy,
  ProfilePreviewRequest,
  ResultComponent,
  RunInfo,
  TimeseriesQuery,
} from './schema'
import { TERMINAL_RUN_STATUSES } from './schema'

export const qk = {
  health: ['health'] as const,
  networks: ['networks'] as const,
  network: (source: string, key: string) => ['network', source, key] as const,
  generators: ['profile-generators'] as const,
  preview: (body: ProfilePreviewRequest) => ['profile-preview', body] as const,
  cases: ['cases'] as const,
  case: (id: string) => ['case', id] as const,
  runs: (caseId?: string) => ['runs', caseId ?? null] as const,
  run: (id: string) => ['run', id] as const,
  runCase: (id: string) => ['run-case', id] as const,
  summary: (id: string) => ['summary', id] as const,
  timeseries: (id: string, q: TimeseriesQuery) => ['timeseries', id, q] as const,
  envelope: (id: string, c: string, f: string) => ['envelope', id, c, f] as const,
  heatmap: (id: string, c: string, f: string, m: number) => ['heatmap', id, c, f, m] as const,
  snapshot: (id: string, t: number) => ['snapshot', id, t] as const,
}

export const isTerminal = (r?: RunInfo | null) => !!r && TERMINAL_RUN_STATUSES.includes(r.status)

// ---------------------------------------------------------------- meta
export function useHealth() {
  return useQuery({ queryKey: qk.health, queryFn: api.health, refetchInterval: 15_000, retry: false })
}

// ---------------------------------------------------------------- networks
export function useNetworks() {
  return useQuery({ queryKey: qk.networks, queryFn: api.listNetworks })
}

export function useNetworkTopology(source?: string, key?: string) {
  return useQuery({
    queryKey: qk.network(source ?? '', key ?? ''),
    queryFn: () => api.getNetwork(source!, key!),
    enabled: !!source && !!key,
    staleTime: Infinity,
  })
}

export function useUploadNetwork() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.uploadNetwork,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.networks }),
  })
}

// ---------------------------------------------------------------- profiles
export function useProfileGenerators() {
  return useQuery({ queryKey: qk.generators, queryFn: api.listProfileGenerators, staleTime: Infinity })
}

export function useProfilePreview(body: ProfilePreviewRequest | null) {
  return useQuery({
    queryKey: body ? qk.preview(body) : ['profile-preview', 'disabled'],
    queryFn: ({ signal }) => api.previewProfile(body!, signal),
    enabled: !!body,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 60_000,
  })
}

export function useUploadProfileCsv() {
  return useMutation({ mutationFn: api.uploadProfileCsv })
}

// ---------------------------------------------------------------- cases
export function useCases() {
  return useQuery({ queryKey: qk.cases, queryFn: api.listCases })
}

export function useCase(id?: string) {
  return useQuery({
    queryKey: qk.case(id ?? ''),
    queryFn: () => api.getCase(id!),
    enabled: !!id,
  })
}

export function useSaveCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (c: CaseStudy) => (c.id && c.created_at ? api.updateCase(c.id, c) : api.createCase(c)),
    onSuccess: (saved) => {
      if (saved.id) qc.setQueryData(qk.case(saved.id), saved)
      void qc.invalidateQueries({ queryKey: qk.cases })
    },
  })
}

export function useDeleteCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteCase,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.cases })
      void qc.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}

export function useValidateCase() {
  return useMutation({ mutationFn: api.validateCase })
}

// ---------------------------------------------------------------- runs
export function useStartRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.startRun,
    onSuccess: (run) => {
      qc.setQueryData(qk.run(run.id), run)
      void qc.invalidateQueries({ queryKey: ['runs'] })
      void qc.invalidateQueries({ queryKey: qk.cases })
    },
  })
}

export function useRuns(caseId?: string) {
  return useQuery({
    queryKey: qk.runs(caseId),
    queryFn: () => api.listRuns(caseId),
    // keep the list fresh while anything is still running
    refetchInterval: (q) => (q.state.data?.some((r) => !isTerminal(r)) ? 2000 : false),
  })
}

export function useRun(runId?: string) {
  return useQuery({
    queryKey: qk.run(runId ?? ''),
    queryFn: () => api.getRun(runId!),
    enabled: !!runId,
  })
}

/** The case frozen at run time. Immutable, so it never goes stale. */
export function useRunCase(runId?: string) {
  return useQuery({
    queryKey: qk.runCase(runId ?? ''),
    queryFn: () => api.getRunCase(runId!),
    enabled: !!runId,
    staleTime: Infinity,
    retry: false,
  })
}

export function useCancelRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.cancelRun,
    onSuccess: (run) => qc.setQueryData(qk.run(run.id), run),
  })
}

export function useDeleteRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteRun,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['runs'] })
      void qc.invalidateQueries({ queryKey: qk.cases })
    },
  })
}

export type RunLiveMode = 'sse' | 'polling' | 'idle'

/**
 * Live run updates: subscribes to the SSE stream (`progress` / `done` events)
 * and writes RunInfo into the react-query cache. Falls back to polling every
 * second if EventSource is unavailable or errors out.
 */
export function useRunLive(runId: string | undefined, enabled: boolean): RunLiveMode {
  const qc = useQueryClient()
  // run id for which SSE failed and we fell back to polling
  const [fallbackFor, setFallbackFor] = useState<string | null>(null)
  const hasEventSource = typeof EventSource !== 'undefined'

  useEffect(() => {
    if (!runId || !enabled) return
    let closed = false
    let es: EventSource | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const finish = () => {
      closed = true
      es?.close()
      if (pollTimer) clearInterval(pollTimer)
      void qc.invalidateQueries({ queryKey: ['runs'] })
      void qc.invalidateQueries({ queryKey: qk.cases })
      void qc.invalidateQueries({ queryKey: qk.run(runId) })
    }
    const apply = (run: RunInfo) => {
      qc.setQueryData(qk.run(run.id), run)
      if (isTerminal(run)) finish()
    }
    const startPolling = () => {
      if (closed || pollTimer) return
      const tick = async () => {
        try {
          apply(await api.getRun(runId))
        } catch {
          /* keep polling */
        }
      }
      void tick()
      pollTimer = setInterval(tick, 1000)
    }

    if (!hasEventSource) {
      startPolling()
    } else {
      es = new EventSource(api.runEventsUrl(runId))
      es.addEventListener('progress', (ev) => {
        try {
          apply(JSON.parse((ev as MessageEvent<string>).data) as RunInfo)
        } catch {
          /* ignore malformed event */
        }
      })
      es.addEventListener('done', (ev) => {
        const data = (ev as MessageEvent<string>).data
        if (data) {
          try {
            qc.setQueryData(qk.run(runId), JSON.parse(data) as RunInfo)
          } catch {
            /* done may carry no payload */
          }
        }
        finish()
      })
      es.onerror = () => {
        if (closed) return
        es?.close()
        es = null
        setFallbackFor(runId)
        startPolling()
      }
    }

    return () => {
      closed = true
      es?.close()
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [runId, enabled, qc, hasEventSource])

  if (!runId || !enabled) return 'idle'
  return !hasEventSource || fallbackFor === runId ? 'polling' : 'sse'
}

// ---------------------------------------------------------------- results
export function useResultSummary(runId?: string, enabled = true) {
  return useQuery({
    queryKey: qk.summary(runId ?? ''),
    queryFn: () => api.getSummary(runId!),
    enabled: !!runId && enabled,
    staleTime: Infinity,
  })
}

export function useTimeseries(runId: string, q: TimeseriesQuery | null) {
  return useQuery({
    queryKey: q ? qk.timeseries(runId, q) : ['timeseries', runId, 'disabled'],
    queryFn: () => api.getTimeseries(runId, q!),
    enabled: !!q && q.ids.length > 0,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
}

export function useEnvelope(runId: string, component: ResultComponent, field: string) {
  return useQuery({
    queryKey: qk.envelope(runId, component, field),
    queryFn: () => api.getEnvelope(runId, component, field),
    staleTime: Infinity,
  })
}

export function useHeatmap(runId: string, component: ResultComponent, field: string, maxColumns = 500) {
  return useQuery({
    queryKey: qk.heatmap(runId, component, field, maxColumns),
    queryFn: () => api.getHeatmap(runId, component, field, maxColumns),
    staleTime: Infinity,
  })
}

export function useSnapshot(runId: string, t: number) {
  return useQuery({
    queryKey: qk.snapshot(runId, t),
    queryFn: () => api.getSnapshot(runId, t),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
}
