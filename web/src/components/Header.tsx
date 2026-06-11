import { config } from '../config'
import { navigate } from '../lib/router'
import { Badge } from './ui/Badge'

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate({ name: 'vaults' })}
          className="flex items-center gap-3 text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-500/15 ring-1 ring-inset ring-accent-500/30">
            <span className="text-lg">🛡️</span>
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight text-mist-100">MandateVault</div>
            <div className="text-[11px] text-mist-400">AI under mandate, verified on-chain</div>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <Badge tone="blue">Mantle Sepolia · {config.chainId}</Badge>
        </div>
      </div>
    </header>
  )
}
