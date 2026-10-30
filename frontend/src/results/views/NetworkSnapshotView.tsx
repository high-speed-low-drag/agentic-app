import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { snapshotQuery, useSnapshot } from '../../api/hooks'
import { useChartTheme } from '../../components/charts/theme'
import type { DiagramOverlay, ElementRef } from '../../components/network'
import {
  branchInService,
  ElementDetails,
  energisedNodes,
  GradientLegend,
  ISLANDED_TIP,
  loadingColor,
  ExpandableNetwork,
  NetworkDiagram,
  OOS_TIP,
  StatusLegend,
  VoltageScaleLegend,
} from '../../components/network'
import { changedElements } from '../../components/network/overrides'
import { EmptyState, ErrorState, IconButton, LoadingState, Segmented, Spinner } from '../../components/ui'
import { cn } from '../../lib/utils'
import { fmtDateTime, fmtPct, fmtPu, toDate } from '../../lib/format'
import { solarSource } from '../../lib/solar'
import { toNaive } from '../../lib/time'
import { useElementWidth } from '../../lib/useElementWidth'
import { voltageColor } from '../../lib/voltageScale'
import { timestepTime } from '../timestamps'
import type { ResultViewProps } from '../types'
import { useRunContext } from '../useRunContext'
import { DaylightTrack } from './DaylightTrack'
import { BASE_STEP_MS, DEFAULT_MULTIPLIER, nextFrameDelay, playbackSpeeds } from './playback'
import { SnapshotClock } from './SnapshotClock'

