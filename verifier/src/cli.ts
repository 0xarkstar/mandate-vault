#!/usr/bin/env tsx
/**
 * mandate-verify — third-party replay verification CLI (AC-10, demo scene 3).
 *
 * Thin shell around the pure `doVerify` (verify.ts) + viem fetching (fetch.ts).
 */
import { parseArgs } from 'node:util'
import { z } from 'zod'
import type { Address } from 'viem'
import {
  createVerifierClient,
  DEFAULT_RPC_URL,
  fetchDecisionEvents,
  fetchMandateBounds
} from './fetch.js'
import { renderVerdict } from './render.js'
import { doVerify, tamperString } from './verify.js'

const USAGE = `mandate-verify — replay-verify a MandateVault decision from on-chain events

usage:
  tsx src/cli.ts --vault 0x... --epoch N [--tamper] [--viewing-key HEX] [--rpc URL] [--from-block N]

options:
  --vault        MandateVault address (required)
  --epoch        decision epoch to verify, starting at 1 (required)
  --tamper       mutate one character of the snapshot before recomputing hashes
                 (demonstrates tamper detection — must end TAMPERED)
  --viewing-key  64-hex AES-256 key to decrypt confidential (privacy-lite) payloads
                 and replay schema + clamp; omit for integrity-only verification
  --rpc          RPC URL (default: $RPC_URL or ${DEFAULT_RPC_URL})
  --from-block   start block for the log scan (default: earliest)
  -h, --help     show this help

exit codes: 0 = VERIFIED · 1 = TAMPERED / verification failed · 2 = usage or RPC error · 3 = INDETERMINATE (integrity ok, clamp differs — bounds may have changed)`

// ----------------------------------------------------------------- validation

const BlockSchema = z.union([
  z.literal('earliest'),
  z
    .string()
    .regex(/^[0-9]+$/, 'must be a non-negative integer or "earliest"')
    .transform((s) => BigInt(s))
])

const CliSchema = z.object({
  vault: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed 20-byte hex address'),
  epoch: z
    .string()
    .regex(/^[0-9]+$/, 'must be a positive integer')
    .transform((s) => BigInt(s))
    .refine((e) => e >= 1n, 'epochs start at 1'),
  tamper: z.boolean(),
  viewingKey: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (32-byte key)')
    .optional(),
  rpc: z.string().url().optional(),
  fromBlock: BlockSchema
})

const EnvSchema = z.object({
  RPC_URL: z.string().url().optional()
})

// ------------------------------------------------------------------------ cli

function fail(message: string): null {
  process.stderr.write(`${message}\n\n${USAGE}\n`)
  return null
}

function readCliInput(argv: readonly string[]): z.infer<typeof CliSchema> | null {
  const parsedArgs = (() => {
    try {
      return parseArgs({
        args: [...argv],
        options: {
          vault: { type: 'string' },
          epoch: { type: 'string' },
          tamper: { type: 'boolean', default: false },
          'viewing-key': { type: 'string' },
          rpc: { type: 'string' },
          'from-block': { type: 'string', default: 'earliest' },
          help: { type: 'boolean', short: 'h', default: false }
        }
      })
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  })()
  if (typeof parsedArgs === 'string') return fail(parsedArgs)

  const v = parsedArgs.values
  if (v.help) {
    process.stdout.write(`${USAGE}\n`)
    return null
  }
  if (!v.vault || !v.epoch) return fail('missing required --vault / --epoch')

  const parsed = CliSchema.safeParse({
    vault: v.vault,
    epoch: v.epoch,
    tamper: v.tamper ?? false,
    viewingKey: v['viewing-key'],
    rpc: v.rpc,
    fromBlock: v['from-block'] ?? 'earliest'
  })
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `--${i.path.join('.')}: ${i.message}`).join('\n')
    return fail(`invalid arguments:\n${issues}`)
  }
  return parsed.data
}

async function main(argv: readonly string[]): Promise<number> {
  const args = readCliInput(argv)
  if (args === null) return argv.includes('--help') || argv.includes('-h') ? 0 : 2

  const env = EnvSchema.safeParse(process.env)
  if (!env.success) {
    process.stderr.write(`invalid environment: RPC_URL must be a URL\n`)
    return 2
  }
  const rpcUrl = args.rpc ?? env.data.RPC_URL ?? DEFAULT_RPC_URL
  const vault = args.vault as Address

  const client = createVerifierClient(rpcUrl)
  const [decision, bounds] = await Promise.all([
    fetchDecisionEvents(client, vault, args.epoch, args.fromBlock),
    fetchMandateBounds(client, vault)
  ])

  const tamper = args.tamper ? tamperString(decision.decisionData.snapshotJson) : null
  const decisionData = tamper
    ? { ...decision.decisionData, snapshotJson: tamper.tampered }
    : decision.decisionData

  const result = await doVerify(decisionData, decision.decisionLogged, bounds, args.viewingKey)

  process.stdout.write(
    `${renderVerdict(result, {
      vault,
      rpcUrl,
      blockNumber: decision.blockNumber,
      transactionHash: decision.transactionHash,
      tamper
    })}\n`
  )
  if (result.verified) return 0
  if (result.indeterminate) return 3
  return 1
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code
  })
  .catch((err: unknown) => {
    process.stderr.write(`verifier error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 2
  })
