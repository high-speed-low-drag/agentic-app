import { Layers, Plus } from 'lucide-react'
import { useState } from 'react'
import { useProfileGenerators } from '../../api/hooks'
import type { CaseStudy, ProfileAssignment, ProfileUploadResponse } from '../../api/schema'
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingState } from '../../components/ui'
import { randomId } from '../../lib/utils'
import { ProfileAssignmentCard } from './ProfileAssignmentCard'
import { withGenerator } from './profileUtils'
import { useCaseTopology } from './useCaseTopology'

export function ProfilesSection({ draft, onChange }: { draft: CaseStudy; onChange: (c: CaseStudy) => void }) {
  const gens = useProfileGenerators()
  const { effective } = useCaseTopology(draft)
  const [csvFiles, setCsvFiles] = useState<Record<string, ProfileUploadResponse>>({})
  const [removeIdx, setRemoveIdx] = useState<number | null>(null)
  const list = draft.profile_assignments

  const setList = (next: ProfileAssignment[]) => onChange({ ...draft, profile_assignments: next })

  const add = () => {
    const generators = gens.data ?? []
    const base: ProfileAssignment = {
      id: randomId('a'),
      label: 'New profile',
      generator: '',
      params: {},
      target: { component: 'sym_load', ids: null },
      mode: 'scale',
      magnitude_w: null,
      factor: 1,
    }
    // pick a load generator for the first assignment, otherwise the first one available
    const g = generators.find((x) => x.key === 'residential_load') ?? generators[0]
    setList([...list, g ? withGenerator(base, g) : base])
  }

  if (gens.isLoading) return <LoadingState label="Loading profile generators…" />
  if (gens.error) return <ErrorState error={gens.error} title="Could not load profile generators" onRetry={() => void gens.refetch()} />

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-fg-muted">
          Assignments apply in list order. <b className="text-fg-2">Scale</b> multiplies base p/q; <b className="text-fg-2">Add</b> adds magnitude × m(t).
          Appliances without an assignment keep their base values.
        </p>
        <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
          Add profile
        </Button>
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers size={20} />}
            title="No profile assignments"
            description="Without profiles every timestep uses the base load / generation, so all timesteps are identical."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
                Add profile
              </Button>
            }
          />
        </Card>
      ) : (
        list.map((a, i) => (
          <ProfileAssignmentCard
            key={a.id}
            index={i}
            count={list.length}
            assignment={a}
            generators={gens.data ?? []}
            topology={effective}
            time={draft.time}
            csvFiles={csvFiles}
            onCsvUploaded={(r) => setCsvFiles((m) => ({ ...m, [r.file_id]: r }))}
            onChange={(na) => setList(list.map((x, j) => (j === i ? na : x)))}
            onMove={(d) => {
              const j = i + d
              if (j < 0 || j >= list.length) return
              const next = [...list]
              ;[next[i], next[j]] = [next[j], next[i]]
              setList(next)
            }}
            onRemove={() => setRemoveIdx(i)}
          />
        ))
      )}
      <ConfirmDialog
        open={removeIdx !== null}
        danger
        title="Remove profile assignment?"
        message={<>“{removeIdx !== null ? list[removeIdx]?.label : ''}” will be removed from this case (not saved until you press Save).</>}
        confirmLabel="Remove"
        onCancel={() => setRemoveIdx(null)}
        onConfirm={() => {
          if (removeIdx !== null) setList(list.filter((_, j) => j !== removeIdx))
          setRemoveIdx(null)
        }}
      />
    </div>
  )
}
