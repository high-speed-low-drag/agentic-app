/** Snapshot playback speeds: proportional to 1× = BASE_STEP_MS per timestep. */

export const BASE_STEP_MS = 600
export const SPEED_MULTIPLIERS = [1, 2, 4, 8, 16] as const
export const DEFAULT_MULTIPLIER = 2

export interface PlaybackSpeed {
  /** Target milliseconds between shown frames. */
  value: number
  label: string
  multiplier: number
  /** How many upcoming snapshots to prefetch while playing at this speed. */
  prefetch: number
}

/** Snapshots to keep in flight ahead of the current frame: 2 at 1×/2×, growing to 8 at 16×. */
export function prefetchCount(multiplier: number): number {
  return Math.max(2, Math.round(2 * Math.log2(Math.max(1, multiplier))))
}

export function playbackSpeeds(): PlaybackSpeed[] {
  return SPEED_MULTIPLIERS.map((m) => ({
    value: BASE_STEP_MS / m,
    label: `${m}×`,
    multiplier: m,
    prefetch: prefetchCount(m),
  }))
}

/** Delay until the next frame is due, given when the current one was shown (same clock as `now`). */
export function nextFrameDelay(stepMs: number, shownAt: number, now: number): number {
  return Math.max(0, stepMs - (now - shownAt))
}
