import { MousePointerClick } from 'lucide-react'
import { useState } from 'react'
import type { NetworkTopology } from '../../api/schema'
import { useChartTheme } from '../charts/theme'
import { Checkbox, Select } from '../ui'
import { ElementDetails } from './ElementDetails'
import { ElementTable } from './ElementTable'
import type { ElementRef } from './graph'
import { TopologyLegend } from './Legend'
import type { DiagramLayout } from './NetworkDiagram'
import { NetworkDiagram } from './NetworkDiagram'

/** Diagram + details panel + searchable element table, sharing one selection. */
export function NetworkExplorer({ topology }: { topology: NetworkTopology }) {
  const theme = useChartTheme()
  const [selected, setSelected] = useState<ElementRef | null>(null)
  const [layout, setLayout] = useState<DiagramLayout>('auto')
  const [showAppliances, setShowAppliances] = useState(topology.appliances.length <= 400)

  return (
    <div className="grid gap-4">
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
          topology={topology}
          selected={selected}
          onSelect={setSelected}
          layout={layout}
          showAppliances={showAppliances}
          height={520}
          legend={<TopologyLegend topology={topology} theme={theme} />}
        />
        <div className="rounded-md border border-border bg-surface p-3">
          {selected ? (
            <ElementDetails topology={topology} selected={selected} onSelect={setSelected} onClose={() => setSelected(null)} />
          ) : (
            <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center text-xs text-fg-muted">
              <MousePointerClick size={18} />
              Click an element in the diagram or table to see its details.
            </div>
          )}
        </div>
      </div>
      <ElementTable topology={topology} selected={selected} onSelect={setSelected} />
    </div>
  )
}
