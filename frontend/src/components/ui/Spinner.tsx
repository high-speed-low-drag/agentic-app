import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin', className)} aria-hidden />
}

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-fg-muted', className)} role="status">
      <Spinner />
      {label}
    </div>
  )
}
