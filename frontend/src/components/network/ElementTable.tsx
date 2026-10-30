import { ArrowUpToLine, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import type { Ref } from 'react'
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { AddableComponentSpec, EditableFields, NetworkAddition, NetworkOverride, NetworkTopology } from '../../api/schema'
import type { Column } from '../ui'
import { Badge, Button, Checkbox, ConfirmDialog, Table, Tabs, TextInput } from '../ui'
import { AddElementDialog } from './AddElementDialog'
import { additionCounts, addedElements, deletionSet, setAdditionAttr } from './additions'
import { BoolCell, NumberCell } from './EditableCell'
import type { ElementKind, ElementRef } from './graph'
import type { EditableColumn } from './overrides'
import { changeCounts, changedCells, changedElements, editableColumns, findOverride, revertColumn, setOverride, tabComponents } from './overrides'
import type { TableRow as Row } from './selection'
import { filtersToClear, matchesSearch, prefersReducedMotion, scrollTopToShow, tableRows } from './selection'

/**
 * Editing support: `fields`, `overrides` and `onChange` make the editable fields' cells editable.
 * With `addable` and `onAdditionsChange`, each tab gets an Add button and added elements (`additions`,
 * already part of the table's `topology`) are edited (their own attrs) and deleted in place.
 * `onAdditionsChange` receives the new list; the owner drops whatever referred to removed elements.
 */
export interface ElementTableEditing {
  fields: EditableFields
  overrides: NetworkOverride[]
  onChange: (next: NetworkOverride[]) => void
  addable?: AddableComponentSpec[]
  additions?: NetworkAddition[]
  onAdditionsChange?: (next: NetworkAddition[]) => void
  /** "Revert all": clear overrides and additions in one change (default: `onChange([])`) */
  onRevertAll?: () => void
}

/** Imperative handle for the shared selection. */
export interface ElementTableHandle {
  /** Quiet select (diagram click): switch to the element's tab and scroll its row into view inside the
   *  table's own scroll container only. Filters are left alone; a row they hide is simply not shown. */
  select: (ref: ElementRef) => void
  /** Jump to an element's row ("Edit in table"): switch tab, clear hiding filters, page scroll, flash. */
  reveal: (ref: ElementRef) => void
}

const REVERT_CONFIRM_THRESHOLD = 5

const plural = (n: number) => `${n} change${n === 1 ? '' : 's'}`
const ADD_LABEL: Partial<Record<ElementKind, string>> = { node: 'Add node', branch: 'Add branch', appliance: 'Add appliance' }
const NO_ADDITIONS: NetworkAddition[] = []

/** Searchable tabbed table of nodes / branches / appliances / sources, optionally editable. */
export function ElementTable({
  topology,
  selected,
  onSelect,
  maxHeight = 360,
  editing,
  onBackToDiagram,
  ref,
}: {
  topology: NetworkTopology
  selected?: ElementRef | null
  onSelect?: (r: ElementRef) => void
  maxHeight?: number
  editing?: ElementTableEditing
  /** Shows a "Back to diagram" button in the selected row. */
  onBackToDiagram?: () => void
  ref?: Ref<ElementTableHandle>
}) {
  const [tab, setTab] = useState<ElementKind>('node')
  const [q, setQ] = useState('')
  const [changedOnly, setChangedOnly] = useState(false)
  const [confirmRevert, setConfirmRevert] = useState(false)
  const [adding, setAdding] = useState(false)
  /** id of the added element whose deletion awaits confirmation */
  const [deleting, setDeleting] = useState<number | null>(null)
  /** "Filters cleared to show X" after a reveal had to clear the search or "Changed only". */
  const [note, setNote] = useState<string | null>(null)
  /** Bumped per select/reveal so doing it again for the same row still re-renders (and scrolls). */
  const [, setRevealCount] = useState(0)
  const pendingReveal = useRef<{ id: number; quiet: boolean } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const nodeName = useMemo(() => new Map(topology.nodes.map((n) => [n.id, n.name])), [topology])

  const overrides = useMemo(() => editing?.overrides ?? [], [editing?.overrides])
  const additions = editing?.additions ?? NO_ADDITIONS
  const onAdditions = editing?.onAdditionsChange
  const addedIds = useMemo(() => new Set(additions.map((a) => a.id)), [additions])
  /** change counts per tab: changed cells plus added elements (each counts once) */
  const counts = useMemo(() => {
    const c = changeCounts(overrides)
    const a = additionCounts(additions)
    for (const k of ['node', 'branch', 'appliance', 'source'] as const) c[k] += a[k]
    c.total += additions.length
    return c
  }, [overrides, additions])
  const cells = useMemo(() => changedCells(overrides), [overrides])
  const changedEls = useMemo(() => new Set([...changedElements(overrides), ...addedElements(additions)]), [overrides, additions])
  const onOverrides = editing?.onChange
  const addSpecs = useMemo(() => (onAdditions ? (editing?.addable ?? []).filter((s) => s.kind === tab) : []), [editing?.addable, onAdditions, tab])
  const toDelete = useMemo(() => (deleting === null ? [] : deletionSet(additions, deleting)), [additions, deleting])
  const edCols = useMemo<EditableColumn[]>(
    () => (editing ? editableColumns(editing.fields, tabComponents(topology, tab)) : []),
    [editing, topology, tab],
  )
  const selectedId = selected?.kind === tab ? selected.id : null

  useImperativeHandle(
    ref,
    () => ({
      select: (el: ElementRef) => {
        setTab(el.kind)
        setNote(null)
        pendingReveal.current = { id: el.id, quiet: true }
        setRevealCount((n) => n + 1)
      },
      reveal: (el: ElementRef) => {
        const row = tableRows(topology, el.kind, nodeName).find((r) => r.id === el.id)
        setTab(el.kind)
        const clear = filtersToClear(el, row, { q, changedOnly }, changedEls)
        if (clear?.q) setQ('')
        if (clear?.changedOnly) setChangedOnly(false)
        setNote(row && (clear?.q || clear?.changedOnly) ? `Filters cleared to show ${row.name}` : null)
        pendingReveal.current = row ? { id: row.id, quiet: false } : null
        setRevealCount((n) => n + 1)
      },
    }),
    [topology, nodeName, q, changedOnly, changedEls],
  )

  // After a select/reveal renders: scroll the row into view and, for a reveal, flash it once.
  useEffect(() => {
    const pending = pendingReveal.current
    if (pending === null) return
    const tr = wrapRef.current?.querySelector<HTMLElement>(`tr[data-row-key="${pending.id}"]`)
    if (pending.quiet) {
      // Table scroll container only: never scrollIntoView, which can scroll the page.
      pendingReveal.current = null
      const box = tr?.closest<HTMLElement>('[data-table-scroll]')
      if (!tr || !box) return // hidden by the filters: leave them alone
      const header = box.querySelector('thead')?.offsetHeight ?? 0
      const rowTop = tr.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
      box.scrollTop = scrollTopToShow(rowTop, tr.offsetHeight, box.scrollTop, box.clientHeight, header)
      box.scrollLeft = 0
      return
    }
    if (!tr) return
    pendingReveal.current = null
    const reduced = prefersReducedMotion()
    // inline 'start' also resets the table's horizontal scroll; scroll-pt keeps the row clear of the sticky header
    tr.scrollIntoView({ block: 'nearest', inline: 'start', behavior: reduced ? 'auto' : 'smooth' })
    tr.classList.remove('row-flash')
    void tr.offsetWidth // restart the animation
    tr.classList.add('row-flash')
    tr.addEventListener('animationend', () => tr.classList.remove('row-flash'), { once: true })
  })

  const { rows, cols } = useMemo(() => {
    const text = (s: string) => <span className="text-fg-2">{s}</span>
    const editable = edCols.length > 0
    const rows = tableRows(topology, tab, nodeName)
    const heads: [string, string, string] =
      tab === 'node'
        ? ['Rated voltage', '', '']
        : tab === 'branch'
          ? ['From', 'To', editable ? '' : 'Status']
          : tab === 'appliance'
            ? editable
              ? ['Node', '', '']
              : ['Node', 'P', 'Q']
            : editable
              ? ['Node', '', '']
              : ['Node', 'u_ref', '']
    const cols: Column<Row>[] = [
      { key: 'id', header: 'ID', cell: (r) => <span className="tabular text-fg-muted">{r.id}</span>, sortValue: (r) => r.id, width: 70 },
      {
        key: 'name',
        header: 'Name',
        sortValue: (r) => r.name,
        cell: (r) => (
          <span className="inline-flex items-center gap-2">
            <span className="font-medium">{r.name}</span>
            {addedIds.has(r.id) && (
              <Badge tone="accent" className="px-1.5 py-0 text-[10px]" title="Added by this case (not in the network file)">
                <span data-testid="new-badge">New</span>
              </Badge>
            )}
            {onBackToDiagram && r.id === selectedId && (
              <button
                type="button"
                data-testid="back-to-diagram"
                onClick={onBackToDiagram}
                title="Scroll back to the diagram"
                className="inline-flex items-center gap-0.5 rounded px-1 text-[11px] font-medium text-accent hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ArrowUpToLine size={11} />
                Back to diagram
              </button>
            )}
          </span>
        ),
      },
    ]
    if (tab !== 'node' && tab !== 'source')
      cols.push({ key: 'type', header: 'Type', cell: (r) => <Badge>{r.type}</Badge>, sortValue: (r) => r.type })
    heads.forEach((h, i) => {
      if (!h) return
      const k = (['a', 'b', 'c'] as const)[i]
      cols.push({ key: k, header: h, cell: (r) => text(r[k]), sortValue: (r) => r[k], align: tab === 'appliance' && i > 0 ? 'right' : 'left' })
    })

    for (const col of edCols) {
      const isChanged = (r: Row) => cells.has(`${r.component}:${r.id}:${col.id}`)
      const current = (r: Row, field: string) => findOverride(overrides, r.component, r.id, field)?.value ?? r.params[field]
      cols.push({
        key: `edit:${col.id}`,
        header: col.unit ? `${col.label} (${col.unit})` : col.label,
        align: col.kind === 'bool' ? 'center' : 'right',
        cellClassName: (r) => isChanged(r) && 'bg-warn-soft',
        sortValue: (r) => {
          const f = col.fields[r.component]?.[0]
          return f ? current(r, f.field) : null
        },
        cell: (r) => {
          const fields = col.fields[r.component]
          if (!fields?.length || !onOverrides) return <span className="text-fg-muted">—</span>
          if (addedIds.has(r.id)) {
            // added element: edits change its own attrs (no overrides, nothing to revert to)
            if (!onAdditions) return <span className="text-fg-muted">—</span>
            const label = `${col.label} of ${r.name}`
            if (col.kind === 'bool')
              return (
                <BoolCell
                  checked={fields.every((f) => (r.params[f.field] ?? 1) !== 0)}
                  fileChecked={fields.every((f) => (r.params[f.field] ?? 1) !== 0)}
                  changed={false}
                  label={label}
                  onRevert={() => {}}
                  onChange={(v) => {
                    let next = additions
                    for (const f of fields) next = setAdditionAttr(next, r.id, f.field, v ? 1 : 0)
                    onAdditions(next)
                  }}
                />
              )
            const f = fields[0]
            return (
              <NumberCell
                field={f}
                value={r.params[f.field]}
                file={r.params[f.field]}
                changed={false}
                label={label}
                onRevert={() => {}}
                onCommit={(v) => onAdditions(setAdditionAttr(additions, r.id, f.field, v))}
              />
            )
          }
          const changed = isChanged(r)
          const label = `${col.label} of ${r.name}`
          const revert = () => onOverrides(revertColumn(overrides, r.component, r.id, col.id))
          if (col.kind === 'bool') {
            const on = fields.every((f) => (current(r, f.field) ?? 1) !== 0)
            const fileOn = fields.every((f) => (r.params[f.field] ?? 1) !== 0)
            return (
              <BoolCell
                checked={on}
                fileChecked={fileOn}
                changed={changed}
                label={label}
                onRevert={revert}
                onChange={(v) => {
                  let next = overrides
                  for (const f of fields)
                    next = setOverride(next, { component: r.component, id: r.id, field: f.field, value: v ? 1 : 0 }, r.params[f.field])
                  onOverrides(next)
                }}
              />
            )
          }
          const f = fields[0]
          return (
            <NumberCell
              field={f}
              value={current(r, f.field)}
              file={r.params[f.field]}
              changed={changed}
              label={label}
              onRevert={revert}
              onCommit={(v) => onOverrides(setOverride(overrides, { component: r.component, id: r.id, field: f.field, value: v }, r.params[f.field]))}
            />
          )
        },
      })
    }
    if (onAdditions && rows.some((r) => addedIds.has(r.id)))
      cols.push({
        key: 'actions',
        header: '',
        align: 'right',
        width: 48,
        cell: (r) =>
          addedIds.has(r.id) ? (
            <button
              type="button"
              aria-label={`Delete ${r.name}`}
              title={`Delete ${r.name}`}
              onClick={(e) => {
                e.stopPropagation()
                setDeleting(r.id)
              }}
              className="inline-flex size-6 items-center justify-center rounded text-fg-muted hover:bg-bad-soft hover:text-bad focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Trash2 size={13} />
            </button>
          ) : null,
      })
    return { rows, cols }
  }, [tab, topology, nodeName, edCols, cells, overrides, onOverrides, onBackToDiagram, selectedId, addedIds, additions, onAdditions])

  const filtered = useMemo(() => {
    let out = rows
    if (changedOnly) out = out.filter((r) => changedEls.has(`${tab}:${r.id}`))
    return q.trim() ? out.filter((r) => matchesSearch(r, q)) : out
  }, [rows, q, changedOnly, changedEls, tab])

  const tabBadge = (k: ElementKind) =>
    counts[k] > 0 ? (
      <span data-testid={`tab-changes-${k}`} title={plural(counts[k])} className="rounded-full bg-warn-soft px-1.5 text-[10px] font-semibold text-warn tabular">
        {counts[k]}
      </span>
    ) : undefined

  return (
    <div ref={wrapRef} data-testid="element-table" data-tab={tab} className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Tabs
          size="sm"
          className="border-b-0"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'node', label: `Nodes (${topology.nodes.length})` },
            { id: 'branch', label: `Branches (${topology.branches.length})`, badge: tabBadge('branch') },
            { id: 'appliance', label: `Appliances (${topology.appliances.length})`, badge: tabBadge('appliance') },
            { id: 'source', label: `Sources (${topology.sources.length})`, badge: tabBadge('source') },
          ]}
        />
        <div className="mb-1 flex flex-wrap items-center gap-3">
          {addSpecs.length > 0 && ADD_LABEL[tab] && (
            <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => setAdding(true)}>
              {ADD_LABEL[tab]}
            </Button>
          )}
          {editing && (
            <>
              <span
                data-testid="override-count"
                className={counts.total ? 'text-xs font-medium text-warn' : 'text-xs text-fg-muted'}
                title={counts.total ? `${plural(counts[tab])} in this tab` : 'Edit a cell to override the network file value for this case, or add new elements'}
              >
                {plural(counts.total)}
              </span>
              <Checkbox
                checked={changedOnly}
                onChange={(v) => {
                  setChangedOnly(v)
                  setNote(null)
                }}
                label={<span className="text-xs text-fg-2">Changed only</span>}
              />
              <Button
                size="sm"
                icon={<RotateCcw size={13} />}
                disabled={counts.total === 0}
                onClick={() =>
                  counts.total > REVERT_CONFIRM_THRESHOLD || additions.length > 0 ? setConfirmRevert(true) : (editing.onRevertAll ?? (() => editing.onChange([])))()
                }
              >
                Revert all
              </Button>
            </>
          )}
          <div className="relative w-56">
            <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-muted" />
            <TextInput
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setNote(null)
              }}
              placeholder="Search name or id…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </div>
      {note && (
        <div
          role="status"
          data-testid="filters-cleared-note"
          className="mb-1.5 flex items-center gap-2 self-start rounded-md bg-accent-soft px-2.5 py-1 text-xs text-fg-2"
        >
          {note}
          <button type="button" className="text-fg-muted hover:text-fg" onClick={() => setNote(null)} aria-label="Dismiss note">
            <X size={12} />
          </button>
        </div>
      )}
      <div className="rounded-md border border-border">
        <Table
          dense
          className="scroll-pt-8"
          columns={cols}
          rows={filtered}
          rowKey={(r) => r.key}
          maxHeight={maxHeight}
          onRowClick={onSelect ? (r) => onSelect({ kind: tab, id: r.id }) : undefined}
          selectedKey={selectedId}
          empty={changedOnly ? 'No changed elements in this tab' : q ? 'No elements match your search' : 'No elements'}
        />
      </div>
      {editing && (
        <ConfirmDialog
          open={confirmRevert}
          title="Revert all changes?"
          message={
            additions.length > 0
              ? `This removes all ${counts.total} changes, including ${additions.length} new element${additions.length === 1 ? '' : 's'}, and restores the network file.`
              : `This removes all ${counts.total} parameter changes and restores the network file values.`
          }
          confirmLabel="Revert all"
          danger
          onCancel={() => setConfirmRevert(false)}
          onConfirm={() => {
            setConfirmRevert(false)
            if (editing.onRevertAll) editing.onRevertAll()
            else editing.onChange([])
          }}
        />
      )}
      {editing && onAdditions && (
        <>
          <AddElementDialog
            open={adding}
            onClose={() => setAdding(false)}
            specs={addSpecs}
            topology={topology}
            additions={additions}
            onSave={(a) => {
              setAdding(false)
              onAdditions([...additions, a])
            }}
          />
          <ConfirmDialog
            open={toDelete.length > 0}
            title={`Delete ${toDelete[0]?.name ?? ''}?`}
            message={
              toDelete.length > 1 ? (
                <>
                  <p>Deleting this node also deletes the new elements connected to it:</p>
                  <ul data-testid="delete-dependents" className="mt-1.5 list-disc pl-5">
                    {toDelete.slice(1).map((a) => (
                      <li key={a.id}>{a.name}</li>
                    ))}
                  </ul>
                </>
              ) : (
                'The new element is removed from this case.'
              )
            }
            confirmLabel={toDelete.length > 1 ? `Delete ${toDelete.length} elements` : 'Delete'}
            danger
            onCancel={() => setDeleting(null)}
            onConfirm={() => {
              const gone = new Set(toDelete.map((a) => a.id))
              setDeleting(null)
              onAdditions(additions.filter((a) => !gone.has(a.id)))
            }}
          />
        </>
      )}
    </div>
  )
}
