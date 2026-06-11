import { config } from '../config'
import { Card } from './ui/Card'

/** Shown when the factory address is not configured (or env is invalid). */
export function SetupNotice() {
  return (
    <Card className="mx-auto max-w-2xl p-8 text-center">
      <div className="mb-3 text-3xl">⚙️</div>
      <h2 className="text-lg font-semibold text-mist-100">Factory not configured</h2>
      <p className="mt-2 text-sm text-mist-300">
        Set <code className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs">VITE_FACTORY_ADDRESS</code> to a
        deployed VaultFactory on Mantle Sepolia, then reload. The dashboard reads everything on-chain — no
        backend required.
      </p>
      {config.configError ? (
        <p className="mt-4 rounded-lg border border-rose-soft/30 bg-rose-soft/10 px-3 py-2 text-xs text-rose-soft">
          {config.configError}
        </p>
      ) : null}
      <div className="mt-5 text-left text-xs text-mist-400">
        <div className="font-mono">
          RPC&nbsp;&nbsp;&nbsp;&nbsp;{config.rpcUrl}
          <br />
          Chain&nbsp;&nbsp;{config.chainId}
          <br />
          Explorer&nbsp;{config.explorerUrl}
        </div>
      </div>
    </Card>
  )
}
