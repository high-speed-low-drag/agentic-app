import { Ban, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import type { RunStatus } from '../api/schema'
import type { BadgeTone } from './ui'
import { Badge } from './ui'

const META: Record<RunStatus, { tone: BadgeTone; label: string; icon: React.ReactNode }> = {
  queued: { tone: 'neutral', label: 'Queued', icon: <Clock size={12} /> },
  running: { tone: 'accent', label: 'Running', icon: <Loader2 size={12} className="animate-spin" /> },
  succeeded: { tone: 'good', label: 'Succeeded', icon: <CheckCircle2 size={12} /> },
  failed: { tone: 'bad', label: 'Failed', icon: <XCircle size={12} /> },
  cancelled: { tone: 'warn', label: 'Cancelled', icon: <Ban size={12} /> },
}

export function RunStatusBadge({ status, progress }: { status: RunStatus; progress?: number }) {
  const m = META[status] ?? META.queued
  return (
    <Badge tone={m.tone} icon={m.icon}>
      {m.label}
      {status === 'running' && progress !== undefined && ` ${Math.round(progress * 100)}%`}
    </Badge>
  )
}
