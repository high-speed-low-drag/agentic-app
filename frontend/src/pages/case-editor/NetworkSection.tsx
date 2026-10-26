import { Network, Upload } from 'lucide-react'
import { useRef } from 'react'
import { useNetworks, useNetworkTopology, useUploadNetwork } from '../../api/hooks'
import type { CaseStudy, ComponentCounts } from '../../api/schema'
import { NetworkExplorer } from '../../components/network'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Field, LoadingState, Select, useToast } from '../../components/ui'
import { humanize } from '../../lib/format'
import { errorMessage } from '../../lib/utils'

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
  const topo = useNetworkTopology(draft.network.source || undefined, draft.network.key || undefined)
  const upload = useUploadNetwork()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

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
        onChange({ ...draft, network: { source: item.source, key: item.key } })
      },
      onError: (e) => toast.error('Upload failed', errorMessage(e)),
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="grid gap-4">
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
                      onChange({ ...draft, network: { source: v.slice(0, i), key: v.slice(i + 1) } })
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
          <CardHeader title="Topology" description="Pan with drag, zoom with the wheel; click an element for details." />
          <CardBody>
            {topo.isLoading ? (
              <LoadingState label="Loading topology…" />
            ) : topo.error ? (
              <ErrorState error={topo.error} title="Could not load topology" onRetry={() => void topo.refetch()} />
            ) : topo.data ? (
              <NetworkExplorer key={`${topo.data.source}/${topo.data.key}`} topology={topo.data} />
            ) : (
              <EmptyState title="No topology" />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
