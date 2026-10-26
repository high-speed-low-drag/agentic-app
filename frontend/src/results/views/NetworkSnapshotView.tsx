import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSnapshot } from '../../api/hooks'
import { useChartTheme } from '../../components/charts/theme'
import type { DiagramOverlay, ElementRef } from '../../components/network'
import { ElementDetails, GradientLegend, loadingColor, NetworkDiagram, voltageDivergingColor } from '../../components/network'
import { EmptyState, ErrorState, IconButton, LoadingState, Segmented, Spinner } from '../../components/ui'
import { fmtDateTime, fmtPct, fmtPu, toDate } from '../../lib/format'
import { toNaive } from '../../lib/time'
import { timestepTime } from '../timestamps'
import type { ResultViewProps } from '../types'
import { useRunContext } from '../useRunContext'

const SPEEDS = [
  { value: 600, label: '1×' },
  { value: 250, label: '2×' },
  { value: 80, label: '4×' },
]

/** Network diagram coloured by the results at one timestep, with a time slider and playback. */
export function NetworkSnapshotView({ runId, summary }: ResultViewProps) {
  const theme = useChartTheme()
  const ctx = useRunContext(runId)
  const n = summary.n_timesteps
  const [t, setT] = useState(() => {
    // start at the timestep of the global minimum voltage, if known
    const worst = [...summary.nodes].sort((a, b) => (a.u_min_pu ?? 9) - (b.u_min_pu ?? 9))[0]
    if (!worst?.t_u_min) return 0
    const start = timestepTime(summary, 0)
    const idx = Math.round((toDate(worst.t_u_min).getTime() - start) / (summary.resolution_minutes * 60_000))
    return Number.isFinite(idx) ? Math.max(0, Math.min(n - 1, idx)) : 0
  })
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(250)
  const [selected, setSelected] = useState<ElementRef | null>(null)
  const snap = useSnapshot(runId, t)

  // playback: advance only once the current snapshot has loaded, so frames are not skipped
  const ready = !snap.isFetching
  useEffect(() => {
    if (!playing || !ready) return
    const h = setTimeout(() => setT((x) => (x + 1 >= n ? 0 : x + 1)), speed)
    return () => clearTimeout(h)
  }, [playing, ready, speed, n, t])

  const overlay = useMemo<DiagramOverlay | undefined>(() => {
    const d = snap.data
    if (!d) return undefined
    return {
      nodeColor: (id) => voltageDivergingColor(d.nodes[String(id)], theme),
      branchColor: (id) => loadingColor(d.branches[String(id)], theme),
      branchWidth: (id) => {
        const l = d.branches[String(id)]
        return l === null || l === undefined ? 1 : 1.5 + Math.min(1.5, l) * 3
      },
    }
  }, [snap.data, theme])

  if (ctx.topologyLoading) return <LoadingState label="Loading network…" />
  if (ctx.topologyError) return <ErrorState error={ctx.topologyError} title="Could not load the network of this run" />
  if (!ctx.topology) return <EmptyState title="Network not available" description="The case or network of this run could not be found." />

  const sel = selected
  const selValue =
    sel && snap.data
      ? sel.kind === 'node'
        ? `${fmtPu(snap.data.nodes[String(sel.id)])} pu`
        : sel.kind === 'branch'
          ? fmtPct(snap.data.branches[String(sel.id)])
          : null
      : null

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface-2 px-3 py-2">
        <IconButton
          label={playing ? 'Pause' : 'Play'}
          variant="primary"
          size="sm"
          icon={playing ? <Pause size={14} /> : <Play size={14} />}
          onClick={() => setPlaying((p) => !p)}
        />
        <IconButton size="sm" label="Previous timestep" icon={<ChevronLeft size={14} />} onClick={() => setT((x) => Math.max(0, x - 1))} />
        <IconButton size="sm" label="Next timestep" icon={<ChevronRight size={14} />} onClick={() => setT((x) => Math.min(n - 1, x + 1))} />
        <input
          type="range"
          aria-label="Timestep"
          min={0}
          max={Math.max(0, n - 1)}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          className="min-w-40 flex-1 accent-[var(--c-accent)]"
        />
        <div className="w-44 text-right text-xs">
          <div className="font-medium text-fg tabular">{fmtDateTime(snap.data?.timestamp ?? toNaive(new Date(timestepTime(summary, t))))}</div>
          <div className="text-fg-muted tabular">
            step {(t + 1).toLocaleString()} / {n.toLocaleString()} {snap.isFetching && <Spinner size={10} className="inline" />}
          </div>
        </div>
        <Segmented size="sm" value={speed} onChange={setSpeed} options={SPEEDS} />
      </div>
      {snap.error && <ErrorState error={snap.error} title="Could not load snapshot" />}
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        <NetworkDiagram
          topology={ctx.topology}
          overlay={overlay}
          overlayKey={t}
          selected={selected}
          onSelect={setSelected}
          showAppliances={false}
          height={540}
          legend={
            <div className="flex flex-wrap items-center gap-4">
              <GradientLegend
                label="u"
                stops={[theme.divLow, theme.divMid, theme.divHigh]}
                ticks={['0.92', '1.00', '1.08']}
              />
              <GradientLegend
                label="loading"
                stops={[loadingColor(0, theme), loadingColor(0.6, theme), loadingColor(1, theme), loadingColor(1.2, theme)]}
                ticks={['0%', '60%', '100%', '120%']}
              />
            </div>
          }
        />
        <div className="rounded-md border border-border bg-surface p-3">
          {sel ? (
            <ElementDetails
              topology={ctx.topology}
              selected={sel}
              onSelect={setSelected}
              onClose={() => setSelected(null)}
              extra={
                selValue && (
                  <div className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-sm">
                    <div className="text-xs text-fg-muted">{sel.kind === 'node' ? 'Voltage' : 'Loading'} at this timestep</div>
                    <div className="text-lg font-semibold tabular">{selValue}</div>
                  </div>
                )
              }
            />
          ) : (
            <div className="grid h-full min-h-32 place-items-center text-center text-xs text-fg-muted">Click a node or branch to inspect its value.</div>
          )}
        </div>
      </div>
    </div>
  )
}
