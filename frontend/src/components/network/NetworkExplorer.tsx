import { MousePointerClick } from 'lucide-react'
import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import type { NetworkTopology } from '../../api/schema'
import { cn } from '../../lib/utils'
import { useChartTheme } from '../charts/theme'
import { Checkbox, Select } from '../ui'
import { ElementDetails } from './ElementDetails'
import type { ElementTableEditing } from './ElementTable'
import { ElementTable } from './ElementTable'
import { ExpandableNetwork } from './ExpandableNetwork'
import { TopologyLegend } from './Legend'
import type { DiagramLayout } from './NetworkDiagram'
import { NetworkDiagram } from './NetworkDiagram'
import type { EffectiveTopology } from './overrides'
import { addedElements, structureKey, withAdditions } from './additions'
import { changedElements, effectiveTopology } from './overrides'
import { useNetworkSelection } from './useNetworkSelection'

/**
 * Diagram + details panel + searchable element table, sharing one selection.
 * With `editing`, the table's editable fields become inline inputs (per-case overrides), the
 * case's added elements (`editing.additions`) join the topology, and changed or added elements are
 * marked in the diagram. `topology` is the network file's topology; the table shows it with the
 * additions (their values count as "file" values), the diagram re-lays out only when the additions
 * change structurally. The details panel and the diagram's statuses show `effective` (additions and
 * overrides applied; computed here when not given).
 */
export function NetworkExplorer({
  topology,
  effective: effectiveProp,
  editing,
  title,
}: {
  /** Shown in the header of the expanded view, before "Network" (the case name). */
  title?: string
  topology: NetworkTopology
  effective?: EffectiveTopology
  editing?: ElementTableEditing
}) {
  const theme = useChartTheme()
  const overrides = editing?.overrides
  const additions = editing?.additions
  const changed = useMemo(() => new Set([...changedElements(overrides ?? []), ...addedElements(additions)]), [overrides, additions])
  /** file topology + additions: the table's rows and "file" values */
  const base = useMemo(() => withAdditions(topology, additions), [topology, additions])
  const structure = structureKey(additions)
  // Layout input: only a structural change (element added/removed/reconnected) re-lays out the diagram.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layoutTopology = useMemo(() => base, [topology, structure])
  const ownEffective = useMemo(() => (effectiveProp ? undefined : effectiveTopology(base, overrides ?? [])), [effectiveProp, base, overrides])
  const effective = effectiveProp ?? ownEffective!
  const { selected, focusElement, revealInTable, backToDiagram, tableRef, diagramRef } = useNetworkSelection()
  const [layout, setLayout] = useState<DiagramLayout>('auto')
  const [showAppliances, setShowAppliances] = useState(topology.appliances.length <= 400)

  return (
    <div className="grid grid-cols-1 gap-4">
      <ExpandableNetwork title={title ? `${title} · Network` : 'Network'} className="grid grid-cols-1 gap-4">
        {({ expanded, collapse }) => (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-xs text-fg-2">
                Layout
                <Select<DiagramLayout>
                  className="w-40"
                  value={layout}
                  onChange={setLayout}
                  options={[
                    { value: 'auto', label: 'Auto' },
                    { value: 'tree', label: 'Radial tree (from source)' },
                    { value: 'force', label: 'Force-directed' },
                  ]}
                />
              </div>
              <Checkbox checked={showAppliances} onChange={setShowAppliances} label={<span className="text-xs text-fg-2">Show appliances</span>} />
            </div>
            <div
              className={cn(
                'grid gap-4',
                expanded
                  ? 'min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_280px] lg:grid-rows-[minmax(0,1fr)]'
                  : 'lg:grid-cols-[1fr_280px]',
              )}
            >
              <NetworkDiagram
                ref={diagramRef}
                topology={layoutTopology}
                selected={selected}
                onSelect={(r) => focusElement(r, 'diagram')}
                layout={layout}
                showAppliances={showAppliances}
                height={520}
                legend={<TopologyLegend topology={layoutTopology} theme={theme} changed={changed.size > 0} status={effective.topology} />}
                changed={changed}
                statusTopology={effective.topology}
              />
              <div className={cn('rounded-md border border-border bg-surface p-3', expanded && 'max-h-48 min-h-0 overflow-auto overscroll-contain lg:max-h-none')}>
                {selected ? (
                  <ElementDetails
                    topology={effective.topology}
                    edits={effective}
                    selected={selected}
                    onSelect={(r) => focusElement(r, 'details')}
                    onClose={() => focusElement(null, 'details')}
                    onShowInTable={(r) => {
                      // the table is behind the overlay: collapse (synchronously) before jumping to its row
                      if (expanded) flushSync(() => collapse({ restoreFocus: false }))
                      revealInTable(r)
                    }}
                    showInTableLabel={editing ? 'Edit in table' : 'Show in table'}
                  />
                ) : (
                  <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center text-xs text-fg-muted">
                    <MousePointerClick size={18} />
                    Click an element in the diagram or table to see its details.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </ExpandableNetwork>
      <ElementTable
        ref={tableRef}
        topology={base}
        selected={selected}
        onSelect={(r) => focusElement(r, 'table')}
        onBackToDiagram={backToDiagram}
        editing={editing}
      />
    </div>
  )
}
