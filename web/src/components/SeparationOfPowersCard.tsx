import { Card, SectionTitle } from './ui/Card'

interface Layer {
  step: string
  detail: string
}

const LAYERS: Layer[] = [
  { step: 'AI proposes', detail: 'LLM' },
  { step: 'Reviewer vetoes', detail: 'different model' },
  { step: 'Clamp cages', detail: 'deterministic' },
  { step: 'Chain enforces', detail: 'mandate re-check + drawdown trip' }
]

/**
 * Static explainer: the four independent enforcement layers that gate any state
 * change. No on-chain reads — pure copy.
 */
export function SeparationOfPowersCard() {
  return (
    <Card className="p-5">
      <SectionTitle sub="No single actor can move capital alone — four independent gates.">
        Separation of powers
      </SectionTitle>
      <ol className="space-y-2">
        {LAYERS.map((layer, i) => (
          <li key={layer.step} className="flex items-center gap-3">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-500/15 font-mono text-xs font-semibold text-accent-400 ring-1 ring-inset ring-accent-500/30">
              {i + 1}
            </span>
            <span className="text-sm font-medium text-mist-100">{layer.step}</span>
            <span className="ml-auto text-xs text-mist-400">{layer.detail}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
