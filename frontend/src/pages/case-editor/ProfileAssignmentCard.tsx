import { ArrowDown, ArrowUp, FileSpreadsheet, Trash2, Upload } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { useUploadProfileCsv } from '../../api/hooks'
import type {
  NetworkTopology,
  ProfileAssignment,
  ProfileGeneratorInfo,
  ProfileTargetComponent,
  ProfileUploadResponse,
  TimeSettings,
} from '../../api/schema'
import { PROFILE_TARGET_COMPONENTS } from '../../api/schema'
import { SchemaField, SchemaForm } from '../../components/SchemaForm'
import { Badge, Button, Card, Field, IconButton, MultiSelect, NumberInput, Segmented, Select, TextInput, useToast } from '../../components/ui'
import { fmtDateTime, fmtPowerW } from '../../lib/format'
import { errorMessage } from '../../lib/utils'
import { ProfilePreview } from './ProfilePreview'
import { defaultMagnitude, isCsvGenerator, withGenerator } from './profileUtils'

const COMPONENT_LABEL: Record<ProfileTargetComponent, string> = { sym_load: 'Symmetric loads', sym_gen: 'Symmetric generators' }

export function ProfileAssignmentCard({
  index,
  count,
  assignment: a,
  generators,
  topology,
  time,
  csvFiles,
  onCsvUploaded,
  onChange,
  onMove,
  onRemove,
}: {
  index: number
  count: number
  assignment: ProfileAssignment
  generators: ProfileGeneratorInfo[]
  topology?: NetworkTopology
  time: TimeSettings
  csvFiles: Record<string, ProfileUploadResponse>
  onCsvUploaded: (r: ProfileUploadResponse) => void
  onChange: (a: ProfileAssignment) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const gen = generators.find((g) => g.key === a.generator)
  const csv = isCsvGenerator(gen)
  const upload = useUploadProfileCsv()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const components = gen?.applies_to?.length ? gen.applies_to : PROFILE_TARGET_COMPONENTS
  const candidates = useMemo(
    () =>
      (topology?.appliances ?? [])
        .filter((x) => x.type === a.target.component)
        .map((x) => ({ value: x.id, label: x.name, hint: fmtPowerW(x.p_specified) })),
    [topology, a.target.component],
  )
  const fileInfo = typeof a.params.file_id === 'string' ? csvFiles[a.params.file_id] : undefined
  const nTargets = a.target.ids === null ? candidates.length : a.target.ids.length

  const onCsv = (f?: File) => {
    if (!f) return
    upload.mutate(f, {
      onSuccess: (r) => {
        onCsvUploaded(r)
        onChange({ ...a, params: { ...a.params, file_id: r.file_id, column: r.columns[0] ?? '' } })
        toast.success('CSV uploaded', `${r.filename}: ${r.columns.length} columns, ${r.n_rows.toLocaleString()} rows`)
      },
      onError: (e) => toast.error('CSV upload failed', errorMessage(e)),
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="grid size-6 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-fg-2 tabular">{index + 1}</span>
        <TextInput
          aria-label="Assignment label"
          className="h-8 max-w-xs flex-1 font-medium"
          value={a.label}
          onChange={(e) => onChange({ ...a, label: e.target.value })}
        />
        <Badge tone={a.mode === 'add' ? 'warn' : 'accent'}>{a.mode}</Badge>
        <Badge>
          {nTargets} {a.target.component}
        </Badge>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton size="sm" label="Move up" icon={<ArrowUp size={14} />} disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton size="sm" label="Move down" icon={<ArrowDown size={14} />} disabled={index === count - 1} onClick={() => onMove(1)} />
          <IconButton size="sm" label="Remove assignment" icon={<Trash2 size={14} />} onClick={onRemove} />
        </div>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Field label="Generator" hint={gen?.description ?? undefined}>
            {(id) => (
              <Select
                id={id}
                value={a.generator}
                placeholder="Select a generator…"
                options={generators.map((g) => ({ value: g.key, label: g.name }))}
                onChange={(k) => {
                  const g = generators.find((x) => x.key === k)
                  if (g) onChange(withGenerator(a, g))
                }}
              />
            )}
          </Field>

          {gen && csv && (
            <div className="rounded-md border border-dashed border-border-strong p-3">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onCsv(e.target.files?.[0])} />
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" icon={<Upload size={13} />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                  Upload CSV
                </Button>
                <div className="min-w-0 text-xs text-fg-muted">
                  {fileInfo ? (
                    <span className="inline-flex items-center gap-1.5">
                      <FileSpreadsheet size={13} />
                      <b className="text-fg-2">{fileInfo.filename}</b> · {fileInfo.n_rows.toLocaleString()} rows · {fmtDateTime(fileInfo.start)} – {fmtDateTime(fileInfo.end)}
                    </span>
                  ) : typeof a.params.file_id === 'string' && a.params.file_id ? (
                    <>
                      File <span className="font-mono">{a.params.file_id}</span>
                    </>
                  ) : (
                    'First column must be a timestamp; other columns are multiplier series.'
                  )}
                </div>
              </div>
            </div>
          )}

          {gen && (
            <SchemaForm
              schema={gen.params_schema}
              value={a.params}
              onChange={(params) => onChange({ ...a, params })}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2"
              hidden={csv ? ['file_id'] : undefined}
              renderField={(f, v, set) => {
                if (csv && f.name === 'column' && fileInfo) {
                  return (
                    <Field label={f.title} hint="Column of the uploaded CSV to use">
                      {(id) => (
                        <Select id={id} value={typeof v === 'string' ? v : ''} placeholder="Pick a column…" options={fileInfo.columns.map((c) => ({ value: c, label: c }))} onChange={set} />
                      )}
                    </Field>
                  )
                }
                if (csv && f.name === 'column') return <SchemaField field={f} value={v} onChange={set} />
                return undefined
              }}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Target component">
              {(id) => (
                <Select<ProfileTargetComponent>
                  id={id}
                  value={a.target.component}
                  options={components.map((c) => ({ value: c, label: COMPONENT_LABEL[c] ?? c }))}
                  onChange={(c) => onChange({ ...a, target: { component: c, ids: null } })}
                />
              )}
            </Field>
            <Field label="Mode" hint={a.mode === 'scale' ? 'p(t) = p_base · m(t)' : 'p(t) += magnitude · m(t)'}>
              <Segmented
                value={a.mode}
                onChange={(m) => onChange({ ...a, mode: m, magnitude_w: m === 'add' ? (a.magnitude_w ?? defaultMagnitude(a.generator)) : null })}
                options={[
                  { value: 'scale', label: 'Scale' },
                  { value: 'add', label: 'Add' },
                ]}
              />
            </Field>
            {a.mode === 'add' && (
              <Field
                label="Magnitude"
                className="sm:col-span-2"
                hint={`${fmtPowerW(a.magnitude_w)} per element at m = 1. Negative = behind-the-meter generation (e.g. rooftop PV).`}
              >
                {(id) => <NumberInput id={id} unit="W" nullable value={a.magnitude_w} onChange={(v) => onChange({ ...a, magnitude_w: v })} />}
              </Field>
            )}
          </div>

          <div className="grid gap-2">
            <Segmented
              size="sm"
              value={a.target.ids === null ? 'all' : 'selected'}
              onChange={(v) => onChange({ ...a, target: { ...a.target, ids: v === 'all' ? null : (a.target.ids ?? candidates.map((c) => c.value)) } })}
              options={[
                { value: 'all', label: `All ${a.target.component} (${candidates.length})` },
                { value: 'selected', label: 'Selected elements' },
              ]}
            />
            {a.target.ids !== null &&
              (topology ? (
                <MultiSelect options={candidates} value={a.target.ids} onChange={(ids) => onChange({ ...a, target: { ...a.target, ids } })} />
              ) : (
                <div className="text-xs text-fg-muted">Select a network to choose elements.</div>
              ))}
          </div>
        </div>
        <div className="min-w-0">
          <ProfilePreview generator={a.generator} params={a.params} time={time} enabled={!csv || !!a.params.file_id} />
        </div>
      </div>
    </Card>
  )
}
