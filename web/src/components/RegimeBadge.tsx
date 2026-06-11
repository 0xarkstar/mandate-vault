import { Badge } from './ui/Badge'

type Regime = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF'

export function RegimeBadge({ regime }: { regime: Regime | null }) {
  if (regime === 'RISK_ON') return <Badge tone="green">RISK ON</Badge>
  if (regime === 'RISK_OFF') return <Badge tone="rose">RISK OFF</Badge>
  if (regime === 'NEUTRAL') return <Badge tone="blue">NEUTRAL</Badge>
  return <Badge tone="neutral">—</Badge>
}
