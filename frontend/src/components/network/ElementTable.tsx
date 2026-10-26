import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { NetworkTopology } from '../../api/schema'
import { fmtKv, fmtPowerW, fmtVar } from '../../lib/format'
import type { Column } from '../ui'
import { Badge, Table, Tabs, TextInput } from '../ui'
import type { ElementKind, ElementRef } from './graph'
import { BRANCH_TYPE_LABELS } from './graph'

type Row = { key: number; id: number; name: string; type: string; a: string; b: string; c: string }

/** Searchable tabbed table of nodes / branches / appliances / sources. */
export function ElementTable({
  topology,
  selected,
  onSelect,
  maxHeight = 360,
}: {
  topology: NetworkTopology
  selected?: ElementRef | null
  onSelect?: (r: ElementRef) => void
  maxHeight?: number
}) {
  const [tab, setTab] = useState<ElementKind>('node')
  const [q, setQ] = useState('')
  const nodeName = useMemo(() => new Map(topology.nodes.map((n) => [n.id, n.name])), [topology])

  const { rows, cols } = useMemo(() => {
    const text = (s: string) => <span className="text-fg-2">{s}</span>
    let rows: Row[]
    let heads: [string, string, string]
    if (tab === 'node') {
      rows = topology.nodes.map((n) => ({ key: n.id, id: n.id, name: n.name, type: 'node', a: fmtKv(n.u_rated), b: '', c: '' }))
      heads = ['Rated voltage', '', '']
    } else if (tab === 'branch') {
      rows = topology.branches.map((b) => ({
        key: b.id,
        id: b.id,
        name: b.name,
        type: BRANCH_TYPE_LABELS[b.type] ?? b.type,
        a: nodeName.get(b.from_node) ?? String(b.from_node),
        b: nodeName.get(b.to_node) ?? String(b.to_node),
        c: b.in_service ? '' : 'out of service',
      }))
      heads = ['From', 'To', 'Status']
    } else if (tab === 'appliance') {
      rows = topology.appliances.map((a) => ({
        key: a.id,
        id: a.id,
        name: a.name,
        type: a.type,
        a: nodeName.get(a.node) ?? String(a.node),
        b: fmtPowerW(a.p_specified),
        c: fmtVar(a.q_specified),
      }))
      heads = ['Node', 'P', 'Q']
    } else {
      rows = topology.sources.map((s) => ({
        key: s.id,
        id: s.id,
        name: s.name,
        type: 'source',
        a: nodeName.get(s.node) ?? String(s.node),
        b: `${s.u_ref.toFixed(3)} pu`,
        c: '',
      }))
      heads = ['Node', 'u_ref', '']
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
    return { rows, cols }
  }, [tab, topology, nodeName])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => r.name.toLowerCase().includes(s) || String(r.id) === s || r.type.toLowerCase().includes(s) || r.a.toLowerCase().includes(s))
  }, [rows, q])

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Tabs
          size="sm"
          className="border-b-0"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'node', label: `Nodes (${topology.nodes.length})` },
            { id: 'branch', label: `Branches (${topology.branches.length})` },
            { id: 'appliance', label: `Appliances (${topology.appliances.length})` },
            { id: 'source', label: `Sources (${topology.sources.length})` },
          ]}
        />
        <div className="relative mb-1 w-56">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-muted" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or id…" className="h-8 pl-8 text-xs" />
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
          empty={q ? 'No elements match your search' : 'No elements'}
        />
      </div>
    </div>
  )
}
