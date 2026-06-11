import type { ReactNode } from 'react'

type Tone = 'neutral' | 'green' | 'blue' | 'amber' | 'rose'

const TONE: Record<Tone, string> = {
  neutral: 'bg-ink-700 text-mist-300 ring-ink-600',
  green: 'bg-accent-500/15 text-accent-400 ring-accent-500/30',
  blue: 'bg-azure-500/15 text-azure-400 ring-azure-500/30',
  amber: 'bg-amber-soft/15 text-amber-soft ring-amber-soft/30',
  rose: 'bg-rose-soft/15 text-rose-soft ring-rose-soft/30'
}

export function Badge({
  children,
  tone = 'neutral',
  className = ''
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/** A labelled metric chip (label above, value below) for mandate summaries. */
export function Chip({ label, value, tone = 'neutral' }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className={`rounded-lg px-3 py-2 ring-1 ring-inset ${TONE[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider text-mist-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-mist-100">{value}</div>
    </div>
  )
}
