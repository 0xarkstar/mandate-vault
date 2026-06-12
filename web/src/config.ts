import { z } from 'zod'

/**
 * App configuration sourced from Vite env vars. Every value is zod-validated.
 * A missing factory address is tolerated (the UI renders a setup notice rather
 * than crashing) so the dashboard can be built and previewed before deploy.
 */

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed 20-byte address')

const httpUrlSchema = z.string().url().refine((u) => u.startsWith('http'), 'must be an http(s) URL')

const DEFAULTS = {
  rpcUrl: 'https://rpc.sepolia.mantle.xyz',
  chainId: 5003,
  explorerUrl: 'https://sepolia.mantlescan.xyz'
} as const

export interface AppConfig {
  factoryAddress: `0x${string}` | null
  rpcUrl: string
  chainId: number
  explorerUrl: string
  /** First block to scan for event logs (set to the deploy block on a live
   * chain — scanning from genesis in 9k-block chunks is thousands of RPC
   * calls on Sepolia). 0 = local anvil. */
  startBlock: bigint
  configError: string | null
}

function readRaw() {
  const env = import.meta.env as Record<string, string | undefined>
  return {
    factory: env.VITE_FACTORY_ADDRESS,
    rpcUrl: env.VITE_RPC_URL ?? DEFAULTS.rpcUrl,
    chainId: env.VITE_CHAIN_ID ?? String(DEFAULTS.chainId),
    explorerUrl: env.VITE_EXPLORER_URL ?? DEFAULTS.explorerUrl,
    startBlock: env.VITE_START_BLOCK ?? '0'
  }
}

/**
 * Parse and validate the environment into an {@link AppConfig}. The factory is
 * optional; everything else falls back to Mantle Sepolia defaults. Invalid
 * (but present) values surface as a `configError` instead of throwing.
 */
export function loadConfig(): AppConfig {
  const raw = readRaw()

  const baseSchema = z.object({
    rpcUrl: httpUrlSchema,
    chainId: z.coerce.number().int().positive(),
    explorerUrl: httpUrlSchema,
    startBlock: z.coerce.bigint().nonnegative()
  })

  const base = baseSchema.safeParse({
    rpcUrl: raw.rpcUrl,
    chainId: raw.chainId,
    explorerUrl: raw.explorerUrl,
    startBlock: raw.startBlock
  })

  if (!base.success) {
    return {
      factoryAddress: null,
      rpcUrl: DEFAULTS.rpcUrl,
      chainId: DEFAULTS.chainId,
      explorerUrl: DEFAULTS.explorerUrl,
      startBlock: 0n,
      configError: base.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    }
  }

  let factoryAddress: `0x${string}` | null = null
  let configError: string | null = null
  if (raw.factory && raw.factory.length > 0) {
    const parsed = addressSchema.safeParse(raw.factory)
    if (parsed.success) {
      factoryAddress = parsed.data as `0x${string}`
    } else {
      configError = `VITE_FACTORY_ADDRESS invalid: ${parsed.error.issues[0]?.message ?? 'bad address'}`
    }
  }

  return {
    factoryAddress,
    rpcUrl: base.data.rpcUrl,
    chainId: base.data.chainId,
    explorerUrl: base.data.explorerUrl,
    startBlock: base.data.startBlock,
    configError
  }
}

export const config: AppConfig = loadConfig()

/** Build an explorer link for a tx hash. */
export function txUrl(cfg: AppConfig, hash: string): string {
  return `${cfg.explorerUrl.replace(/\/$/, '')}/tx/${hash}`
}

/** Build an explorer link for an address. */
export function addressExplorerUrl(cfg: AppConfig, address: string): string {
  return `${cfg.explorerUrl.replace(/\/$/, '')}/address/${address}`
}
