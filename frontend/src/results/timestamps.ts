import type { ResultSummary } from '../api/schema'
import { toDate } from '../lib/format'

/** Timestamp (ms) of timestep index t, derived from the summary's start + resolution. */
export function timestepTime(summary: ResultSummary, t: number): number {
  return toDate(summary.timestamps_start).getTime() + t * summary.resolution_minutes * 60_000
}

export const toMs = (ts: string[]) => ts.map((t) => toDate(t).getTime())
