import { parseArgs } from 'node:util'
import { z } from 'zod'
import { loadConfig } from './config.js'
import { makeClients } from './chain.js'
import { decideOnce } from './decide.js'
import { runSim } from './sim.js'

/**
 * Agent CLI entrypoint.
 *
 *   tsx src/main.ts --mode once [--violate] [--vault 0x..]
 *   tsx src/main.ts --mode sim --steps 12 [--vault 0x..]
 *
 * Config (PRIVATE_KEY, RPC_URL, VAULT_ADDRESS, OPENROUTER_API_KEY, ORACLE_*) is
 * read from process.env and zod-validated in config.ts.
 */

const ModeSchema = z.enum(['once', 'sim'])

const CliSchema = z.object({
  mode: ModeSchema.default('once'),
  steps: z.coerce.number().int().min(1).max(100).default(12),
  violate: z.boolean().default(false),
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  seed: z.coerce.number().int().optional()
})

function parseCli(argv: string[]): z.infer<typeof CliSchema> {
  const { values } = parseArgs({
    args: argv,
    options: {
      mode: { type: 'string' },
      steps: { type: 'string' },
      violate: { type: 'boolean' },
      vault: { type: 'string' },
      seed: { type: 'string' }
    }
  })
  return CliSchema.parse(values)
}

async function run(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const cli = parseCli(argv)
  const cfg = loadConfig(env, cli.vault)

  if (!cfg.oracleAddress) {
    throw new Error('ORACLE_ADDRESS env var is required (agent reads oracle prices)')
  }

  if (cli.mode === 'sim') {
    await runSim({
      rpcUrl: cfg.rpcUrl,
      chainId: cfg.chainId,
      agentKey: cfg.privateKey,
      vault: cfg.vaultAddress,
      oracle: cfg.oracleAddress,
      oracleOwnerKey: cfg.oracleOwnerKey,
      openRouterApiKey: cfg.openRouterApiKey,
      fundingSymbol: cfg.fundingSymbol,
      steps: cli.steps,
      seed: cli.seed
    })
    return
  }

  // mode === 'once'
  const clients = makeClients(cfg.rpcUrl, cfg.chainId, cfg.privateKey)
  await decideOnce({
    clients,
    vault: cfg.vaultAddress,
    oracle: cfg.oracleAddress,
    openRouterApiKey: cfg.openRouterApiKey,
    chainId: cfg.chainId,
    fundingSymbol: cfg.fundingSymbol,
    violate: cli.violate
  })
}

run(process.argv.slice(2), process.env).catch((err) => {
  // eslint-disable-next-line no-console -- CLI user-facing output
  console.error(`agent failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
