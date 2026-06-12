import { z } from 'zod'

/**
 * Environment configuration for the agent daemon. Every external input is
 * zod-validated; secrets only ever come from env vars (never hardcoded).
 */

const DEFAULT_RPC_URL = 'https://rpc.sepolia.mantle.xyz'
const DEFAULT_CHAIN_ID = 5003

const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed 20-byte address')

const hexPrivateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte private key')

/** Raw env shape (strings), parsed and coerced into the typed config below. */
const EnvSchema = z.object({
  PRIVATE_KEY: hexPrivateKey,
  RPC_URL: z.string().url().default(DEFAULT_RPC_URL),
  CHAIN_ID: z.coerce.number().int().positive().default(DEFAULT_CHAIN_ID),
  VAULT_ADDRESS: hexAddress,
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  ORACLE_ADDRESS: hexAddress.optional(),
  ORACLE_OWNER_KEY: hexPrivateKey.optional(),
  FUNDING_SYMBOL: z.string().min(1).default('ETHUSDT'),
  /** RFQ execution (optional — absent = direct venue fallback path). */
  RFQ_VENUE_ADDRESS: hexAddress.optional(),
  MM_KEY_TIGHT: hexPrivateKey.optional(),
  MM_KEY_WIDE: hexPrivateKey.optional(),
  RFQ_MAX_SLIPPAGE_BPS: z.coerce.number().int().min(0).max(10_000).default(50)
})

export type AgentConfig = {
  privateKey: `0x${string}`
  rpcUrl: string
  chainId: number
  vaultAddress: `0x${string}`
  openRouterApiKey: string
  oracleAddress?: `0x${string}`
  oracleOwnerKey?: `0x${string}`
  fundingSymbol: string
  rfqVenueAddress?: `0x${string}`
  mmKeyTight?: `0x${string}`
  mmKeyWide?: `0x${string}`
  rfqMaxSlippageBps: number
}

/**
 * Load + validate config from `process.env`. `vaultOverride` lets the CLI
 * `--vault` flag win over the env value.
 */
export function loadConfig(env: NodeJS.ProcessEnv, vaultOverride?: string): AgentConfig {
  const merged = vaultOverride ? { ...env, VAULT_ADDRESS: vaultOverride } : env
  const parsed = EnvSchema.safeParse(merged)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid agent configuration:\n${issues}`)
  }
  const e = parsed.data
  return {
    privateKey: e.PRIVATE_KEY as `0x${string}`,
    rpcUrl: e.RPC_URL,
    chainId: e.CHAIN_ID,
    vaultAddress: e.VAULT_ADDRESS as `0x${string}`,
    openRouterApiKey: e.OPENROUTER_API_KEY,
    oracleAddress: e.ORACLE_ADDRESS as `0x${string}` | undefined,
    oracleOwnerKey: e.ORACLE_OWNER_KEY as `0x${string}` | undefined,
    fundingSymbol: e.FUNDING_SYMBOL,
    rfqVenueAddress: e.RFQ_VENUE_ADDRESS as `0x${string}` | undefined,
    mmKeyTight: e.MM_KEY_TIGHT as `0x${string}` | undefined,
    mmKeyWide: e.MM_KEY_WIDE as `0x${string}` | undefined,
    rfqMaxSlippageBps: e.RFQ_MAX_SLIPPAGE_BPS
  }
}

/**
 * Minimal config for oracle/tool scripts that only need RPC + an owner key
 * (set-price, create-demo-vault, trip-check). Avoids requiring the full agent
 * env (LLM key etc.) for ops scripts.
 */
const ToolEnvSchema = z.object({
  RPC_URL: z.string().url().default(DEFAULT_RPC_URL),
  CHAIN_ID: z.coerce.number().int().positive().default(DEFAULT_CHAIN_ID),
  ORACLE_ADDRESS: hexAddress.optional(),
  ORACLE_OWNER_KEY: hexPrivateKey.optional(),
  PRIVATE_KEY: hexPrivateKey.optional()
})

export interface ToolConfig {
  RPC_URL: string
  CHAIN_ID: number
  ORACLE_ADDRESS?: `0x${string}`
  ORACLE_OWNER_KEY?: `0x${string}`
  PRIVATE_KEY?: `0x${string}`
}

export function loadToolConfig(env: NodeJS.ProcessEnv): ToolConfig {
  const parsed = ToolEnvSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid tool configuration:\n${issues}`)
  }
  const e = parsed.data
  return {
    RPC_URL: e.RPC_URL,
    CHAIN_ID: e.CHAIN_ID,
    ORACLE_ADDRESS: e.ORACLE_ADDRESS as `0x${string}` | undefined,
    ORACLE_OWNER_KEY: e.ORACLE_OWNER_KEY as `0x${string}` | undefined,
    PRIVATE_KEY: e.PRIVATE_KEY as `0x${string}` | undefined
  }
}
