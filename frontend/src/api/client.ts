/**
 * Thin fetch wrapper for the GridSim API. ALL HTTP calls live here; components
 * use the react-query hooks in ./hooks.ts.
 */
import type {
  CaseStudy,
  CaseSummary,
  EnvelopeResponse,
  Health,
  HeatmapResponse,
  NetworkItem,
  NetworkTopology,
  ProfileGeneratorInfo,
  ProfilePreviewRequest,
  ProfilePreviewResponse,
  ProfileUploadResponse,
  ResultComponent,
  ResultSummary,
  RunInfo,
  SnapshotResponse,
  TimeseriesQuery,
  TimeseriesResponse,
  ValidationIssue,
  ValidationResult,
} from './schema'

export const API_BASE = '/api'

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown
  /** Validation issues, when the server returned them (e.g. 422 on run creation). */
  readonly issues: ValidationIssue[]

  constructor(status: number, detail: unknown, issues: ValidationIssue[] = []) {
    super(formatDetail(detail) || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.issues = issues
  }
}

function formatDetail(detail: unknown): string {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc, msg, type}]
    return detail
      .map((d) => {
        if (d && typeof d === 'object' && 'msg' in d) {
          const loc = 'loc' in d && Array.isArray(d.loc) ? d.loc.join('.') : ''
          return loc ? `${loc}: ${String(d.msg)}` : String(d.msg)
        }
        if (d && typeof d === 'object' && 'message' in d) return String(d.message)
        return JSON.stringify(d)
      })
      .join('; ')
  }
  if (typeof detail === 'object') {
    if ('message' in detail) return String((detail as { message: unknown }).message)
    return JSON.stringify(detail)
  }
  return String(detail)
}

/** Extract validation issues from the various shapes a 422 body might take. */
function extractIssues(body: unknown): ValidationIssue[] {
  const isIssue = (x: unknown): x is ValidationIssue =>
    !!x && typeof x === 'object' && 'level' in x && 'message' in x
  if (!body || typeof body !== 'object') return []
  const b = body as Record<string, unknown>
  if (Array.isArray(b.issues)) return b.issues.filter(isIssue)
  const d = b.detail
  if (Array.isArray(d)) return d.filter(isIssue)
  if (d && typeof d === 'object') {
    const dd = d as Record<string, unknown>
    if (Array.isArray(dd.issues)) return dd.issues.filter(isIssue)
  }
  return []
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Accept', 'application/json')
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch (e) {
    throw new ApiError(0, `Network error: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let body: unknown = undefined
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? (body as { detail: unknown }).detail
        : body || res.statusText
    throw new ApiError(res.status, detail, extractIssues(body))
  }
  return body as T
}

const json = (data: unknown): RequestInit['body'] => JSON.stringify(data)

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

const enc = encodeURIComponent

export const api = {
  // meta
  health: () => request<Health>('/health'),

  // networks
  listNetworks: () => request<NetworkItem[]>('/networks'),
  getNetwork: (source: string, key: string) =>
    request<NetworkTopology>(`/networks/${enc(source)}/${enc(key)}`),
  uploadNetwork: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return request<NetworkItem>('/networks/upload', { method: 'POST', body: fd })
  },

  // profiles
  listProfileGenerators: () => request<ProfileGeneratorInfo[]>('/profile-generators'),
  previewProfile: (body: ProfilePreviewRequest, signal?: AbortSignal) =>
    request<ProfilePreviewResponse>('/profiles/preview', { method: 'POST', body: json(body), signal }),
  uploadProfileCsv: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return request<ProfileUploadResponse>('/profiles/upload', { method: 'POST', body: fd })
  },

  // cases
  listCases: () => request<CaseSummary[]>('/cases'),
  getCase: (id: string) => request<CaseStudy>(`/cases/${enc(id)}`),
  createCase: (body: CaseStudy) => request<CaseStudy>('/cases', { method: 'POST', body: json(body) }),
  updateCase: (id: string, body: CaseStudy) =>
    request<CaseStudy>(`/cases/${enc(id)}`, { method: 'PUT', body: json(body) }),
  deleteCase: (id: string) => request<void>(`/cases/${enc(id)}`, { method: 'DELETE' }),
  validateCase: (id: string) =>
    request<ValidationResult>(`/cases/${enc(id)}/validate`, { method: 'POST' }),

  // runs
  startRun: (caseId: string) => request<RunInfo>(`/cases/${enc(caseId)}/runs`, { method: 'POST' }),
  listRuns: (caseId?: string) => request<RunInfo[]>(`/runs${qs({ case_id: caseId })}`),
  getRun: (runId: string) => request<RunInfo>(`/runs/${enc(runId)}`),
  cancelRun: (runId: string) => request<RunInfo>(`/runs/${enc(runId)}/cancel`, { method: 'POST' }),
  deleteRun: (runId: string) => request<void>(`/runs/${enc(runId)}`, { method: 'DELETE' }),
  runEventsUrl: (runId: string) => `${API_BASE}/runs/${enc(runId)}/events`,

  // results
  getSummary: (runId: string) => request<ResultSummary>(`/runs/${enc(runId)}/summary`),
  getTimeseries: (runId: string, q: TimeseriesQuery) =>
    request<TimeseriesResponse>(
      `/runs/${enc(runId)}/timeseries${qs({ component: q.component, field: q.field, ids: q.ids.join(',') })}`,
    ),
  getEnvelope: (runId: string, component: ResultComponent, field: string) =>
    request<EnvelopeResponse>(`/runs/${enc(runId)}/envelope${qs({ component, field })}`),
  getHeatmap: (runId: string, component: ResultComponent, field: string, maxColumns = 500) =>
    request<HeatmapResponse>(
      `/runs/${enc(runId)}/heatmap${qs({ component, field, max_columns: maxColumns })}`,
    ),
  getSnapshot: (runId: string, t: number) =>
    request<SnapshotResponse>(`/runs/${enc(runId)}/snapshot${qs({ t })}`),
}

export type Api = typeof api
