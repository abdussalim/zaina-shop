import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string | undefined
  hint?: string | undefined
  trailing?: ReactNode | undefined
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, error, hint, trailing, className = '', id, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const descriptionId = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label htmlFor={inputId} className="field__label">
        {label}
      </label>
      <div className="field__control">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
          {...props}
        />
        {trailing ? <div className="field__trailing">{trailing}</div> : null}
      </div>
      {error ? (
        <p id={descriptionId} className="field__message field__message--error">
          {error}
        </p>
      ) : hint ? (
        <p id={descriptionId} className="field__message">
          {hint}
        </p>
      ) : null}
    </div>
  )
})
