import type { CaseStudy } from '../../api/schema'
import { addDays, computeTimesteps, MAX_TIMESTEPS, toNaive } from '../../lib/time'

export function defaultCase(): CaseStudy {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return {
    name: 'New case',
    description: '',
    study_type: 'timeseries_powerflow',
    network: { source: '', key: '' },
    time: { start: toNaive(start), end: toNaive(addDays(start, 7)), resolution_minutes: 15 },
    calculation: { method: 'newton_raphson', error_tolerance: 1e-8, max_iterations: 20 },
    limits: { u_min_pu: 0.95, u_max_pu: 1.05, loading_max: 1.0 },
    profile_assignments: [],
    network_overrides: [],
  }
}

export type EditorSection = 'overview' | 'network' | 'time' | 'profiles'

export interface LocalIssue {
  section: EditorSection
  message: string
}

/** Client-side checks that mirror the obvious server rules (fast feedback before Save). */
export function localIssues(c: CaseStudy): LocalIssue[] {
  const out: LocalIssue[] = []
  if (!c.name.trim()) out.push({ section: 'overview', message: 'Name is required.' })
  if (!c.network.source || !c.network.key) out.push({ section: 'network', message: 'Select a network.' })
  const r = c.time.resolution_minutes
  if (!Number.isInteger(r) || r < 1 || r > 1440) out.push({ section: 'time', message: 'Resolution must be an integer between 1 and 1440 minutes.' })
  const n = computeTimesteps(c.time)
  if (n <= 0) out.push({ section: 'time', message: 'End must be after start.' })
  if (n > MAX_TIMESTEPS) out.push({ section: 'time', message: `Too many timesteps (${n.toLocaleString()} > ${MAX_TIMESTEPS.toLocaleString()}).` })
  if (c.limits.u_min_pu >= c.limits.u_max_pu) out.push({ section: 'time', message: 'u_min must be below u_max.' })
  c.profile_assignments.forEach((a, i) => {
    if (!a.generator) out.push({ section: 'profiles', message: `Profile #${i + 1}: select a generator.` })
    if (a.target.ids && a.target.ids.length === 0) out.push({ section: 'profiles', message: `Profile #${i + 1}: no target elements selected.` })
    if (a.mode === 'add' && (a.magnitude_w === null || !Number.isFinite(a.magnitude_w)))
      out.push({ section: 'profiles', message: `Profile #${i + 1}: magnitude is required in add mode.` })
  })
  return out
}
