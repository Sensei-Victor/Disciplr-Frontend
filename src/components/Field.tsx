import React from 'react'
import { Text } from './Text'

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'label'> {
  label: string
  hint?: string
  error?: string
}

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, id, required, disabled, style, ...props }, ref) => {
  const reactId = React.useId()
  // Ensure the fallback id is unique to prevent duplicate-id collisions (#1269)
  const fieldId = id || `field-${label.toLowerCase().replace(/\s+/g, '-')}-${reactId.replace(/:/g, '')}`
  const errorId = error ? `${fieldId}-error` : undefined
  const hintId = hint && !error ? `${fieldId}-hint` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label htmlFor={fieldId}>
        <Text
          role="caption"
          as="span"
          style={{ display: 'block' }}
        >
          {label}
          {required && <span style={{ color: 'var(--danger)' }} aria-hidden="true">*</span>}
        </Text>
      </label>
      <input
        ref={ref}
        id={fieldId}
        required={required}
        disabled={disabled}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={error ? 'true' : undefined}
        style={{
          width: '100%',
          padding: '0.75rem',
          borderRadius: 'var(--radius)',
          border: error ? '1px solid var(--danger)' : '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          opacity: disabled ? 'var(--opacity-disabled)' : undefined,
          cursor: disabled ? 'not-allowed' : undefined,
          ...style,
        }}
        {...props}
      />
      {hint && !error && (
        <Text
          role="caption"
          as="span"
          id={hintId}
          style={{ color: 'var(--muted)' }}
        >
          {hint}
        </Text>
      )}
      {error && (
        <Text
          role="caption"
          as="span"
          id={errorId}
          aria-live="polite"
          style={{ color: 'var(--danger)' }}
        >
          {error}
        </Text>
      )}
    </div>
  )
})

Field.displayName = 'Field'
