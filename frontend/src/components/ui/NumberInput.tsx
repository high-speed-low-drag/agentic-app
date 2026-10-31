import type { InputHTMLAttributes } from 'react'
import { useState } from 'react'
import { cn } from '../../lib/utils'
import { inputClass } from './Field'

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> {
  value: number | null | undefined
  onChange: (v: number | null) => void
  min?: number
  max?: number
  step?: number | 'any'
  integer?: boolean
  /** Allow an empty field (onChange(null)). Default false. */
  nullable?: boolean
  unit?: string
}

const fmt = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(v))

/**
 * Number input that keeps a local text draft, so intermediate states like "1e-" or "-"
 * don't get clobbered. Commits a parsed number whenever the draft is valid.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 'any',
  integer,
  nullable,
  unit,
  className,
  onBlur,
  ...rest
}: NumberInputProps) {
  const [draft, setDraft] = useState(fmt(value))
  const [lastValue, setLastValue] = useState(value)
  // Sync draft when the value changes from the outside (derived-state pattern).
  if (value !== lastValue) {
    setLastValue(value)
    if (parse(draft) !== value) setDraft(fmt(value))
  }

  function parse(s: string): number | null {
    if (s.trim() === '') return null
    const n = Number(s)
    return Number.isFinite(n) ? n : NaN
  }

  const parsed = parse(draft)
  const invalid =
    (parsed === null && !nullable) ||
    (typeof parsed === 'number' &&
      (Number.isNaN(parsed) ||
        (integer && !Number.isInteger(parsed)) ||
        (min !== undefined && parsed < min) ||
        (max !== undefined && parsed > max)))

  return (
    <div className={cn('relative', className)}>
      <input
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        value={draft}
        aria-invalid={invalid || undefined}
        data-step={step}
        onChange={(e) => {
          const s = e.target.value
          setDraft(s)
          const n = parse(s)
          if (n === null) {
            if (nullable) onChange(null)
          } else if (!Number.isNaN(n)) {
            onChange(integer ? Math.round(n) : n)
          }
        }}
        onBlur={(e) => {
          if (invalid) setDraft(fmt(value))
          onBlur?.(e)
        }}
        className={cn(inputClass, 'tabular', unit && 'pr-12')}
        {...rest}
      />
      {unit && (
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-fg-muted">
          {unit}
        </span>
      )}
    </div>
  )
}
