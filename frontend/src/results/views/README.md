# Result views

The results page (`src/results/ResultsPanel.tsx`) renders the views listed in
`RESULT_VIEWS` (`./index.ts`) as a tab strip, in list order. Nothing else needs to
know about a view, so adding one is **one new file + one line**.

## Contract

```ts
// src/results/types.ts
interface ResultViewProps { runId: string; summary: ResultSummary }
interface ResultViewDefinition {
  id: string            // stable, URL-safe (used in ?view=<id>)
  title: string         // tab label
  description?: string  // shown under the tab strip
  component: React.ComponentType<ResultViewProps>
}
```

A view only receives the run id and the already-loaded `ResultSummary`; it fetches
anything else itself through the react-query hooks in `src/api/hooks.ts`
(`useTimeseries`, `useEnvelope`, `useHeatmap`, `useSnapshot`, ...). Views are only
mounted for **succeeded** runs.

## Adding a view

1. Create `src/results/views/MyThingView.tsx`:

   ```tsx
   import { useTimeseries } from '../../api/hooks'
   import { ErrorState } from '../../components/ui'
   import { TimeseriesChart } from '../TimeseriesChart'
   import type { ResultViewProps } from '../types'

   export function MyThingView({ runId, summary }: ResultViewProps) {
     const ids = summary.branches.slice(0, 3).map((b) => b.id)
     const q = useTimeseries(runId, { component: 'branch', field: 'p_from', ids })
     if (q.error) return <ErrorState error={q.error} />
     return <TimeseriesChart data={q.data} loading={q.isLoading} />
   }
   ```

2. Register it in `index.ts`:

   ```ts
   { id: 'my-thing', title: 'My thing', description: '…', component: MyThingView },
   ```

3. `npm run build && npm run lint`.

## Building blocks

- `../TimeseriesChart.tsx`: multi-line time chart with dataZoom and limit lines (y-axis widened to keep limits visible).
- `../limitLines.ts`: `voltageLimitLines` / `loadingLimitLines` (labelled "u_min 0.90", "limit 100%") and `axisRangeWithLimits` for any chart that draws limits.
- `../useRunContext.ts`: run → case → `limits` (defaults 0.95/1.05/1.0) and the network `topology` with the frozen case's overrides applied (`fileTopology` = unchanged file, `effective` = which values were edited).
- `../timestamps.ts`: timestep index ↔ time helpers.
- `../../components/charts/`: `EChart` wrapper + `useChartTheme()` / `baseOption()` etc. so
  charts follow the light/dark design tokens.
- `../../components/network/`: `NetworkDiagram` (Cytoscape) with colour `overlay`s, legends,
  `ElementDetails`.
- `../../lib/format.ts`: `fmtPu` (3 decimals), `fmtPct` (loading), `fmtMwh`, `fmtPowerW`, `fmtDateTime`.

If a view needs data the API does not offer yet, add a backend results endpoint first
(see `docs/api-contract.md`), then a client function in `src/api/client.ts`, a hook in
`src/api/hooks.ts` and its types in `src/api/schema.ts`.
