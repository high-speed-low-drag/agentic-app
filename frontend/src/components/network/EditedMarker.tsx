import { cn } from '../../lib/utils'

/** Small amber "edited" chip for a value changed by a per-case override; `title` holds the file value. */
export function EditedMarker({ title, className }: { title: string; className?: string }) {
  return (
    <span
      data-testid="edited-marker"
      title={title}
      aria-label={`edited (${title})`}
      className={cn(
        'inline-flex shrink-0 items-center rounded border border-warn-border bg-warn-soft px-1 text-[10px] leading-4 font-medium text-warn',
        className,
      )}
    >
      edited
    </span>
  )
}
