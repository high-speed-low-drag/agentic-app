import type { ReactNode } from 'react'
import { useMemo } from 'react'
import type { JsonSchema } from '../api/schema'
import type { FieldSpec } from '../lib/jsonSchema'
import { fieldsFromSchema, validateField } from '../lib/jsonSchema'
import { Checkbox, Field, NumberInput, Select, TextInput } from './ui'

export interface SchemaFormProps {
  schema: JsonSchema
  value: Record<string, unknown>
  onChange: (v: Record<string, unknown>) => void
  /** Override rendering of specific fields (return undefined to fall back to default). */
  renderField?: (f: FieldSpec, value: unknown, set: (v: unknown) => void) => ReactNode | undefined
  /** Field names to hide. */
  hidden?: string[]
  className?: string
}

/** Form generated from a JSON Schema object (number/integer/string/boolean/enum). */
export function SchemaForm({ schema, value, onChange, renderField, hidden, className }: SchemaFormProps) {
  const fields = useMemo(() => fieldsFromSchema(schema), [schema])
  const visible = fields.filter((f) => !hidden?.includes(f.name))
  if (visible.length === 0) {
    return <div className="text-xs text-fg-muted">This generator has no parameters.</div>
  }
  return (
    <div className={className ?? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'}>
      {visible.map((f) => {
        const v = value[f.name] ?? undefined
        const set = (nv: unknown) => {
          const next = { ...value }
          if (nv === undefined) delete next[f.name]
          else next[f.name] = nv
          onChange(next)
        }
        const custom = renderField?.(f, v, set)
        if (custom !== undefined) return <div key={f.name}>{custom}</div>
        return <SchemaField key={f.name} field={f} value={v} onChange={set} />
      })}
    </div>
  )
}

function rangeHint(f: FieldSpec): string | undefined {
  const lo = f.minimum ?? f.exclusiveMinimum
  const hi = f.maximum ?? f.exclusiveMaximum
  if (lo === undefined && hi === undefined) return undefined
  if (lo !== undefined && hi !== undefined) return `${lo} … ${hi}`
  return lo !== undefined ? `≥ ${lo}` : `≤ ${hi}`
}

export function SchemaField({ field: f, value, onChange }: { field: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const effective = value === undefined ? f.default : value
  const err = validateField(f, effective)
  const range = rangeHint(f)
  const hint = [f.description, range && `Range ${range}`].filter(Boolean).join(' · ') || undefined

  if (f.kind === 'boolean') {
    return (
      <div className="flex flex-col justify-end gap-1 pb-1.5" title={f.description}>
        <Checkbox checked={Boolean(effective)} onChange={onChange} label={f.title} />
        {f.description && <div className="text-xs text-fg-muted">{f.description}</div>}
      </div>
    )
  }

  return (
    <Field label={f.title} hint={hint} error={err} required={f.required && f.default === undefined}>
      {(id) => {
        switch (f.kind) {
          case 'number':
          case 'integer':
            return (
              <NumberInput
                id={id}
                value={typeof effective === 'number' ? effective : null}
                onChange={(n) => onChange(n === null ? (f.nullable ? null : undefined) : n)}
                integer={f.kind === 'integer'}
                nullable
                min={f.minimum}
                max={f.maximum}
                placeholder={f.nullable ? 'none' : undefined}
              />
            )
          case 'enum': {
            const opts = f.options ?? []
            const cur = opts.find((o) => o.raw === effective)?.value ?? ''
            return (
              <Select
                id={id}
                value={cur}
                options={[...(f.nullable ? [{ value: '__null__', label: '—' }] : []), ...opts.map((o) => ({ value: o.value, label: o.label }))]}
                placeholder={cur ? undefined : 'Select…'}
                onChange={(s) => onChange(s === '__null__' ? null : opts.find((o) => o.value === s)?.raw)}
              />
            )
          }
          case 'string':
            return (
              <TextInput
                id={id}
                value={typeof effective === 'string' ? effective : ''}
                onChange={(e) => onChange(e.target.value === '' && f.nullable ? null : e.target.value)}
                placeholder={f.nullable ? 'none' : undefined}
              />
            )
          default:
            return (
              <TextInput
                id={id}
                defaultValue={effective === undefined ? '' : JSON.stringify(effective)}
                onBlur={(e) => {
                  try {
                    onChange(JSON.parse(e.target.value))
                  } catch {
                    /* keep last valid */
                  }
                }}
                placeholder="JSON value"
              />
            )
        }
      }}
    </Field>
  )
}
