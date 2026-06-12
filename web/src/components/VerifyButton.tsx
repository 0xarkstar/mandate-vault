import { useState } from 'react'
import {
  isConfidentialDecision,
  verifyDecision,
  verifyDecisionConfidential,
  type VerifyResult
} from '../lib/verify'
import type { Decision, Mandate } from '../lib/types'
import { Button } from './ui/Button'

/**
 * The demo's "Verify" button — re-runs clamp-core (hashes + clamp) in the
 * browser against the on-chain decision payload and shows ✓ VERIFIED / ✗.
 * This is the visual twin of the verifier CLI's scene 3.
 *
 * Privacy-lite: when the decision's payloads are encrypted envelopes, the panel
 * exposes a viewing-key input. With a key, content is decrypted and replayed
 * (WebCrypto is native in the browser); without one, only integrity (hashes) is
 * verified and the content stays confidential.
 */
export function VerifyButton({
  decision,
  mandate
}: {
  decision: Decision
  mandate: Pick<Mandate, 'minBps' | 'maxBps'>
}) {
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [viewingKey, setViewingKey] = useState('')
  const hasPayload = decision.snapshotJson.length > 0 || decision.rawProposalJson.length > 0
  const confidential = isConfidentialDecision(decision)

  const run = () => {
    if (confidential) {
      void verifyDecisionConfidential(decision, mandate, viewingKey.trim() || undefined).then(setResult)
    } else {
      setResult(verifyDecision(decision, mandate))
    }
  }

  const integrityOnly = result?.confidential === true && result.contentVerified === false && result.ok

  return (
    <div>
      {confidential ? (
        <div className="mb-2">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-mist-400">
            🔒 Viewing key (optional — decrypts content)
          </label>
          <input
            type="password"
            value={viewingKey}
            onChange={(e) => setViewingKey(e.target.value)}
            placeholder="64-hex viewing key"
            className="w-full rounded-lg border border-ink-700 bg-ink-900/60 px-2 py-1 font-mono text-xs text-mist-200 placeholder:text-mist-500"
          />
        </div>
      ) : null}

      <Button variant={result?.ok ? 'primary' : 'ghost'} onClick={run} disabled={!hasPayload}>
        {result === null ? (
          <>🔍 Verify</>
        ) : result.ok ? (
          integrityOnly ? <>🔒 Integrity Verified</> : <>✓ Verified</>
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
            {!result.ok
              ? '✗ VERIFICATION FAILED'
              : integrityOnly
                ? '🔒 INTEGRITY VERIFIED — content confidential'
                : '✓ VERIFIED — recomputed locally from on-chain data'}
          </div>
          {integrityOnly ? (
            <p className="mb-2 text-xs text-mist-400">
              Hashes match the on-chain commitments. Enter the viewing key to decrypt and replay the
              schema + clamp.
            </p>
          ) : null}
          <ul className="space-y-1.5">
            {result.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-xs">
                <span className={c.locked ? 'text-mist-400' : c.ok ? 'text-accent-400' : 'text-rose-soft'}>
                  {c.locked ? '🔒' : c.ok ? '✓' : '✗'}
                </span>
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
