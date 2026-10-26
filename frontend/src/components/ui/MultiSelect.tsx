import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
import { inputClass } from './Field'

export interface MultiSelectOption {
  value: number
  label: string
  hint?: string
}

/** Searchable checklist for picking a set of element ids. */
export function MultiSelect({
  options,
  value,
  onChange,
  maxHeight = 200,
  className,
}: {
  options: MultiSelectOption[]
  value: number[]
  onChange: (v: number[]) => void
  maxHeight?: number
  className?: string
}) {
  const [q, setQ] = useState('')
  const sel = useMemo(() => new Set(value), [value])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return options
    return options.filter((o) => o.label.toLowerCase().includes(s) || String(o.value).includes(s))
  }, [options, q])

  const toggle = (v: number) => {
    const next = new Set(sel)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(options.filter((o) => next.has(o.value)).map((o) => o.value))
  }

  return (
    <div className={cn('rounded-md border border-border bg-surface', className)}>
      <div className="flex items-center gap-2 border-b border-border p-1.5">
        <div className="relative flex-1">
          <Search size={13} className="absolute top-1/2 left-2 -translate-y-1/2 text-fg-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            className={cn(inputClass, 'h-7 pl-7 text-xs')}
          />
        </div>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={() => onChange(Array.from(new Set([...value, ...filtered.map((o) => o.value)])))}
        >
          All
        </button>
        <button type="button" className="text-xs text-fg-muted hover:underline" onClick={() => onChange([])}>
          None
        </button>
      </div>
      <div className="overflow-auto py-1" style={{ maxHeight }}>
        {filtered.length === 0 && <div className="px-3 py-2 text-xs text-fg-muted">No matches</div>}
        {filtered.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 px-2.5 py-1 text-sm hover:bg-surface-2"
          >
            <input
              type="checkbox"
              checked={sel.has(o.value)}
              onChange={() => toggle(o.value)}
              className="size-3.5 accent-[var(--c-accent)]"
            />
            <span className="flex-1 truncate">{o.label}</span>
            {o.hint && <span className="text-xs text-fg-muted tabular">{o.hint}</span>}
          </label>
        ))}
      </div>
      <div className="border-t border-border px-2.5 py-1 text-xs text-fg-muted">
        {value.length} of {options.length} selected
      </div>
    </div>
  )
}
