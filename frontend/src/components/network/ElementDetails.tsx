import { TableProperties, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { NetworkTopology } from '../../api/schema'
import { fmtKv, fmtPowerW, fmtPu, fmtVar } from '../../lib/format'
import { Badge, Button } from '../ui'
import { EditedMarker } from './EditedMarker'
import type { ElementRef } from './graph'
import type { EffectiveTopology } from './overrides'
import { BRANCH_TYPE_LABELS } from './graph'

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div data-testid="details-row" data-key={k} className="flex justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <span className="text-fg-muted">{k}</span>
      <span className="text-right text-fg tabular">{v}</span>
    </div>
  )
}

function NodeLink({ topology, id, onSelect }: { topology: NetworkTopology; id: number; onSelect?: (r: ElementRef) => void }) {
  const name = topology.nodes.find((n) => n.id === id)?.name ?? `node ${id}`
  return (
    <button className="text-accent hover:underline" onClick={() => onSelect?.({ kind: 'node', id })}>
      {name}
    </button>
  )
}

/**
 * Detail panel for a selected network element. `extra` rows can add result values.
 * With `edits`, `topology` is the effective (override-applied) topology and edited values get an
 * amber "edited" marker with the file value in its tooltip.
 */
export function ElementDetails({
  topology,
  edits,
  selected,
  onClose,
  onSelect,
  extra,
  onShowInTable,
  showInTableLabel = 'Show in table',
}: {
  topology: NetworkTopology
  edits?: Pick<EffectiveTopology, 'isEdited' | 'fileValue'>
  selected: ElementRef
  onClose?: () => void
  onSelect?: (r: ElementRef) => void
  extra?: ReactNode
  /** Adds a button that jumps to this element's row in the element table. */
  onShowInTable?: (r: ElementRef) => void
  showInTableLabel?: string
}) {
  const link = (id: number) => <NodeLink topology={topology} id={id} onSelect={onSelect} />
  /** A value, marked when edited; `fmt` formats the file value for the tooltip. */
  const val = (field: string, text: string, fmt: (file: number) => string) => {
    if (!edits?.isEdited(selected.kind, selected.id, field)) return text
    const file = edits.fileValue(selected.kind, selected.id, field)
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium text-warn">{text}</span>
        <EditedMarker title={`File value: ${file == null ? 'not set' : fmt(file)}`} />
      </span>
    )
  }
  const yesNo = (v: number | boolean | undefined) => (v ? 'yes' : 'no')

  let title: string
  let kindLabel: string
  let rows: ReactNode

  if (selected.kind === 'node') {
    const n = topology.nodes.find((x) => x.id === selected.id)
    if (!n) return null
    title = n.name
    kindLabel = 'Node'
    const apps = topology.appliances.filter((a) => a.node === n.id)
    const srcs = topology.sources.filter((s) => s.node === n.id)
    const branches = topology.branches.filter((b) => b.from_node === n.id || b.to_node === n.id || b.node_3 === n.id)
    rows = (
      <>
        <Row k="ID" v={n.id} />
        <Row k="Rated voltage" v={fmtKv(n.u_rated)} />
        <Row k="Connected branches" v={branches.length} />
        {srcs.length > 0 && <Row k="Sources" v={srcs.map((s) => s.name).join(', ')} />}
        {apps.length > 0 && (
          <div className="pt-2">
            <div className="mb-1 text-xs font-medium text-fg-muted">Appliances ({apps.length})</div>
            <div className="flex flex-col gap-1">
              {apps.slice(0, 20).map((a) => (
                <button
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-surface-3"
                  onClick={() => onSelect?.({ kind: 'appliance', id: a.id })}
                >
                  <span className="truncate">{a.name}</span>
                  <span className="text-fg-muted">{a.type}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    )
  } else if (selected.kind === 'branch') {
    const b = topology.branches.find((x) => x.id === selected.id)
    if (!b) return null
    title = b.name
    kindLabel = BRANCH_TYPE_LABELS[b.type] ?? b.type
    rows = (
      <>
        <Row k="ID" v={b.id} />
        <Row k="From" v={link(b.from_node)} />
        <Row k="To" v={link(b.to_node)} />
        {b.node_3 != null && <Row k="Node 3" v={link(b.node_3)} />}
        <Row k="In service" v={val('in_service', yesNo(b.in_service), yesNo)} />
      </>
    )
  } else if (selected.kind === 'appliance') {
    const a = topology.appliances.find((x) => x.id === selected.id)
    if (!a) return null
    title = a.name
    kindLabel = a.type
    rows = (
      <>
        <Row k="ID" v={a.id} />
        <Row k="Node" v={link(a.node)} />
        <Row k="P specified" v={val('p_specified', fmtPowerW(a.p_specified), fmtPowerW)} />
        <Row k="Q specified" v={val('q_specified', fmtVar(a.q_specified), fmtVar)} />
        <Row k="In service" v={val('in_service', yesNo(a.in_service), yesNo)} />
      </>
    )
  } else {
    const s = topology.sources.find((x) => x.id === selected.id)
    if (!s) return null
    title = s.name
    kindLabel = 'Source'
    rows = (
      <>
        <Row k="ID" v={s.id} />
        <Row k="Node" v={link(s.node)} />
        <Row k="u_ref" v={val('u_ref', `${fmtPu(s.u_ref)} pu`, (f) => `${fmtPu(f)} pu`)} />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-2" data-testid="element-details" data-kind={selected.kind} data-id={selected.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Badge tone="accent">{kindLabel}</Badge>
          <div className="mt-1 truncate text-sm font-semibold text-fg" title={title} data-testid="details-title">
            {title}
          </div>
        </div>
        {onClose && (
          <button className="text-fg-muted hover:text-fg" onClick={onClose} aria-label="Close details">
            <X size={14} />
          </button>
        )}
      </div>
      <div>
        {rows}
        {extra}
      </div>
      {onShowInTable && (
        <Button size="sm" className="self-start" data-testid="show-in-table" icon={<TableProperties size={13} />} onClick={() => onShowInTable(selected)}>
          {showInTableLabel}
        </Button>
      )}
    </div>
  )
}
