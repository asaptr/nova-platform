import * as React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium block">{label}</label>
      )}
      <input
        id={inputId}
        className={`w-full border rounded-lg px-3 py-2 text-sm bg-[var(--color-background)] outline-none transition-colors
          ${error ? 'border-red-500 focus:border-red-500' : 'border-[var(--color-border)] focus:border-[var(--color-accent)]'}
          ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
