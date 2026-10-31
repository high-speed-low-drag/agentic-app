import { useEffect, useState } from 'react'

/**
 * Width (px) of an element, kept current with a ResizeObserver; 0 until measured. Returns a callback ref, so it
 * also works for elements that mount after the component's first render.
 */
export function useElementWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [el, setEl] = useState<T | null>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    // the observer also reports the initial size
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w]
}
