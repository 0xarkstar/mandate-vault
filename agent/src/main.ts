import { parseArgs } from 'node:util'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { loadConfig, type AgentConfig } from './config.js'
import { makeClients } from './chain.js'
import { decideOnce } from './decide.js'
import { runSim } from './sim.js'
import { makeDemoMm } from './mm/demo-mm.js'
import type { RfqConfig } from './execute/submit.js'
import { loadPolicyIndex } from './tools/learn.js'

/**
 * Agent CLI entrypoint.
 *
 *   tsx src/main.ts --mode once [--violate] [--force-target 3000,6500,500] [--vault 0x..]
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
  seed: z.coerce.number().int().optional(),
  /** Agent Arena: pin the proposer to one model for this run. */
  model: z.string().min(1).optional(),
  /** Comma-separated bps list, e.g. "3000,6500,500" (demo setup; bypasses LLM only). */
  'force-target': z
    .string()
    .regex(/^\d+(,\d+)*$/, 'must be comma-separated integers')
    .optional()
})

export function parseForceTarget(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined
  return raw.split(',').map((s) => Number.parseInt(s, 10))
}

function parseCli(argv: string[]): z.infer<typeof CliSchema> {
  const { values } = parseArgs({
    args: argv,
    options: {
      mode: { type: 'string' },
      steps: { type: 'string' },
      violate: { type: 'boolean' },
      vault: { type: 'string' },
      seed: { type: 'string' },
      model: { type: 'string' },
      'force-target': { type: 'string' }
    }
  })
  return CliSchema.parse(values)
}

/**
 * Build the RFQ execution config when the env provides a venue + MM keys.
 * The two demo MMs are OURS (labeled): tight quotes +5bps better than oracle
 * mid, wide quotes 40bps worse — the router demonstrably picks the better.
 */
export function buildRfqConfig(cfg: AgentConfig): RfqConfig | undefined {
  if (!cfg.rfqVenueAddress || !cfg.mmKeyTight || !cfg.mmKeyWide) return undefined
  const venue = cfg.rfqVenueAddress
  return {
    venue,
    maxSlippageBps: cfg.rfqMaxSlippageBps,
    mms: [
      makeDemoMm({ name: 'demo-mm-tight', privateKey: cfg.mmKeyTight, edgeBps: 5, venue, chainId: cfg.chainId }),
      makeDemoMm({ name: 'demo-mm-wide', privateKey: cfg.mmKeyWide, edgeBps: -40, venue, chainId: cfg.chainId })
    ]
  }
}

async function run(argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  const cli = parseCli(argv)
  const cfg = loadConfig(env, cli.vault)

  if (!cfg.oracleAddress) {
    throw new Error('ORACLE_ADDRESS env var is required (agent reads oracle prices)')
  }

  const rfq = buildRfqConfig(cfg)
  // The compiled PolicyIndex (learning engine output). Deliberation reads only
  // this version number + hints — never raw history (hot path stays fast).
  const playbookVersion = loadPolicyIndex(env.POLICY_INDEX_PATH ?? 'data/policy-index.json')?.version ?? 0

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
      seed: cli.seed,
      rfq,
      playbookVersion
    })
    return
  }

  // mode === 'once'
  const clients = makeClients(cfg.rpcUrl, cfg.chainId, cfg.privateKey, cfg.rpcUrlWrite)
  await decideOnce({
    clients,
    vault: cfg.vaultAddress,
    oracle: cfg.oracleAddress,
    openRouterApiKey: cfg.openRouterApiKey,
    chainId: cfg.chainId,
    fundingSymbol: cfg.fundingSymbol,
    violate: cli.violate,
    forceTarget: parseForceTarget(cli['force-target']),
    rfq,
    playbookVersion,
    modelOverride: cli.model
  })
}

// Only execute when invoked as the CLI entrypoint — importing this module
// (e.g. from tests) must not trigger a run.
const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  run(process.argv.slice(2), process.env).catch((err) => {
    // eslint-disable-next-line no-console -- CLI user-facing output
    console.error(`agent failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
