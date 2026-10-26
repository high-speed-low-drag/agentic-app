import { RotateCcw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { EditableFields, NetworkOverride, NetworkTopology, ParamValues } from '../../api/schema'
import { fmtKv, fmtPowerW, fmtVar } from '../../lib/format'
import type { Column } from '../ui'
import { Badge, Button, Checkbox, ConfirmDialog, Table, Tabs, TextInput } from '../ui'
import { BoolCell, NumberCell } from './EditableCell'
import type { ElementKind, ElementRef } from './graph'
import { BRANCH_TYPE_LABELS } from './graph'
import type { EditableColumn } from './overrides'
import { changeCounts, changedCells, changedElements, editableColumns, findOverride, revertColumn, setOverride, tabComponents } from './overrides'

type Row = {
  key: number
  id: number
  name: string
  type: string
  /** PGM component (sym_load, line, source, ...) */
  component: string
  params: ParamValues
  a: string
  b: string
  c: string
}

/** Editing support: pass all three to make the editable fields' cells editable. */
export interface ElementTableEditing {
  fields: EditableFields
  overrides: NetworkOverride[]
  onChange: (next: NetworkOverride[]) => void
}

const REVERT_CONFIRM_THRESHOLD = 5

const plural = (n: number) => `${n} change${n === 1 ? '' : 's'}`

/** Searchable tabbed table of nodes / branches / appliances / sources, optionally editable. */
export function ElementTable({
  topology,
  selected,
  onSelect,
  maxHeight = 360,
  editing,
}: {
  topology: NetworkTopology
  selected?: ElementRef | null
  onSelect?: (r: ElementRef) => void
  maxHeight?: number
  editing?: ElementTableEditing
}) {
  const [tab, setTab] = useState<ElementKind>('node')
  const [q, setQ] = useState('')
  const [changedOnly, setChangedOnly] = useState(false)
  const [confirmRevert, setConfirmRevert] = useState(false)
  const nodeName = useMemo(() => new Map(topology.nodes.map((n) => [n.id, n.name])), [topology])

  const overrides = useMemo(() => editing?.overrides ?? [], [editing?.overrides])
  const counts = useMemo(() => changeCounts(overrides), [overrides])
  const cells = useMemo(() => changedCells(overrides), [overrides])
  const changedEls = useMemo(() => changedElements(overrides), [overrides])
  const onOverrides = editing?.onChange
  const edCols = useMemo<EditableColumn[]>(
    () => (editing ? editableColumns(editing.fields, tabComponents(topology, tab)) : []),
    [editing, topology, tab],
  )

  const { rows, cols } = useMemo(() => {
    const text = (s: string) => <span className="text-fg-2">{s}</span>
    const editable = edCols.length > 0
    let rows: Row[]
    let heads: [string, string, string]
    if (tab === 'node') {
      rows = topology.nodes.map((n) => ({ key: n.id, id: n.id, name: n.name, type: 'node', component: 'node', params: {}, a: fmtKv(n.u_rated), b: '', c: '' }))
      heads = ['Rated voltage', '', '']
    } else if (tab === 'branch') {
      rows = topology.branches.map((b) => ({
        key: b.id,
        id: b.id,
        name: b.name,
        type: BRANCH_TYPE_LABELS[b.type] ?? b.type,
        component: b.type,
        params: b.params ?? {},
        a: nodeName.get(b.from_node) ?? String(b.from_node),
        b: nodeName.get(b.to_node) ?? String(b.to_node),
        c: b.in_service ? '' : 'out of service',
      }))
      heads = ['From', 'To', editable ? '' : 'Status']
    } else if (tab === 'appliance') {
      rows = topology.appliances.map((a) => ({
        key: a.id,
        id: a.id,
        name: a.name,
        type: a.type,
        component: a.type,
        params: a.params ?? {},
        a: nodeName.get(a.node) ?? String(a.node),
        b: fmtPowerW(a.p_specified),
        c: fmtVar(a.q_specified),
      }))
      heads = editable ? ['Node', '', ''] : ['Node', 'P', 'Q']
    } else {
      rows = topology.sources.map((s) => ({
        key: s.id,
        id: s.id,
        name: s.name,
        type: 'source',
        component: 'source',
        params: s.params ?? {},
        a: nodeName.get(s.node) ?? String(s.node),
        b: `${s.u_ref.toFixed(3)} pu`,
        c: '',
      }))
      heads = editable ? ['Node', '', ''] : ['Node', 'u_ref', '']
    }
    const cols: Column<Row>[] = [
      { key: 'id', header: 'ID', cell: (r) => <span className="tabular text-fg-muted">{r.id}</span>, sortValue: (r) => r.id, width: 70 },
      { key: 'name', header: 'Name', cell: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
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
    return { rows, cols }
  }, [tab, topology, nodeName, edCols, cells, overrides, onOverrides])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    let out = rows
    if (changedOnly) out = out.filter((r) => changedEls.has(`${tab}:${r.id}`))
    if (!s) return out
    return out.filter((r) => r.name.toLowerCase().includes(s) || String(r.id) === s || r.type.toLowerCase().includes(s) || r.a.toLowerCase().includes(s))
  }, [rows, q, changedOnly, changedEls, tab])

  const tabBadge = (k: ElementKind) =>
    counts[k] > 0 ? (
      <span data-testid={`tab-changes-${k}`} title={plural(counts[k])} className="rounded-full bg-warn-soft px-1.5 text-[10px] font-semibold text-warn tabular">
        {counts[k]}
      </span>
    ) : undefined

  return (
    <div data-testid="element-table" className="flex min-w-0 flex-col">
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
          {editing && (
            <>
              <span
                data-testid="override-count"
                className={counts.total ? 'text-xs font-medium text-warn' : 'text-xs text-fg-muted'}
                title={counts.total ? `${plural(counts[tab])} in this tab` : 'Edit a cell to override the network file value for this case'}
              >
                {plural(counts.total)}
              </span>
              <Checkbox checked={changedOnly} onChange={setChangedOnly} label={<span className="text-xs text-fg-2">Changed only</span>} />
              <Button
                size="sm"
                icon={<RotateCcw size={13} />}
                disabled={counts.total === 0}
                onClick={() => (counts.total > REVERT_CONFIRM_THRESHOLD ? setConfirmRevert(true) : editing.onChange([]))}
              >
                Revert all
              </Button>
            </>
          )}
          <div className="relative w-56">
            <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-muted" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or id…" className="h-8 pl-8 text-xs" />
          </div>
        </div>
      </div>
      <div className="rounded-md border border-border">
        <Table
          dense
          columns={cols}
          rows={filtered}
          rowKey={(r) => r.key}
          maxHeight={maxHeight}
          onRowClick={onSelect ? (r) => onSelect({ kind: tab, id: r.id }) : undefined}
          selectedKey={selected?.kind === tab ? selected.id : null}
          empty={changedOnly ? 'No changed elements in this tab' : q ? 'No elements match your search' : 'No elements'}
        />
      </div>
      {editing && (
        <ConfirmDialog
          open={confirmRevert}
          title="Revert all changes?"
          message={`This removes all ${counts.total} parameter changes and restores the network file values.`}
          confirmLabel="Revert all"
          danger
          onCancel={() => setConfirmRevert(false)}
          onConfirm={() => {
            setConfirmRevert(false)
            editing.onChange([])
          }}
        />
      )}
    </div>
  )
}
