import * as React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl ${padding ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  )
}
