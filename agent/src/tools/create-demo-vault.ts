import { parseArgs } from 'node:util'
import { z } from 'zod'
import { decodeEventLog, type Address } from 'viem'
import { vaultFactoryAbi } from '@mandate-vault/abi'
import { makeClients } from '../chain.js'
import { loadToolConfig } from '../config.js'

/**
 * Create a short-cooldown demo vault via VaultFactory.createCustomVault so the
 * accelerated sim (AC-9) can produce many decisions without waiting the 1h
 * template cooldown. The custom mandate uses the factory's 3 mock assets,
 * rebalanceCooldown = 60s, and the agent EOA from --agent (or PRIVATE_KEY's
 * address is the deployer; agent must be supplied explicitly).
 *
 *   tsx src/tools/create-demo-vault.ts --factory 0x.. --agent 0x.. [--cooldown 60]
 */

const ArgsSchema = z.object({
  factory: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'factory must be a 20-byte address'),
  agent: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'agent must be a 20-byte address'),
  cooldown: z.coerce.number().int().min(1).max(86_400).default(60)
})

/** Build the 3-asset custom mandate struct (matches Solidity Mandate). */
export function buildCustomMandate(
  assets: [Address, Address, Address],
  agent: Address,
  cooldown: number
) {
  return {
    assets,
    minBps: [2000, 0, 0],
    maxBps: [10_000, 8000, 2000],
    maxDrawdownBps: 1500,
    rebalanceCooldown: cooldown,
    mgmtFeeBpsPerYear: 100,
    perfFeeBps: 1000,
    hurdleBpsPerYear: 450,
    agent
  } as const
}

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      factory: { type: 'string' },
      agent: { type: 'string' },
      cooldown: { type: 'string' }
    }
  })
  const args = ArgsSchema.parse(values)
  const cfg = loadToolConfig(env)
  if (!cfg.PRIVATE_KEY) throw new Error('PRIVATE_KEY env var is required (deployer/creator)')

  const factory = args.factory as `0x${string}`
  const clients = makeClients(cfg.RPC_URL, cfg.CHAIN_ID, cfg.PRIVATE_KEY)

  // Resolve the factory's three mock asset addresses.
  const base = { address: factory, abi: vaultFactoryAbi } as const
  const [mUSD, mMETH, mMNT] = (await Promise.all([
    clients.publicClient.readContract({ ...base, functionName: 'mUSD' }),
    clients.publicClient.readContract({ ...base, functionName: 'mMETH' }),
    clients.publicClient.readContract({ ...base, functionName: 'mMNT' })
  ])) as [Address, Address, Address]

  const mandate = buildCustomMandate([mUSD, mMETH, mMNT], args.agent as Address, args.cooldown)

  const txHash = await clients.walletClient.writeContract({
    address: factory,
    abi: vaultFactoryAbi,
    functionName: 'createCustomVault',
    args: [mandate],
    chain: clients.chain,
    account: clients.account
  })
  const receipt = await clients.publicClient.waitForTransactionReceipt({ hash: txHash })

  // Extract the new vault address from the VaultCreated event.
  let vaultAddress: Address | undefined
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: vaultFactoryAbi, data: log.data, topics: log.topics })
      if (decoded.eventName === 'VaultCreated') {
        const args = decoded.args as unknown as { vault: Address }
        vaultAddress = args.vault
        break
      }
    } catch {
      // not our event — skip
    }
  }

  // eslint-disable-next-line no-console -- CLI user-facing output
  console.log(`createCustomVault tx=${txHash} cooldown=${args.cooldown}s agent=${args.agent}`)
  // eslint-disable-next-line no-console -- CLI user-facing output
  console.log(`VAULT_ADDRESS=${vaultAddress ?? '(decode failed — check receipt)'}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.env).catch((err) => {
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.error(`create-demo-vault failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
