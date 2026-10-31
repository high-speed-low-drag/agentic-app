import { useHealth } from '../../api/hooks'
import { cn } from '../../lib/utils'

export function HealthIndicator() {
  const { data, isError, isLoading } = useHealth()
  const ok = !!data && data.status === 'ok'
  const label = isLoading ? 'Connecting…' : ok ? `Backend online` : isError ? 'Backend offline' : 'Backend degraded'
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-fg-2"
      title={ok ? `power-grid-model ${data.pgm_version}` : 'Cannot reach /api/health'}
    >
      <span className="relative flex size-2">
        {ok && <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-40" />}
        <span
          className={cn('relative inline-flex size-2 rounded-full', ok ? 'bg-good' : isLoading ? 'bg-fg-muted' : 'bg-bad')}
        />
      </span>
      <span>{label}</span>
      {ok && <span className="hidden text-fg-muted sm:inline">· PGM {data.pgm_version}</span>}
    </div>
  )
}
