import { Card, SectionTitle } from './ui/Card'
import { Badge } from './ui/Badge'

/**
 * Shows the playbook (PolicyIndex) version the latest decision executed against.
 * v0 = pre-learning. The compounding learning loop is roadmap; this card states
 * that honestly.
 */
export function PlaybookCard({ version }: { version: number | null }) {
  const v = version ?? 0
  return (
    <Card className="p-5">
      <SectionTitle sub="The compiled policy the agent executed against.">Learning engine</SectionTitle>
      <div className="flex items-center gap-3">
        <Badge tone="blue">Playbook v{v}</Badge>
        {version === null ? <span className="text-xs text-mist-400">pre-learning</span> : null}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-mist-300">
        Compiled by the background learning engine from the on-chain decision log. Full compounding loop ={' '}
        <span className="text-mist-200">roadmap</span>.
      </p>
    </Card>
  )
}
