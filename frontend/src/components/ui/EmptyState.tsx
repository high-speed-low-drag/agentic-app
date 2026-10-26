import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 rounded-full bg-surface-3 p-3 text-fg-muted">{icon}</div>}
      <div className="text-sm font-semibold text-fg">{title}</div>
      {description && <div className="mt-1 max-w-md text-sm text-fg-muted">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({
  error,
  title = 'Something went wrong',
  onRetry,
  className,
}: {
  error: unknown
  title?: string
  onRetry?: () => void
  className?: string
}) {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return (
    <div
      className={cn('flex items-start gap-3 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm', className)}
      role="alert"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-bad">{title}</div>
        {msg && <div className="mt-0.5 break-words text-fg-2">{msg}</div>}
      </div>
      {onRetry && (
        <button className="text-xs font-medium text-bad underline underline-offset-2" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
