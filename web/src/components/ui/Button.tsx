import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-accent-500 text-ink-950 hover:bg-accent-400 disabled:bg-ink-700 disabled:text-mist-400',
  secondary:
    'bg-ink-700 text-mist-100 hover:bg-ink-600 disabled:bg-ink-800 disabled:text-mist-400',
  ghost:
    'bg-transparent text-mist-200 ring-1 ring-inset ring-ink-600 hover:bg-ink-800 disabled:text-mist-400'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${VARIANT[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
