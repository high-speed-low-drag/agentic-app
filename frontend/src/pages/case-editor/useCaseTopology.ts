import { useMemo } from 'react'
import { useNetworkTopology } from '../../api/hooks'
import type { CaseStudy } from '../../api/schema'
import { effectiveTopology } from '../../components/network/overrides'

const NONE: CaseStudy['network_overrides'] = []

/**
 * The case's network topology: the file topology (query) plus, once loaded, the effective topology
 * with the case's `network_overrides` applied (memoised). Show equipment values from `effective`.
 */
export function useCaseTopology(draft: CaseStudy) {
  const topo = useNetworkTopology(draft.network.source || undefined, draft.network.key || undefined)
  const overrides = draft.network_overrides ?? NONE
  const effective = useMemo(() => (topo.data ? effectiveTopology(topo.data, overrides) : undefined), [topo.data, overrides])
  return { topo, overrides, effective }
}
