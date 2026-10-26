import { AlertTriangle, CheckCircle2, Clock, FileText, Layers, Network, Play, Save, ShieldCheck, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { useCase, useNetworks, useSaveCase, useStartRun, useValidateCase } from '../api/hooks'
import type { CaseStudy, ValidationIssue, ValidationResult } from '../api/schema'
import { Page, PageHeader } from '../components/layout/Page'
import { Badge, Button, ConfirmDialog, ErrorState, LoadingState, Tabs, useToast } from '../components/ui'
import { computeTimesteps } from '../lib/time'
import { errorMessage, stableStringify } from '../lib/utils'
import type { EditorSection } from './case-editor/defaults'
import { defaultCase, localIssues } from './case-editor/defaults'
import { NetworkSection } from './case-editor/NetworkSection'
import { OverviewSection } from './case-editor/OverviewSection'
import { ProfilesSection } from './case-editor/ProfilesSection'
import { TimeSection } from './case-editor/TimeSection'

export function CaseEditorPage() {
  const { caseId } = useParams()
  const isNew = !caseId
  const existing = useCase(caseId)
  const networks = useNetworks()
  // After creating a case we navigate to its URL but keep the same editor instance
  // (so unsaved edits / inline validation results survive).
  const [createdId, setCreatedId] = useState<string | null>(null)
  const editorKey = caseId && caseId !== createdId ? caseId : 'new'

  if (isNew) {
    if (networks.isLoading) return <LoadingState label="Preparing new case…" />
    const init = defaultCase()
    const first = networks.data?.[0]
    if (first) init.network = { source: first.source, key: first.key }
    return <CaseEditor key="new" initial={init} isNew onCreated={setCreatedId} />
  }
  if (existing.isLoading) return <LoadingState label="Loading case…" />
  if (existing.error || !existing.data)
    return (
      <Page>
        <ErrorState error={existing.error ?? 'Case not found'} title="Could not load case" onRetry={() => void existing.refetch()} />
      </Page>
    )
  return <CaseEditor key={editorKey} initial={existing.data} isNew={false} onCreated={setCreatedId} />
}

const SECTIONS: { id: EditorSection; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <FileText size={14} /> },
  { id: 'network', label: 'Network', icon: <Network size={14} /> },
  { id: 'time', label: 'Time & calculation', icon: <Clock size={14} /> },
  { id: 'profiles', label: 'Profiles', icon: <Layers size={14} /> },
]

