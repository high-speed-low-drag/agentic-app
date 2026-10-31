import type { ReactNode } from 'react'
import type { LinkProps } from 'react-router'
import { Link } from 'react-router'
import type { ButtonSize, ButtonVariant } from './buttonStyles'
import { buttonClass } from './buttonStyles'

/** A react-router Link styled as a Button. */
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
