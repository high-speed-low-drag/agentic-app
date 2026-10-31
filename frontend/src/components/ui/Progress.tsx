import { cn } from '../../lib/utils'

export function Progress({
  value,
  tone = 'accent',
  animated,
  className,
}: {
  /** 0..1 */
  value: number
  tone?: 'accent' | 'good' | 'bad' | 'warn'
  animated?: boolean
  className?: string
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100
  const bar = { accent: 'bg-accent', good: 'bg-good', bad: 'bg-bad', warn: 'bg-warn' }[tone]
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', bar)}
        style={{
          width: `${pct}%`,
          ...(animated
            ? {
                backgroundImage:
                  'linear-gradient(45deg, rgba(255,255,255,.18) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.18) 50%, rgba(255,255,255,.18) 75%, transparent 75%, transparent)',
                backgroundSize: '24px 24px',
                animation: 'progress-stripes 1s linear infinite',
              }
            : {}),
        }}
      />
    </div>
  )
}
