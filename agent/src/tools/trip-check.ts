import { parseArgs } from 'node:util'
import { z } from 'zod'
import { mandateVaultAbi } from '@mandate-vault/abi'
import { makeClients, makePublicClient } from '../chain.js'
import { loadToolConfig } from '../config.js'

/**
 * Trigger the public keeper-style drawdown trip and report the resulting state
 * (used by demo scene 2). Anyone may call tripCheck(); we sign with PRIVATE_KEY.
 *
 *   tsx src/tools/trip-check.ts --vault 0x..
 */

const ArgsSchema = z.object({
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'vault must be a 20-byte address')
})

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { vault: { type: 'string' } }
  })
  const args = ArgsSchema.parse(values)
  const cfg = loadToolConfig(env)
  if (!cfg.PRIVATE_KEY) throw new Error('PRIVATE_KEY env var is required (caller of tripCheck)')

  const vault = args.vault as `0x${string}`
  const clients = makeClients(cfg.RPC_URL, cfg.CHAIN_ID, cfg.PRIVATE_KEY)

  const txHash = await clients.walletClient.writeContract({
    address: vault,
    abi: mandateVaultAbi,
    functionName: 'tripCheck',
    args: [],
    chain: clients.chain,
    account: clients.account
  })
  await clients.publicClient.waitForTransactionReceipt({ hash: txHash })

  // Read post-trip state.
  const pub = makePublicClient(cfg.RPC_URL, cfg.CHAIN_ID)
  const [tripped, allocBps] = (await Promise.all([
    pub.readContract({ address: vault, abi: mandateVaultAbi, functionName: 'tripped' }),
    pub.readContract({ address: vault, abi: mandateVaultAbi, functionName: 'currentAllocationBps' })
  ])) as [boolean, readonly number[]]

  // eslint-disable-next-line no-console -- CLI user-facing output
  console.log(`tripCheck tx=${txHash}`)
  // eslint-disable-next-line no-console -- CLI user-facing output
  console.log(
    `tripped=${tripped} allocationBps=${JSON.stringify(allocBps.map(Number))} ` +
      '(FREEZE mandate: positions held; DERISK mandate: expect ~[10000, 0, ...])'
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.env).catch((err) => {
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.error(`trip-check failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
