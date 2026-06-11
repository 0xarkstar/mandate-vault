import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  onClick
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const interactive = onClick
    ? 'cursor-pointer transition-colors hover:border-ink-500 hover:bg-ink-800/60'
    : ''
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-ink-700 bg-ink-850/70 backdrop-blur-sm shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] ${interactive} ${className}`}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-mist-400">{children}</h2>
      {sub ? <p className="mt-1 text-sm text-mist-300">{sub}</p> : null}
    </div>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/50 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-mist-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-mist-100 font-mono">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-mist-400">{hint}</div> : null}
    </div>
  )
}
