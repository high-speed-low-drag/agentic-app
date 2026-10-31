import { useEffect, useState } from 'react'

/** Join class names, skipping falsy values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Debounce a value (e.g. to avoid firing preview requests on every keystroke). */
export function useDebounced<T>(value: T, delayMs = 400): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return v
}

/** Stable JSON stringify (sorted keys) for dirty checks. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    }
    return val
  })
}

export function randomId(prefix = 'a'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`
}

export function errorMessage(e: unknown): string {
  if (!e) return ''
  if (e instanceof Error) return e.message
  return String(e)
}
