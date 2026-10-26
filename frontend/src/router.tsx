import { createBrowserRouter } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { LoadingState } from './components/ui'
import { CasesPage } from './pages/CasesPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RunsPage } from './pages/RunsPage'

// Heavy pages (ECharts, Cytoscape) are code-split.
const caseEditor = () => import('./pages/CaseEditorPage').then((m) => ({ Component: m.CaseEditorPage }))
const runPage = () => import('./pages/RunPage').then((m) => ({ Component: m.RunPage }))
const runResultsPage = () =>
  import('./pages/RunPage').then((m) => ({ Component: () => <m.RunPage tab="results" /> }))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    hydrateFallbackElement: <LoadingState />,
    children: [
      { index: true, element: <CasesPage /> },
      { path: 'cases/new', lazy: caseEditor },
      { path: 'cases/:caseId', lazy: caseEditor },
      { path: 'runs', element: <RunsPage /> },
      { path: 'runs/:runId', lazy: runPage },
      { path: 'runs/:runId/results', lazy: runResultsPage },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
