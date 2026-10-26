import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { ButtonSize, ButtonVariant } from './buttonStyles'
import { buttonClass } from './buttonStyles'
import { Spinner } from './Spinner'
import { cn } from '../../lib/utils'

export type { ButtonSize, ButtonVariant } from './buttonStyles'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className,
  size = 'md',
  ...rest
}: Omit<ButtonProps, 'children'> & { label: string }) {
  return (
    <Button
      aria-label={label}
      title={label}
      variant="ghost"
      size={size}
      className={cn(size === 'sm' ? 'w-7 px-0' : 'w-9 px-0', className)}
      {...rest}
    />
  )
}
