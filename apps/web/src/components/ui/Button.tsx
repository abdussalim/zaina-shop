import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'small' | 'medium' | 'large'
  pending?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'medium',
  pending = false,
  icon,
  className = '',
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`}
      disabled={disabled || pending}
      {...props}
    >
      {pending ? <LoaderCircle className="button__spinner" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  )
}
