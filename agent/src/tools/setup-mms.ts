import { parseArgs } from 'node:util'
import { z } from 'zod'
import type { Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mockErc20Abi, vaultFactoryAbi } from '@mandate-vault/abi'
import { makeClients } from '../chain.js'
import { loadToolConfig } from '../config.js'

/**
 * Fund the demo MM accounts with mock-asset inventory (open faucet mint) and
 * approve the RFQ venue to settle from them. Run once after deploy.
 *
 *   tsx src/tools/setup-mms.ts --factory 0x.. --venue 0x..
 *
 * Env: PRIVATE_KEY (any funded account, pays the mint gas),
 *      MM_KEY_TIGHT / MM_KEY_WIDE (the MM signers; pay their own approve gas).
 */

const ArgsSchema = z.object({
  factory: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'factory must be a 20-byte address'),
  venue: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'venue must be a 20-byte address')
})

const INVENTORY: Record<string, bigint> = {
  mUSD: 10_000_000n * 10n ** 18n,
  mMETH: 10_000n * 10n ** 18n,
  mMNT: 10_000_000n * 10n ** 18n
}

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { factory: { type: 'string' }, venue: { type: 'string' } }
  })
  const args = ArgsSchema.parse(values)
  const cfg = loadToolConfig(env)
  if (!cfg.PRIVATE_KEY) throw new Error('PRIVATE_KEY env var is required (mints inventory)')

  const mmKeys = [env.MM_KEY_TIGHT, env.MM_KEY_WIDE].filter(
    (k): k is string => typeof k === 'string' && /^0x[0-9a-fA-F]{64}$/.test(k)
  )
  if (mmKeys.length === 0) throw new Error('MM_KEY_TIGHT / MM_KEY_WIDE env vars are required')

  const factory = args.factory as `0x${string}`
  const venue = args.venue as `0x${string}`
  const minter = makeClients(cfg.RPC_URL, cfg.CHAIN_ID, cfg.PRIVATE_KEY)

  const base = { address: factory, abi: vaultFactoryAbi } as const
  const assets = (await Promise.all([
    minter.publicClient.readContract({ ...base, functionName: 'mUSD' }),
    minter.publicClient.readContract({ ...base, functionName: 'mMETH' }),
    minter.publicClient.readContract({ ...base, functionName: 'mMNT' })
  ])) as [Address, Address, Address]
  const names = ['mUSD', 'mMETH', 'mMNT'] as const

  for (const key of mmKeys) {
    const mm = privateKeyToAccount(key as `0x${string}`)
    const mmClients = makeClients(cfg.RPC_URL, cfg.CHAIN_ID, key as `0x${string}`)

    for (let i = 0; i < assets.length; i++) {
      const mintHash = await minter.walletClient.writeContract({
        address: assets[i]!,
        abi: mockErc20Abi,
        functionName: 'mint',
        args: [mm.address, INVENTORY[names[i]!]!],
        chain: minter.chain,
        account: minter.account
      })
      await minter.publicClient.waitForTransactionReceipt({ hash: mintHash })

      const approveHash = await mmClients.walletClient.writeContract({
        address: assets[i]!,
        abi: mockErc20Abi,
        functionName: 'approve',
        args: [venue, 2n ** 256n - 1n],
        chain: mmClients.chain,
        account: mmClients.account
      })
      await mmClients.publicClient.waitForTransactionReceipt({ hash: approveHash })
    }
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.log(`MM ${mm.address}: inventory minted + venue approved (3 assets)`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.env).catch((err) => {
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.error(`setup-mms failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
