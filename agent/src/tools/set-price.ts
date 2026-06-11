import { parseArgs } from 'node:util'
import { z } from 'zod'
import { mockOracleAbi } from '@mandate-vault/abi'
import { makeClients } from '../chain.js'
import { loadToolConfig } from '../config.js'

/**
 * Set a MockOracle price (used by demo scene 2 to crash mMETH). Signs with
 * ORACLE_OWNER_KEY (the oracle owner). Price is given as a human decimal USD
 * value and scaled to 1e18.
 *
 *   tsx src/tools/set-price.ts --asset 0x.. --price 1234.56
 */

const ArgsSchema = z.object({
  asset: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'asset must be a 20-byte address'),
  price: z.string().min(1)
})

function toWad(humanDecimal: string): bigint {
  const n = Number(humanDecimal)
  if (!Number.isFinite(n) || n < 0) throw new Error(`invalid price: ${humanDecimal}`)
  // 1e18 scaling via string math to avoid float drift on whole/decimal parts.
  const [whole, frac = ''] = humanDecimal.split('.')
  const fracPadded = (frac + '0'.repeat(18)).slice(0, 18)
  return BigInt(whole || '0') * 10n ** 18n + BigInt(fracPadded || '0')
}

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      asset: { type: 'string' },
      price: { type: 'string' }
    }
  })
  const args = ArgsSchema.parse(values)
  const cfg = loadToolConfig(env)
  if (!cfg.ORACLE_ADDRESS) throw new Error('ORACLE_ADDRESS env var is required')
  if (!cfg.ORACLE_OWNER_KEY) throw new Error('ORACLE_OWNER_KEY env var is required')

  const clients = makeClients(cfg.RPC_URL, cfg.CHAIN_ID, cfg.ORACLE_OWNER_KEY)
  const priceWad = toWad(args.price)

  const txHash = await clients.walletClient.writeContract({
    address: cfg.ORACLE_ADDRESS,
    abi: mockOracleAbi,
    functionName: 'setPrice',
    args: [args.asset as `0x${string}`, priceWad],
    chain: clients.chain,
    account: clients.account
  })
  await clients.publicClient.waitForTransactionReceipt({ hash: txHash })
  // eslint-disable-next-line no-console -- CLI user-facing output
  console.log(`setPrice(${args.asset}, ${args.price} → ${priceWad}) tx=${txHash}`)
}

// Run when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.env).catch((err) => {
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.error(`set-price failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}

export { toWad }
