/**
 * Result view registry. The results page renders exactly these views, in this order.
 * To add a view: create `<Name>View.tsx` in this folder and append one entry below.
 * See README.md.
 */
import type { ResultViewDefinition } from '../types'
import { ElementTimeseriesView } from './ElementTimeseriesView'
import { LoadingHeatmapView } from './LoadingHeatmapView'
import { NetworkSnapshotView } from './NetworkSnapshotView'
import { ViolationsView } from './ViolationsView'
import { VoltageEnvelopeView } from './VoltageEnvelopeView'

export type { ResultViewDefinition, ResultViewProps } from '../types'

export const RESULT_VIEWS: ResultViewDefinition[] = [
  {
    id: 'voltage-envelope',
    title: 'Voltage envelope',
    description: 'Spread of node voltages (min / p05 / mean / p95 / max) over time, against the case limits.',
    component: VoltageEnvelopeView,
  },
  {
    id: 'timeseries',
    title: 'Element time series',
    description: 'Plot any result field for selected nodes, branches, sources or appliances.',
    component: ElementTimeseriesView,
  },
  {
    id: 'loading-heatmap',
    title: 'Loading heatmap',
    description: 'Branch loading per element and time bucket, worst branches first.',
    component: LoadingHeatmapView,
  },
  {
    id: 'violations',
    title: 'Violations',
    description: 'Limit violation episodes and per-element extremes.',
    component: ViolationsView,
  },
  {
    id: 'snapshot',
    title: 'Network snapshot',
    description: 'The network coloured by voltage and loading at one timestep, with playback.',
    component: NetworkSnapshotView,
  },
]
