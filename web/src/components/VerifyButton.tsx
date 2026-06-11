import { useState } from 'react'
import { verifyDecision, type VerifyResult } from '../lib/verify'
import type { Decision, Mandate } from '../lib/types'
import { Button } from './ui/Button'

/**
 * The demo's "Verify" button — re-runs clamp-core (hashes + clamp) in the
 * browser against the on-chain decision payload and shows ✓ VERIFIED / ✗.
 * This is the visual twin of the verifier CLI's scene 3.
 */
export function VerifyButton({
  decision,
  mandate
}: {
  decision: Decision
  mandate: Pick<Mandate, 'minBps' | 'maxBps'>
}) {
  const [result, setResult] = useState<VerifyResult | null>(null)
  const hasPayload = decision.snapshotJson.length > 0 || decision.rawProposalJson.length > 0

  const run = () => {
    setResult(verifyDecision(decision, mandate))
  }

  return (
    <div>
      <Button variant={result?.ok ? 'primary' : 'ghost'} onClick={run} disabled={!hasPayload}>
        {result === null ? (
          <>🔍 Verify</>
        ) : result.ok ? (
          <>✓ Verified</>
        ) : (
          <>✗ Mismatch</>
        )}
      </Button>

      {!hasPayload ? (
        <p className="mt-2 text-xs text-mist-400">No on-chain payload to verify for this decision.</p>
      ) : null}

      {result ? (
        <div
          className={`mv-pop mt-3 rounded-xl border p-3 ${
            result.ok
              ? 'border-accent-500/40 bg-accent-500/10'
              : 'border-rose-soft/40 bg-rose-soft/10'
          }`}
        >
          <div
            className={`mb-2 text-sm font-semibold ${result.ok ? 'text-accent-400' : 'text-rose-soft'}`}
          >
            {result.ok ? '✓ VERIFIED — recomputed locally from on-chain data' : '✗ VERIFICATION FAILED'}
          </div>
          <ul className="space-y-1.5">
            {result.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-xs">
                <span className={c.ok ? 'text-accent-400' : 'text-rose-soft'}>{c.ok ? '✓' : '✗'}</span>
                <span className="text-mist-300">
                  <span className="font-medium text-mist-200">{c.label}:</span>{' '}
                  <span className="font-mono">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
