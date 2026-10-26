import type { ResultComponent, ResultSummary } from '../api/schema'

/** Worst elements according to the summary: lowest/highest voltage deviation, highest loading. */
export function worstIds(summary: ResultSummary, component: ResultComponent, n = 5): number[] {
  if (component === 'node') {
    const dev = (x: ResultSummary['nodes'][number]) =>
      Math.max(Math.abs(1 - (x.u_min_pu ?? 1)), Math.abs((x.u_max_pu ?? 1) - 1))
    return [...summary.nodes].sort((a, b) => dev(b) - dev(a)).slice(0, n).map((x) => x.id)
  }
  if (component === 'branch') {
    return [...summary.branches]
      .sort((a, b) => (b.loading_max ?? -1) - (a.loading_max ?? -1))
      .slice(0, n)
      .map((x) => x.id)
  }
  return []
}
