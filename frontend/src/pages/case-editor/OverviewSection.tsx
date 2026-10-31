import type { CaseStudy } from '../../api/schema'
import { Card, CardBody, CardHeader, Field, TextArea, TextInput } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'

export function OverviewSection({ draft, onChange }: { draft: CaseStudy; onChange: (c: CaseStudy) => void }) {
  return (
    <Card>
      <CardHeader title="Overview" description="Name and describe this study." />
      <CardBody className="grid max-w-2xl gap-4">
        <Field label="Name" required error={!draft.name.trim() ? 'Name is required' : undefined}>
          {(id) => <TextInput id={id} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />}
        </Field>
        <Field label="Description">
          {(id) => (
            <TextArea
              id={id}
              rows={4}
              value={draft.description}
              placeholder="What question does this study answer?"
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4 text-xs text-fg-muted sm:grid-cols-3">
          <div>
            <div className="font-medium text-fg-2">Case ID</div>
            <div className="font-mono">{draft.id ?? 'assigned on save'}</div>
          </div>
          <div>
            <div className="font-medium text-fg-2">Study type</div>
            <div>{draft.study_type}</div>
          </div>
          <div>
            <div className="font-medium text-fg-2">Last updated</div>
            <div>{fmtDateTime(draft.updated_at)}</div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
