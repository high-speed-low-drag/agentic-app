import { MousePointerClick, PencilRuler } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import type { NetworkTopology } from '../../api/schema'
import { cn } from '../../lib/utils'
import { useChartTheme } from '../charts/theme'
import { Button, Checkbox, Segmented, Select } from '../ui'
import { AddElementDialog } from './AddElementDialog'
import { ElementDetails } from './ElementDetails'
import type { ElementTableEditing } from './ElementTable'
import { ElementTable } from './ElementTable'
import { ExpandableNetwork } from './ExpandableNetwork'
import { TopologyLegend } from './Legend'
import type { EditState, EditTool } from './editMode'
import { availableTools, editHint, editStep, initialEditState } from './editMode'
import type { DiagramLayout } from './NetworkDiagram'
import { LAYOUT_APPLIANCES_MAX, NetworkDiagram } from './NetworkDiagram'
import type { EffectiveTopology } from './overrides'
import type { AdditionSeed } from './additions'
import { addedElements, additionKind, structureKey, withAdditions } from './additions'
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
 *
 * When the table can add elements, the diagram gets an edit mode ("Add on diagram"): a tool bar
 * (Node / Line / Link / Load / Generator / Shunt) and clicks that open the add form pre-filled with
 * the clicked position or node(s) (`editMode.ts`). Saving appends the addition like the table's Add.
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
  const [showAppliances, setShowAppliances] = useState(topology.appliances.length <= LAYOUT_APPLIANCES_MAX)

  // edit mode (add on the diagram)
  const onAdditions = editing?.onAdditionsChange
  const tools = useMemo(() => (onAdditions ? availableTools(editing?.addable) : []), [onAdditions, editing?.addable])
  const [edit, setEdit] = useState<EditState | null>(null)
  const [seed, setSeed] = useState<AdditionSeed | null>(null)
  const seedSpecs = useMemo(
    () => (seed?.component ? (editing?.addable ?? []).filter((s) => s.kind === additionKind(seed.component!)) : []),
    [seed, editing?.addable],
  )
  const nodeName = useMemo(() => new Map(base.nodes.map((n) => [n.id, n.name])), [base])
  const pending = edit?.first ?? null
  // Esc cancels a half-drawn branch, before (capture phase) and instead of the expanded view's Esc-to-collapse
  useEffect(() => {
    if (pending === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      setEdit((s) => (s ? editStep(s, { type: 'escape' }).state : s))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pending])
  const toolbar =
    edit && tools.length > 0 ? (
      <div data-testid="edit-toolbar" className="pointer-events-auto flex flex-col items-start gap-1">
        <Segmented<EditTool>
          size="sm"
          className="bg-surface shadow-sm"
          value={edit.tool}
          onChange={(tool) => setEdit((s) => editStep(s ?? initialEditState(), { type: 'tool', tool }).state)}
          options={tools.map((t) => ({ value: t.tool, label: t.label, title: `Add ${t.label.toLowerCase()}` }))}
        />
        <div data-testid="edit-hint" className="rounded border border-border bg-surface/90 px-2 py-0.5 text-xs text-fg-2 shadow-sm backdrop-blur">
          {editHint(edit, (id) => nodeName.get(id))}
        </div>
      </div>
    ) : undefined

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
              {tools.length > 0 && (
                <Button
                  size="sm"
                  variant={edit ? 'primary' : 'secondary'}
                  icon={<PencilRuler size={14} />}
                  aria-pressed={!!edit}
                  title="Add equipment by clicking on the diagram"
                  onClick={() => setEdit((s) => (s ? null : initialEditState(tools[0].tool)))}
                >
                  Add on diagram
                </Button>
              )}
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
                additions={additions}
                toolbar={toolbar}
                pendingNode={pending}
                onEditClick={
                  edit
                    ? (click) => {
                        const r = editStep(edit, { type: 'click', ...click })
                        setEdit(r.state)
                        if (r.seed) setSeed(r.seed)
                      }
                    : undefined
                }
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
      {onAdditions && (
        <AddElementDialog
          open={seed !== null}
          onClose={() => setSeed(null)}
          specs={seedSpecs}
          topology={base}
          additions={additions ?? []}
          seed={seed ?? undefined}
          onSave={(a) => {
            setSeed(null)
            onAdditions([...(additions ?? []), a])
            // an appliance added on the diagram should be visible there
            if (additionKind(a.component) === 'appliance') setShowAppliances(true)
          }}
        />
      )}
    </div>
  )
}
