import { useCase, useNetworkTopology, useRun } from '../api/hooks'
import type { Limits } from '../api/schema'

export const DEFAULT_LIMITS: Limits = { u_min_pu: 0.95, u_max_pu: 1.05, loading_max: 1.0 }

/**
 * Run -> case -> network topology + limits, for result views.
 * The contract has no frozen-case endpoint, so we read the (current) case of the run
 * and fall back to default limits if it is unavailable.
 */
export function useRunContext(runId: string) {
  const run = useRun(runId)
  const kase = useCase(run.data?.case_id)
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
