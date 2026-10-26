import { useMemo } from 'react'
import { useNetworkTopology, useRun, useRunCase } from '../api/hooks'
import type { CaseStudy, Limits, NetworkTopology } from '../api/schema'
import { effectiveTopology, type EffectiveTopology } from '../components/network/overrides'

export const DEFAULT_LIMITS: Limits = { u_min_pu: 0.95, u_max_pu: 1.05, loading_max: 1.0 }

/** The run's network as it was calculated: the file topology with the frozen case's overrides applied. */
export function runTopology(topology: NetworkTopology | undefined, kase: Pick<CaseStudy, 'network_overrides'> | undefined): EffectiveTopology | undefined {
  if (!topology) return undefined
  return effectiveTopology(topology, kase?.network_overrides ?? [])
}

/**
 * Run -> frozen case (`GET /runs/{id}/case`) -> network topology + limits, for result views.
 * Uses the case as it was when the run was created, so later edits to the live case do not
 * change how old results are judged. Falls back to default limits if it is unavailable.
 * `topology` has the frozen case's network overrides applied (P/Q, in service, params);
 * `fileTopology` is the unchanged network file, `effective` tells which values were edited.
 */
export function useRunContext(runId: string) {
  const run = useRun(runId)
  const kase = useRunCase(runId)
  const net = kase.data?.network
  const topology = useNetworkTopology(net?.source, net?.key)
  const effective = useMemo(() => runTopology(topology.data, kase.data), [topology.data, kase.data])
  return {
    run: run.data,
    case: kase.data,
    limits: kase.data?.limits ?? DEFAULT_LIMITS,
    topology: effective?.topology,
    fileTopology: topology.data,
    effective,
    topologyLoading: run.isLoading || kase.isLoading || topology.isLoading,
    topologyError: run.error ?? kase.error ?? topology.error,
  }
}
