import type React from 'react'
import type { ResultSummary } from '../api/schema'

/** Props every result view receives. Views fetch any further data themselves via api/hooks. */
export interface ResultViewProps {
  runId: string
  summary: ResultSummary
}

/** A pluggable panel on the results page. Register it in ./views/index.ts. */
export interface ResultViewDefinition {
  id: string
  title: string
  description?: string
  component: React.ComponentType<ResultViewProps>
}
