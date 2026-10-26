import { Info } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'
import { cn } from '../../lib/utils'

export const inputClass =
  'h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg shadow-xs placeholder:text-fg-muted ' +
  'transition-colors hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-ring focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-bad'

/** Label + control + hint/error wrapper. Pass a render function to receive the generated id. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  required,
  inline,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode | ((id: string) => ReactNode)
  className?: string
  required?: boolean
  inline?: boolean
}) {
  const id = useId()
  return (
    <div className={cn(inline ? 'flex items-center gap-2' : 'flex flex-col gap-1', className)}>
      <label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-fg-2">
        {label}
        {required && <span className="text-bad">*</span>}
        {hint && typeof hint === 'string' && inline && (
          <span title={hint}>
            <Info size={12} className="text-fg-muted" />
          </span>
        )}
      </label>
      {typeof children === 'function' ? children(id) : children}
      {error ? (
        <div className="text-xs text-bad">{error}</div>
      ) : hint && !inline ? (
        <div className="text-xs text-fg-muted">{hint}</div>
      ) : null}
    </div>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...rest} />
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-20 py-2', className)} {...rest} />
}

export function Checkbox({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  id?: string
  disabled?: boolean
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg select-none">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-border accent-[var(--c-accent)]"
      />
      {label}
    </label>
  )
}
