import { LoaderCircle } from 'lucide-react'
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'small' | 'medium' | 'large'
  pending?: boolean
  icon?: ReactNode
  disabledReason?: string | undefined
}

export function Button({
  variant = 'primary',
  size = 'medium',
  pending = false,
  icon,
  className = '',
  children,
  disabled,
  disabledReason,
  ...props
}: ButtonProps) {
  const generatedId = useId()
  const reasonId = disabledReason ? `${generatedId}-reason` : undefined
  return (
    <>
      <button
        className={`button button--${variant} button--${size} ${className}`}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        aria-describedby={reasonId ?? props['aria-describedby']}
        {...props}
      >
        {pending ? <LoaderCircle className="button__spinner" aria-hidden="true" /> : icon}
        <span>{children}</span>
      </button>
      {disabledReason ? <span id={reasonId} className="button__disabled-reason sr-only">{disabledReason}</span> : null}
    </>
  )
}
