import { MousePointerClick } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { NetworkTopology } from '../../api/schema'
import { useChartTheme } from '../charts/theme'
import { Checkbox, Select } from '../ui'
import { ElementDetails } from './ElementDetails'
import type { ElementTableEditing } from './ElementTable'
import { ElementTable } from './ElementTable'
import { TopologyLegend } from './Legend'
import type { DiagramLayout } from './NetworkDiagram'
import { NetworkDiagram } from './NetworkDiagram'
import { changedElements } from './overrides'
import { useNetworkSelection } from './useNetworkSelection'

/**
 * Diagram + details panel + searchable element table, sharing one selection.
 * With `editing`, the table's editable fields become inline inputs (per-case overrides)
 * and changed elements are marked in the diagram.
 */
export function NetworkExplorer({ topology, editing }: { topology: NetworkTopology; editing?: ElementTableEditing }) {
  const theme = useChartTheme()
  const overrides = editing?.overrides
  const changed = useMemo(() => changedElements(overrides ?? []), [overrides])
  const { selected, focusElement, revealInTable, backToDiagram, tableRef, diagramRef } = useNetworkSelection()
  const [layout, setLayout] = useState<DiagramLayout>('auto')
  const [showAppliances, setShowAppliances] = useState(topology.appliances.length <= 400)

  return (
    <div className="grid grid-cols-1 gap-4">
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
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <NetworkDiagram
          ref={diagramRef}
          topology={topology}
          selected={selected}
          onSelect={(r) => focusElement(r, 'diagram')}
          layout={layout}
          showAppliances={showAppliances}
          height={520}
          legend={<TopologyLegend topology={topology} theme={theme} changed={changed.size > 0} />}
          changed={changed}
        />
        <div className="rounded-md border border-border bg-surface p-3">
          {selected ? (
            <ElementDetails
              topology={topology}
              selected={selected}
              onSelect={(r) => focusElement(r, 'details')}
              onClose={() => focusElement(null, 'details')}
              onShowInTable={revealInTable}
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
      <ElementTable
        ref={tableRef}
        topology={topology}
        selected={selected}
        onSelect={(r) => focusElement(r, 'table')}
        onBackToDiagram={backToDiagram}
        editing={editing}
      />
    </div>
  )
}
