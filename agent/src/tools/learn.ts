import { parseArgs } from 'node:util'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import { makePublicClient } from '../chain.js'
import { loadToolConfig } from '../config.js'
import { fetchDecisionRecords } from '../learn/distill.js'
import { compilePolicyIndex, PolicyIndexSchema, type PolicyIndex } from '../learn/index.js'

/**
 * Learning-engine background pass (the slow clock): read the on-chain decision
 * log, distill per-regime execution stats, compile PolicyIndex v(N+1) and write
 * it to disk. The agent's next deliberation reads the new index and stamps its
 * version into the snapshot. Full compounding loop = ROADMAP.
 *
 *   tsx src/tools/learn.ts --vault 0x.. [--venue 0x..] [--out data/policy-index.json]
 */

const ArgsSchema = z.object({
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  venue: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional(),
  out: z.string().min(1).default('data/policy-index.json'),
  'from-block': z.coerce.bigint().nonnegative().default(0n)
})

/** Load a previously compiled index (version 0 sentinel when none exists). */
export function loadPolicyIndex(path: string): PolicyIndex | null {
  if (!existsSync(path)) return null
  try {
    const parsed = PolicyIndexSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function main(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      vault: { type: 'string' },
      venue: { type: 'string' },
      out: { type: 'string' },
      'from-block': { type: 'string' }
    }
  })
  const args = ArgsSchema.parse(values)
  const cfg = loadToolConfig(env)

  const publicClient = makePublicClient(cfg.RPC_URL, cfg.CHAIN_ID)
  const records = await fetchDecisionRecords(publicClient, {
    vault: args.vault as `0x${string}`,
    venue: args.venue as `0x${string}` | undefined,
    fromBlock: args['from-block']
  })

  const previous = loadPolicyIndex(args.out)
  const index = compilePolicyIndex(records, previous?.version ?? 0)

  mkdirSync(dirname(args.out), { recursive: true })
  writeFileSync(args.out, `${JSON.stringify(index, null, 2)}\n`, 'utf8')

  // eslint-disable-next-line no-console -- CLI user-facing output
  console.log(`PolicyIndex v${index.version} compiled from ${records.length} decisions → ${args.out}`)
  for (const [regime, h] of Object.entries(index.regimeHints)) {
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.log(`  ${regime}: ${h.decisions} decisions, cageHitRate=${h.cageHitRate}, avgImprovement=${h.avgImprovementBps}bps`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.env).catch((err) => {
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.error(`learn failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
