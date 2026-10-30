import { useMemo, useState } from 'react'
import type { AddableComponent, AddableComponentSpec, AddableField, NetworkAddition, NetworkTopology } from '../../api/schema'
import { Button, Field, Modal, NumberInput, Select, TextInput } from '../ui'
import type { AdditionSeed, AddValues } from './additions'
import { buildAddition, defaultName, initialValues, nextId, nodeOptionLabel, validateAddition } from './additions'

/**
 * Searchable node selector (a text input with suggestions). Accepts an option label, a unique node
 * name or a node id; anything else is reported as "Unknown node" by the form.
 */
function NodePicker({
  id,
  nodes,
  value,
  onChange,
  invalid,
}: {
  id: string
  nodes: NetworkTopology['nodes']
  value: number | null
  onChange: (v: number | null) => void
  invalid: boolean
}) {
  const current = nodes.find((n) => n.id === value)
  const [text, setText] = useState(current ? nodeOptionLabel(current) : '')
  const listId = `${id}-nodes`
  const resolve = (s: string): number | null => {
    const t = s.trim()
    if (!t) return null
    const byLabel = nodes.find((n) => nodeOptionLabel(n) === t)
    if (byLabel) return byLabel.id
    const byName = nodes.filter((n) => n.name === t)
    if (byName.length === 1) return byName[0].id
    if (/^\d+$/.test(t) && nodes.some((n) => n.id === Number(t))) return Number(t)
    return NaN
  }
  return (
    <>
      <TextInput
        id={id}
        list={listId}
        value={text}
        autoComplete="off"
        placeholder="Search node name or id…"
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setText(e.target.value)
          onChange(resolve(e.target.value))
        }}
      />
      <datalist id={listId}>
        {nodes.map((n) => (
          <option key={n.id} value={nodeOptionLabel(n)} />
        ))}
      </datalist>
    </>
  )
}

function ValueInput({ id, field, value, onChange, invalid }: { id: string; field: AddableField; value: number | null; onChange: (v: number | null) => void; invalid: boolean }) {
  // shown in the display unit, stored in SI
  const display = value == null ? null : Number((value * field.scale).toPrecision(12))
  return (
    <NumberInput
      id={id}
      value={display}
      nullable
      unit={field.unit || undefined}
      integer={field.kind === 'int'}
      aria-invalid={invalid || undefined}
      onChange={(d) => onChange(d == null ? null : field.kind === 'int' ? d : Number((d / field.scale).toPrecision(12)))}
    />
  )
}

/**
 * Form to add one element to a case's network. Reusable: `seed` may prefill the component, node
 * references, attributes and a diagram position (T32 opens it from diagram clicks).
 * `topology` is the file topology with the case's existing additions applied.
 */
export function AddElementDialog({
  open,
  onClose,
  specs,
  topology,
  additions,
  seed,
  onSave,
}: {
  open: boolean
  onClose: () => void
  /** the addable components to offer (e.g. the ones of one table tab) */
  specs: AddableComponentSpec[]
  topology: NetworkTopology
  additions: NetworkAddition[]
  seed?: AdditionSeed
  onSave: (a: NetworkAddition) => void
}) {
  if (!open || specs.length === 0) return null
  return <AddElementForm onClose={onClose} specs={specs} topology={topology} additions={additions} seed={seed} onSave={onSave} />
}

function AddElementForm({
  onClose,
  specs,
  topology,
  additions,
  seed,
  onSave,
}: {
  onClose: () => void
  specs: AddableComponentSpec[]
  topology: NetworkTopology
  additions: NetworkAddition[]
  seed?: AdditionSeed
  onSave: (a: NetworkAddition) => void
}) {
  const first = specs.find((s) => s.component === seed?.component) ?? specs[0]
  const [component, setComponent] = useState<AddableComponent>(first.component)
  const spec = specs.find((s) => s.component === component) ?? first
  const [name, setName] = useState(seed?.name ?? defaultName(first, topology))
  const [nameTouched, setNameTouched] = useState(!!seed?.name)
  const [values, setValues] = useState<AddValues>(() => initialValues(first, topology, seed))
  const [submitted, setSubmitted] = useState(false)
  const nodeIds = useMemo(() => new Set(topology.nodes.map((n) => n.id)), [topology])
  const errors = validateAddition(spec, name, values, nodeIds)
  const ok = Object.keys(errors).length === 0
  const kindLabel = spec.kind === 'node' ? 'node' : spec.kind === 'branch' ? 'branch' : 'appliance'

  const switchComponent = (c: AddableComponent) => {
    const next = specs.find((s) => s.component === c)
    if (!next) return
    setComponent(c)
    // keep shared node references, take the new type's defaults for the rest
    const keep = Object.fromEntries(Object.entries(values).filter(([k, v]) => v != null && next.fields.some((f) => f.field === k && f.kind === 'node')))
    setValues(initialValues(next, topology, { ...seed, attrs: { ...seed?.attrs, ...(keep as Record<string, number>) } }))
    if (!nameTouched) setName(defaultName(next, topology))
  }

  const save = () => {
    setSubmitted(true)
    if (!ok) return
    onSave(buildAddition(spec, nextId(topology, additions), name, values, seed?.position))
  }
  const show = (k: string) => (submitted || values[k] != null ? errors[k] : undefined)

  return (
    <Modal
      open
      onClose={onClose}
      title={`Add ${kindLabel}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={submitted && !ok}>
            Add {spec.label.toLowerCase()}
          </Button>
        </>
      }
    >
      <form
        data-testid="add-element-form"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {specs.length > 1 && (
          <Field label="Type" className="sm:col-span-2">
            {(id) => <Select<AddableComponent> id={id} value={component} onChange={switchComponent} options={specs.map((s) => ({ value: s.component, label: s.label }))} />}
          </Field>
        )}
        <Field label="Name" required error={submitted || name !== '' ? errors.name : undefined} className="sm:col-span-2">
          {(id) => (
            <TextInput
              id={id}
              value={name}
              aria-invalid={!!errors.name || undefined}
              onChange={(e) => {
                setName(e.target.value)
                setNameTouched(true)
              }}
            />
          )}
        </Field>
        {spec.fields.map((f) => (
          <Field
            key={`${component}:${f.field}`}
            label={f.label}
            required={f.required}
            error={show(f.field)}
            className={f.kind === 'node' && spec.fields.filter((x) => x.kind === 'node').length === 1 ? 'sm:col-span-2' : undefined}
          >
            {(id) =>
              f.kind === 'node' ? (
                <NodePicker id={id} nodes={topology.nodes} value={values[f.field]} invalid={!!show(f.field)} onChange={(v) => setValues((s) => ({ ...s, [f.field]: v }))} />
              ) : (
                <ValueInput id={id} field={f} value={values[f.field]} invalid={!!show(f.field)} onChange={(v) => setValues((s) => ({ ...s, [f.field]: v }))} />
              )
            }
          </Field>
        ))}
        <p className="text-xs text-fg-muted sm:col-span-2">
          The element is added to this case only; the network file stays unchanged. Edit its values later in the table.
        </p>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}