const SPEEDS = playbackSpeeds()
const SPEED_OPTIONS = SPEEDS.map(({ value, label }) => ({ value, label }))
/** Below this diagram width the clock collapses to the digital time. */
const CLOCK_COMPACT_PX = 560

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
  const [speed, setSpeed] = useState(BASE_STEP_MS / DEFAULT_MULTIPLIER)
  const [selected, setSelected] = useState<ElementRef | null>(null)
  const snap = useSnapshot(runId, t)
  const queryClient = useQueryClient()
  const prefetch = SPEEDS.find((s) => s.value === speed)?.prefetch ?? 2
  const [diagramRef, diagramWidth] = useElementWidth<HTMLDivElement>()
  // daylight from the frozen case's first PV profile (latitude, solar noon), else the PV defaults
  const assignments = ctx.case?.profile_assignments
  const solar = useMemo(() => solarSource(assignments), [assignments])

  // playback never skips a frame: advance only once the current timestep's own snapshot is shown, and aim
  // for `speed` ms after it was shown, so (pre)fetch time does not add to the interval for cached frames
  const ready = !snap.isFetching && !snap.isPlaceholderData
  const shownAt = useRef(0)
  useEffect(() => {
    if (ready) shownAt.current = performance.now()
  }, [ready, t])
  useEffect(() => {
    if (!playing || !ready) return
    const h = setTimeout(() => setT((x) => (x + 1 >= n ? 0 : x + 1)), nextFrameDelay(speed, shownAt.current, performance.now()))
    return () => clearTimeout(h)
  }, [playing, ready, speed, n, t])

  // while playing, keep the next few snapshots in flight (wrapping at the end of the run)
  useEffect(() => {
    if (!playing || n <= 1) return
    for (let i = 1; i <= Math.min(prefetch, n - 1); i++) void queryClient.prefetchQuery(snapshotQuery(runId, (t + i) % n))
  }, [playing, prefetch, queryClient, runId, n, t])

  const overlay = useMemo<DiagramOverlay | undefined>(() => {
    const d = snap.data
    if (!d) return undefined
    return {
      nodeColor: (id) => voltageColor(d.nodes[String(id)], ctx.limits, theme),
      branchColor: (id) => loadingColor(d.branches[String(id)], theme),
      branchWidth: (id) => {
        const l = d.branches[String(id)]
        return l === null || l === undefined ? 1 : 1.5 + Math.min(1.5, l) * 3
      },
    }
  }, [snap.data, theme, ctx.limits])

  // the run's own network: branches switched off by the frozen case's overrides are drawn dashed
  const overrides = ctx.case?.network_overrides
  const changed = useMemo(() => changedElements(overrides ?? []), [overrides])
  const status = useMemo(
    () =>
      ctx.topology
        ? { branchOff: new Set(ctx.topology.branches.filter((b) => !branchInService(b)).map((b) => b.id)), energised: energisedNodes(ctx.topology) }
        : undefined,
    [ctx.topology],
  )

  if (ctx.topologyLoading) return <LoadingState label="Loading network…" />
  if (ctx.topologyError) return <ErrorState error={ctx.topologyError} title="Could not load the network of this run" />
  if (!ctx.topology || !ctx.fileTopology) return <EmptyState title="Network not available" description="The case or network of this run could not be found." />

  const sel = selected
  const topology = ctx.topology
  const fileTopology = ctx.fileTopology
  // switched-off branches carry no flow and islanded nodes have no voltage (values may be null/NaN)
  const selStatus =
    sel?.kind === 'branch' && status?.branchOff.has(sel.id)
      ? `${OOS_TIP} — no flow`
      : sel?.kind === 'node' && status && !status.energised.has(sel.id)
        ? ISLANDED_TIP
        : null
  const selValue =
    selStatus ??
    (sel && snap.data
      ? sel.kind === 'node'
        ? `${fmtPu(snap.data.nodes[String(sel.id)])} pu`
        : sel.kind === 'branch'
          ? fmtPct(snap.data.branches[String(sel.id)])
          : null
      : null)

  return (
    <ExpandableNetwork title={`${ctx.case?.name ?? 'Run'} · Network`} className="grid gap-3">
      {({ expanded }) => (
        <>
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
        <DaylightTrack
          className="min-w-40 flex-1"
          startMs={timestepTime(summary, 0)}
          stepMs={summary.resolution_minutes * 60_000}
          n={n}
          source={solar}
        >
          <input
            type="range"
            aria-label="Timestep"
            min={0}
            max={Math.max(0, n - 1)}
            value={t}
            onChange={(e) => setT(Number(e.target.value))}
            className="block w-full accent-[var(--c-accent)]"
          />
        </DaylightTrack>
        <div className="w-44 text-right text-xs">
          <div className="font-medium text-fg tabular">{fmtDateTime(snap.data?.timestamp ?? toNaive(new Date(timestepTime(summary, t))))}</div>
          <div className="text-fg-muted tabular" data-testid="snapshot-step">
            step {(t + 1).toLocaleString()} / {n.toLocaleString()} {snap.isFetching && <Spinner size={10} className="inline" />}
          </div>
        </div>
        <Segmented size="sm" className="shrink-0" value={speed} onChange={setSpeed} options={SPEED_OPTIONS} />
      </div>
      {snap.error && <ErrorState error={snap.error} title="Could not load snapshot" />}
      <div
        className={cn(
          'grid gap-3',
          expanded
            ? 'min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_260px] lg:grid-rows-[minmax(0,1fr)]'
            : 'lg:grid-cols-[1fr_260px]',
        )}
      >
        <div ref={diagramRef} className={cn('min-w-0', expanded && 'h-full min-h-0')}>
          <NetworkDiagram
            topology={fileTopology}
            changed={changed}
            statusTopology={topology}
            overlay={overlay}
            overlayKey={t}
            selected={selected}
            onSelect={setSelected}
            showAppliances={false}
            height={540}
            legend={
              <div className="flex flex-wrap items-center gap-4">
                <VoltageScaleLegend theme={theme} limits={ctx.limits} />
                <GradientLegend
                  label="loading"
                  stops={[loadingColor(0, theme), loadingColor(0.6, theme), loadingColor(1, theme), loadingColor(1.2, theme)]}
                  ticks={['0%', '60%', '100%', '120%']}
                />
                <StatusLegend topology={topology} theme={theme} />
              </div>
            }
            corner={
              <SnapshotClock ms={timestepTime(summary, t)} source={solar} compact={diagramWidth > 0 && diagramWidth < CLOCK_COMPACT_PX} />
            }
          />
        </div>
        <div className={cn('rounded-md border border-border bg-surface p-3', expanded && 'max-h-48 min-h-0 overflow-auto overscroll-contain lg:max-h-none')}>
          {sel ? (
            <ElementDetails
              topology={topology}
              edits={ctx.effective}
              selected={sel}
              onSelect={setSelected}
              onClose={() => setSelected(null)}
              extra={
                selValue && (
                  <div className="mt-2 rounded-md bg-surface-2 px-2.5 py-2 text-sm" data-testid="snapshot-value">
                    <div className="text-xs text-fg-muted">{sel.kind === 'node' ? 'Voltage' : 'Loading'} at this timestep</div>
                    <div className={selStatus ? 'text-base font-semibold text-fg-2' : 'text-lg font-semibold tabular'}>{selValue}</div>
                  </div>
                )
              }
            />
          ) : (
            <div className="grid h-full min-h-32 place-items-center text-center text-xs text-fg-muted">Click a node or branch to inspect its value.</div>
          )}
        </div>
      </div>
        </>
      )}
    </ExpandableNetwork>
  )
}
