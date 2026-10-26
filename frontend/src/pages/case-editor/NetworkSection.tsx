import { Network, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useEditableFields, useNetworks, useUploadNetwork } from '../../api/hooks'
import type { CaseStudy, ComponentCounts, NetworkOverride, NetworkRef } from '../../api/schema'
import type { ElementTableEditing } from '../../components/network'
import { NetworkExplorer } from '../../components/network'
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field, LoadingState, Select, useToast } from '../../components/ui'
import { humanize } from '../../lib/format'
import { errorMessage } from '../../lib/utils'
import { useCaseTopology } from './useCaseTopology'

export function CountBadges({ counts }: { counts: ComponentCounts }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => (
          <Badge key={k}>
            <span className="tabular font-semibold text-fg">{n}</span> {humanize(k)}
          </Badge>
        ))}
    </div>
  )
}

export function NetworkSection({ draft, onChange }: { draft: CaseStudy; onChange: (c: CaseStudy) => void }) {
  const networks = useNetworks()
  const { topo, overrides, effective } = useCaseTopology(draft)
  const upload = useUploadNetwork()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const editable = useEditableFields()
  const [pendingNetwork, setPendingNetwork] = useState<NetworkRef | null>(null)

  /** Switching networks clears the overrides (they refer to the old network's elements). */
  const switchNetwork = (ref: NetworkRef) => {
    if (ref.source === draft.network.source && ref.key === draft.network.key) return
    if (overrides.length > 0) setPendingNetwork(ref)
    else onChange({ ...draft, network: ref, network_overrides: [] })
  }

  const editing = useMemo<ElementTableEditing | undefined>(
    () =>
      editable.data
        ? {
            fields: editable.data,
            overrides,
            onChange: (next: NetworkOverride[]) => onChange({ ...draft, network_overrides: next }),
          }
        : undefined,
    [editable.data, overrides, draft, onChange],
  )

  const value = draft.network.source ? `${draft.network.source}/${draft.network.key}` : ''
  const items = networks.data ?? []
  const current = items.find((n) => n.source === draft.network.source && n.key === draft.network.key)
  const options = items.map((n) => ({ value: `${n.source}/${n.key}`, label: `${n.name} · ${n.source}` }))
  if (value && !current) options.unshift({ value, label: `${draft.network.key} · ${draft.network.source} (unavailable)` })

  const onFile = (f: File | undefined) => {
    if (!f) return
    upload.mutate(f, {
      onSuccess: (item) => {
        toast.success('Network uploaded', item.name)
        switchNetwork({ source: item.source, key: item.key })
      },
      onError: (e) => toast.error('Upload failed', errorMessage(e)),
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card>
        <CardHeader
          title="Network"
          icon={<Network size={16} />}
          description="Pick a bundled sample or upload a power-grid-model JSON input file."
          actions={
            <>
              <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button icon={<Upload size={14} />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                Upload PGM JSON
              </Button>
            </>
          }
        />
        <CardBody className="grid gap-3">
          {networks.isLoading ? (
            <LoadingState label="Loading networks…" className="py-4" />
          ) : networks.error ? (
            <ErrorState error={networks.error} title="Could not load networks" onRetry={() => void networks.refetch()} />
          ) : (
            <>
              <Field label="Network" className="max-w-xl">
                {(id) => (
                  <Select
                    id={id}
                    value={value}
                    placeholder="Select a network…"
                    options={options}
                    onChange={(v) => {
                      const i = v.indexOf('/')
                      switchNetwork({ source: v.slice(0, i), key: v.slice(i + 1) })
                    }}
                  />
                )}
              </Field>
              {current?.description && <p className="max-w-3xl text-sm text-fg-muted">{current.description}</p>}
              {(topo.data?.counts ?? current?.counts) && <CountBadges counts={topo.data?.counts ?? current!.counts} />}
            </>
          )}
        </CardBody>
      </Card>

      {draft.network.source && (
        <Card>
          <CardHeader
            title="Topology"
            description="Pan with drag, zoom with + / −; click an element for details. Edit parameters in the table: changes apply to this case only, the network file stays unchanged."
          />
          <CardBody>
            {topo.isLoading ? (
              <LoadingState label="Loading topology…" />
            ) : topo.error ? (
              <ErrorState error={topo.error} title="Could not load topology" onRetry={() => void topo.refetch()} />
            ) : topo.data ? (
              <NetworkExplorer title={draft.name} key={`${topo.data.source}/${topo.data.key}`} topology={topo.data} effective={effective} editing={editing} />
            ) : (
              <EmptyState title="No topology" />
            )}
          </CardBody>
        </Card>
      )}

      <ConfirmDialog
        open={pendingNetwork !== null}
        title="Switch network?"
        message={`This case has ${overrides.length} parameter override${overrides.length === 1 ? '' : 's'} on the current network. Switching networks removes them.`}
        confirmLabel="Switch and clear"
        danger
        onCancel={() => setPendingNetwork(null)}
        onConfirm={() => {
          if (pendingNetwork) onChange({ ...draft, network: pendingNetwork, network_overrides: [] })
          setPendingNetwork(null)
        }}
      />
    </div>
  )
}