function CaseEditor({
  initial,
  isNew,
  onCreated,
}: {
  initial: CaseStudy
  isNew: boolean
  onCreated: (id: string) => void
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as EditorSection | null
  const tab: EditorSection = SECTIONS.some((s) => s.id === tabParam) ? tabParam! : 'overview'

  const [draft, setDraft] = useState<CaseStudy>(initial)
  const [savedJson, setSavedJson] = useState(() => (isNew ? '' : stableStringify(initial)))
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [runIssues, setRunIssues] = useState<ValidationIssue[] | null>(null)
  const bypassBlock = useRef(false)

  const save = useSaveCase()
  const validate = useValidateCase()
  const startRun = useStartRun()

  const dirty = useMemo(() => stableStringify(draft) !== savedJson, [draft, savedJson])
  const local = useMemo(() => localIssues(draft), [draft])
  const nSteps = computeTimesteps(draft.time)
  const busy = save.isPending || validate.isPending || startRun.isPending

  // unsaved-changes guard
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !bypassBlock.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const onChange = (c: CaseStudy) => {
    setDraft(c)
    setValidation(null)
    setRunIssues(null)
  }

  /** Save if needed; returns the saved case (or current when clean). */
  async function ensureSaved(): Promise<CaseStudy | null> {
    if (!dirty && draft.id) return draft
    try {
      const saved = await save.mutateAsync(draft)
      setDraft(saved)
      setSavedJson(stableStringify(saved))
      if (isNew && saved.id) {
        onCreated(saved.id)
        bypassBlock.current = true
        navigate(`/cases/${encodeURIComponent(saved.id)}${tab !== 'overview' ? `?tab=${tab}` : ''}`, { replace: true })
        // re-arm the unsaved-changes guard once the URL change has been processed
        setTimeout(() => {
          bypassBlock.current = false
        }, 0)
      }
      return saved
    } catch (e) {
      // 422 from model validation (e.g. end <= start) carries no `issues`: show its message in the panel.
      if (e instanceof ApiError && (e.issues.length || e.status === 422))
        setValidation({ ok: false, n_timesteps: nSteps, issues: e.issues.length ? e.issues : [{ level: 'error', message: errorMessage(e) }] })
      toast.error('Save failed', errorMessage(e))
      return null
    }
  }

  const onSave = async () => {
    const saved = await ensureSaved()
    if (saved) toast.success('Case saved', saved.name)
  }

  const onValidate = async () => {
    const saved = await ensureSaved()
    if (!saved?.id) return
    try {
      const r = await validate.mutateAsync(saved.id)
      setValidation(r)
      setRunIssues(null)
      if (r.ok) toast.success('Case is valid', `${r.n_timesteps.toLocaleString()} timesteps`)
    } catch (e) {
      toast.error('Validation failed', errorMessage(e))
    }
  }

  const onRun = async () => {
    const saved = await ensureSaved()
    if (!saved?.id) return
    try {
      const run = await startRun.mutateAsync(saved.id)
      bypassBlock.current = true
      navigate(`/runs/${encodeURIComponent(run.id)}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        setRunIssues(e.issues.length ? e.issues : [{ level: 'error', message: errorMessage(e) }])
        toast.error('Case is not valid', 'Fix the issues listed above and try again.')
      } else {
        toast.error('Could not start run', errorMessage(e))
      }
    }
  }

  const issueCount = (s: EditorSection) => local.filter((i) => i.section === s).length
  const shownIssues = runIssues ?? validation?.issues ?? null

  return (
    <Page wide>
      <PageHeader
        breadcrumb={
          <>
            <Link to="/" className="hover:text-fg">
              Cases
            </Link>{' '}
            / {isNew ? 'new' : draft.id}
          </>
        }
        title={
          <span className="inline-flex items-center gap-3">
            {draft.name || 'Untitled case'}
            {isNew && !draft.id ? (
              <Badge tone="warn">Not saved</Badge>
            ) : dirty ? (
              <Badge tone="warn" icon={<span className="size-1.5 rounded-full bg-warn" />}>
                Unsaved changes
              </Badge>
            ) : (
              <Badge tone="good" icon={<CheckCircle2 size={12} />}>
                Saved
              </Badge>
            )}
          </span>
        }
        subtitle={
          <>
            {draft.network.key || 'no network'} · {nSteps.toLocaleString()} timesteps · {draft.profile_assignments.length} profile
            {draft.profile_assignments.length === 1 ? '' : 's'}
          </>
        }
        actions={
          <>
            <Button icon={<ShieldCheck size={15} />} onClick={onValidate} loading={validate.isPending} disabled={busy}>
              Validate
            </Button>
            <Button icon={<Save size={15} />} onClick={onSave} loading={save.isPending} disabled={busy || (!dirty && !!draft.id)}>
              Save
            </Button>
            <Button
              variant="primary"
              icon={<Play size={15} />}
              onClick={onRun}
              loading={startRun.isPending}
              disabled={busy || local.some((i) => i.section === 'network' || i.section === 'time')}
              title={dirty ? 'Saves the case, then starts a run' : 'Start a run'}
            >
              {dirty ? 'Save & run' : 'Run'}
            </Button>
          </>
        }
      />

      {shownIssues && (
        <IssuesPanel
          ok={runIssues ? false : !!validation?.ok}
          nSteps={validation?.n_timesteps}
          issues={shownIssues}
          onClose={() => {
            setValidation(null)
            setRunIssues(null)
          }}
        />
      )}
      {!shownIssues && local.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-fg-2">
          <AlertTriangle size={14} className="text-warn" />
          {local.map((i, k) => (
            <button key={k} className="hover:underline" onClick={() => setParams({ tab: i.section }, { replace: true })}>
              {i.message}
            </button>
          ))}
        </div>
      )}

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })}
        items={SECTIONS.map((s) => ({
          ...s,
          badge: issueCount(s.id) ? <span className="ml-0.5 size-1.5 rounded-full bg-warn" /> : undefined,
        }))}
      />

      {tab === 'overview' && <OverviewSection draft={draft} onChange={onChange} />}
      {tab === 'network' && <NetworkSection draft={draft} onChange={onChange} />}
      {tab === 'time' && <TimeSection draft={draft} onChange={onChange} />}
      {tab === 'profiles' && <ProfilesSection draft={draft} onChange={onChange} />}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Discard unsaved changes?"
        message="You have unsaved changes to this case. Leave the page and discard them?"
        confirmLabel="Discard changes"
        danger
        onCancel={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
      />
    </Page>
  )
}

function IssuesPanel({
  ok,
  issues,
  nSteps,
  onClose,
}: {
  ok: boolean
  issues: ValidationIssue[]
  nSteps?: number
  onClose: () => void
}) {
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level !== 'error')
  return (
    <div
      data-testid="validation-panel"
      data-ok={ok}
      className={`mb-4 rounded-lg border px-4 py-3 ${ok ? 'border-good/30 bg-good-soft' : 'border-bad/30 bg-bad-soft'}`}
      role={ok ? 'status' : 'alert'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {ok ? <CheckCircle2 size={16} className="text-good" /> : <AlertTriangle size={16} className="text-bad" />}
          <span className={ok ? 'text-good' : 'text-bad'}>
            {ok ? 'Case is valid' : `${errors.length} error${errors.length === 1 ? '' : 's'}`}
          </span>
          {warnings.length > 0 && <Badge tone="warn">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</Badge>}
          {nSteps !== undefined && ok && <span className="font-normal text-fg-muted">· {nSteps.toLocaleString()} timesteps</span>}
        </div>
        <button className="text-fg-muted hover:text-fg" onClick={onClose} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
      {issues.length > 0 && (
        <ul className="mt-2 grid gap-1 text-sm">
          {[...errors, ...warnings].map((i, k) => (
            <li key={k} className="flex items-start gap-2">
              <Badge tone={i.level === 'error' ? 'bad' : 'warn'} className="mt-px">
                {i.level}
              </Badge>
              <span className="text-fg-2">{i.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
