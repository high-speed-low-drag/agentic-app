import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { cn } from '../../lib/utils'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: T) => number | string | null | undefined
  align?: 'left' | 'right' | 'center'
  className?: string
  /** Extra class names for one body cell (e.g. highlight a changed value). */
  cellClassName?: (row: T) => string | false | null | undefined
  width?: string | number
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

/** Clicks on these inside a row (inputs, buttons, links) don't count as a row click. */
const INTERACTIVE = 'input, button, select, textarea, a, label, [role="button"], [contenteditable="true"]'

/** Simple data table with optional client-side sorting and row click. */
export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  initialSort,
  empty,
  className,
  maxHeight,
  dense,
  selectedKey,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  initialSort?: SortState
  empty?: ReactNode
  className?: string
  maxHeight?: number | string
  dense?: boolean
  selectedKey?: string | number | null
}) {
  const [sort, setSort] = useState<SortState | undefined>(initialSort)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const sv = col.sortValue
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = sv(a)
      const vb = sv(b)
      if (va === vb) return 0
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * mul
    })
  }, [rows, sort, columns])

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const pad = dense ? 'px-3 py-1.5' : 'px-3 py-2.5'
  const alignCls = (a?: string) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left')

  return (
    <div className={cn('overflow-auto', className)} style={{ maxHeight }}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-[1] bg-surface-2">
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={cn(
                    pad,
                    alignCls(c.align),
                    'border-b border-border text-xs font-medium whitespace-nowrap text-fg-muted',
                  )}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className={cn(
                        'inline-flex items-center gap-1 hover:text-fg',
                        c.align === 'right' && 'flex-row-reverse',
                        active && 'text-fg',
                      )}
                    >
                      {c.header}
                      {active ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        )
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-50" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-fg-muted">
                {empty ?? 'No rows'}
              </td>
            </tr>
          ) : (
            sorted.map((r) => {
              const k = rowKey(r)
              return (
                <tr
                  key={k}
                  data-testid="table-row"
                  data-row-key={k}
                  data-selected={selectedKey === k || undefined}
                  onClick={
                    onRowClick
                      ? (e) => {
                          if ((e.target as Element).closest?.(INTERACTIVE)) return
                          onRowClick(r)
                        }
                      : undefined
                  }
                  className={cn(
                    'border-b border-border last:border-b-0',
                    onRowClick && 'cursor-pointer hover:bg-surface-2',
                    selectedKey === k && 'bg-accent-soft hover:bg-accent-soft',
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn(pad, alignCls(c.align), 'whitespace-nowrap text-fg', c.className, c.cellClassName?.(r))}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
