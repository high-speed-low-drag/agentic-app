import { useMemo } from 'react'
import { useNetworkTopology } from '../../api/hooks'
import type { CaseStudy } from '../../api/schema'
import { withAdditions } from '../../components/network/additions'
import { effectiveTopology } from '../../components/network/overrides'

const NONE: CaseStudy['network_overrides'] = []
const NO_ADDITIONS: CaseStudy['network_additions'] = []

/**
 * The case's network topology: the file topology (query) plus, once loaded, the effective topology
 * with the case's `network_additions` and `network_overrides` applied (memoised). Show equipment
 * values from `effective`.
 */
export function useCaseTopology(draft: CaseStudy) {
  const topo = useNetworkTopology(draft.network.source || undefined, draft.network.key || undefined)
  const overrides = draft.network_overrides ?? NONE
  const additions = draft.network_additions ?? NO_ADDITIONS
  const effective = useMemo(
    () => (topo.data ? effectiveTopology(withAdditions(topo.data, additions), overrides) : undefined),
    [topo.data, additions, overrides],
  )
  return { topo, overrides, additions, effective }
}
