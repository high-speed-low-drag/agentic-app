import { cn } from '../../lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border-transparent shadow-sm',
  secondary: 'bg-surface text-fg border-border hover:bg-surface-3 hover:border-border-strong shadow-sm',
  ghost: 'bg-transparent text-fg-2 border-transparent hover:bg-surface-3 hover:text-fg',
  danger: 'bg-bad text-white border-transparent hover:opacity-90 shadow-sm',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
}

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-md border font-medium whitespace-nowrap transition-colors',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
    'disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
}
