import { describe, expect, it } from 'vitest'
import { BASE_STEP_MS, nextFrameDelay, playbackSpeeds, prefetchCount } from './playback'

describe('playbackSpeeds', () => {
  const speeds = playbackSpeeds()

  it('has the expected labels and ms per step', () => {
    expect(speeds.map((s) => s.label)).toEqual(['1×', '2×', '4×', '8×', '16×'])
    expect(speeds.map((s) => s.value)).toEqual([600, 300, 150, 75, 37.5])
    expect(speeds[0].value).toBe(BASE_STEP_MS)
  })

  it('is proportional: each step halves the ms', () => {
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i].value).toBe(speeds[i - 1].value / 2)
      expect(speeds[i].multiplier).toBe(speeds[i - 1].multiplier * 2)
    }
  })

  it('prefetches more ahead at higher speeds', () => {
    expect(speeds.map((s) => s.prefetch)).toEqual([2, 2, 4, 6, 8])
    expect(prefetchCount(0)).toBe(2)
  })
})

describe('nextFrameDelay', () => {
  it('subtracts the time already elapsed since the frame was shown, never below 0', () => {
    expect(nextFrameDelay(300, 1000, 1000)).toBe(300)
    expect(nextFrameDelay(300, 1000, 1100)).toBe(200)
    expect(nextFrameDelay(300, 1000, 1500)).toBe(0)
  })
})
