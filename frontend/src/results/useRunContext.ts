import { useNetworkTopology, useRun, useRunCase } from '../api/hooks'
import type { Limits } from '../api/schema'

export const DEFAULT_LIMITS: Limits = { u_min_pu: 0.95, u_max_pu: 1.05, loading_max: 1.0 }

/**
 * Run -> frozen case (`GET /runs/{id}/case`) -> network topology + limits, for result views.
 * Uses the case as it was when the run was created, so later edits to the live case do not
 * change how old results are judged. Falls back to default limits if it is unavailable.
 */
export function useRunContext(runId: string) {
  const run = useRun(runId)
  const kase = useRunCase(runId)
  const net = kase.data?.network
  const topology = useNetworkTopology(net?.source, net?.key)
  return {
    run: run.data,
    case: kase.data,
    limits: kase.data?.limits ?? DEFAULT_LIMITS,
    topology: topology.data,
    topologyLoading: run.isLoading || kase.isLoading || topology.isLoading,
    topologyError: run.error ?? kase.error ?? topology.error,
  }
}
