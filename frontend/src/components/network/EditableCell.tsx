import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { EditableField } from '../../api/schema'
import { cn } from '../../lib/utils'
import { formatValue, parseDisplay, toDisplay } from './overrides'

function RevertButton({ label, onRevert }: { label: string; onRevert: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onRevert()
      }}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded text-warn hover:bg-warn-border/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <RotateCcw size={12} />
    </button>
  )
}

function WasLine({ text }: { text: string }) {
  return (
    <div data-testid="cell-was" className="mt-0.5 text-[10px] leading-none text-warn">
      was {text}
    </div>
  )
}

/**
 * Inline numeric input with a unit suffix. Commits on blur or Enter, Escape cancels.
 * `value`/`file` are SI values; the input shows them in the field's display unit.
 */
export function NumberCell({
  field,
  value,
  file,
  changed,
  label,
  onCommit,
  onRevert,
}: {
  field: EditableField
  /** current SI value; null/undefined = not set (empty input with a "—" placeholder) */
  value: number | null | undefined
  /** file SI value; null/undefined = not set in the file */
  file: number | null | undefined
  changed: boolean
  /** accessible name, e.g. "P of Load1" */
  label: string
  onCommit: (si: number) => void
  onRevert: () => void
}) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shown = text ?? (value == null ? '' : String(toDisplay(value, field)))
  const fileText = file == null ? 'not set' : formatValue(file, field)

  const commit = (keepOnError: boolean): boolean => {
    if (text === null) return true
    const r = parseDisplay(text, field)
    if ('error' in r) {
      if (keepOnError) {
        setError(r.error)
        return false
      }
      setText(null)
      setError(null)
      return true
    }
    setText(null)
    setError(null)
    if (value == null || r.value !== value) onCommit(r.value)
    return true
  }

  return (
    <div className="inline-flex flex-col items-end" title={`File value: ${fileText}${error ? ` · ${error}` : ''}`}>
      <div className="flex items-center gap-1">
        {changed && <RevertButton label={`Revert ${label}`} onRevert={onRevert} />}
        <input
          aria-label={label}
          aria-invalid={error ? true : undefined}
          data-changed={changed || undefined}
          inputMode={field.kind === 'int' ? 'numeric' : 'decimal'}
          value={shown}
          placeholder="—"
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onBlur={() => commit(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (commit(true)) e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              setText(null)
              setError(null)
              e.currentTarget.blur()
            }
          }}
          className={cn(
            'h-7 w-20 rounded border bg-surface px-1.5 text-right text-xs text-fg tabular',
            'hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-ring focus:outline-none',
            changed ? 'border-warn-border font-medium text-warn' : 'border-border',
            error && 'border-bad focus:border-bad',
          )}
        />
        {field.unit && <span className="w-8 text-left text-[11px] text-fg-muted">{field.unit}</span>}
      </div>
      {changed && <WasLine text={fileText} />}
    </div>
  )
}

/** Boolean toggle (e.g. "in service"). */
export function BoolCell({
  checked,
  fileChecked,
  changed,
  label,
  onChange,
  onRevert,
}: {
  checked: boolean
  fileChecked: boolean
  changed: boolean
  label: string
  onChange: (v: boolean) => void
  onRevert: () => void
}) {
  const fileText = fileChecked ? 'in service' : 'out of service'
  return (
    <div className="inline-flex flex-col items-center" title={`File value: ${fileText}`}>
      <div className="flex items-center gap-1">
        {changed && <RevertButton label={`Revert ${label}`} onRevert={onRevert} />}
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          aria-checked={checked}
          data-changed={changed || undefined}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.checked)}
          className={cn('size-4 rounded', changed ? 'accent-[var(--c-warn)]' : 'accent-[var(--c-accent)]')}
        />
      </div>
      {changed && <WasLine text={fileChecked ? 'on' : 'off'} />}
    </div>
  )
}
