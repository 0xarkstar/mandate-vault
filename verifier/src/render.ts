/**
 * Plain-unicode verdict table rendering (no color/TTY dependencies).
 */
import type { TamperResult, VerifyResult } from './verify.js'

export interface RenderContext {
  readonly vault: string
  readonly rpcUrl: string
  readonly blockNumber: bigint | null
  readonly transactionHash: string | null
  readonly tamper: TamperResult | null
}

const LABEL_WIDTH = 16
const MAX_DETAIL = 96

const mark = (ok: boolean): string => (ok ? '✓' : '✗')

const clip = (s: string, max = MAX_DETAIL): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

const shortHash = (h: string): string => (h.length > 24 ? `${h.slice(0, 14)}…${h.slice(-8)}` : h)

const fmtBps = (a: readonly number[] | null): string => (a ? `[${a.join(', ')}]` : '—')

const row = (label: string, ok: boolean, detail: string): string =>
  `${label.padEnd(LABEL_WIDTH)} ${mark(ok)}  ${clip(detail)}`

/** Frame rows into a box; `null` rows become horizontal separators. */
function frame(rows: readonly (string | null)[]): string {
  const lines = rows.filter((r): r is string => r !== null)
  const width = lines.reduce((w, l) => Math.max(w, l.length), 0)
  const bar = '─'.repeat(width + 2)
  const body = rows.map((r) => (r === null ? `├${bar}┤` : `│ ${r.padEnd(width)} │`))
  return [`┌${bar}┐`, ...body, `└${bar}┘`].join('\n')
}

export function renderVerdict(result: VerifyResult, ctx: RenderContext): string {
  const meta: readonly string[] = [
    `vault  ${ctx.vault}`,
    `rpc    ${clip(ctx.rpcUrl, 80)}`,
    ...(ctx.transactionHash ? [`tx     ${ctx.transactionHash}`] : []),
    ...(ctx.blockNumber !== null ? [`block  ${ctx.blockNumber}`] : []),
    ...(ctx.tamper
      ? [`tamper snapshotJson[${ctx.tamper.index}]: '${ctx.tamper.from}' → '${ctx.tamper.to}'`]
      : [])
  ]

  const hashRows = result.hashChecks.map((h) =>
    h.ok
      ? row(`${h.label} hash`, true, `${shortHash(h.recomputed)} = on-chain`)
      : row(`${h.label} hash`, false, `recomputed ${shortHash(h.recomputed)} ≠ on-chain ${shortHash(h.onchain)}`)
  )

  const schemaRows = [
    result.snapshotParse.ok
      ? row('snapshot schema', true, 'SnapshotSchema parse ok')
      : row('snapshot schema', false, result.snapshotParse.error ?? 'parse failed'),
    result.proposalParse.ok
      ? row('proposal schema', true, `ProposalSchema parse ok — regime ${result.regime ?? '?'}`)
      : row('proposal schema', false, result.proposalParse.error ?? 'parse failed')
  ]

  const clamp = result.clampReplay
  const clampRow = clamp.performed
    ? row(
        'clamp replay',
        clamp.ok,
        `expected ${fmtBps(clamp.expectedBps)} ${clamp.ok ? '=' : '≠'} on-chain ${fmtBps(clamp.onchainBps)}`
      )
    : row('clamp replay', false, clamp.reason ?? 'skipped')

  const rows: readonly (string | null)[] = [
    `MandateVault replay verification — epoch ${result.epoch}${ctx.tamper ? '  [TAMPER DEMO]' : ''}`,
    null,
    ...meta,
    null,
    ...hashRows,
    ...schemaRows,
    clampRow,
    null,
    'note: bounds read from current mandate() — the owner may have updated them',
    '      since this epoch (authoritative for this demo).',
    null,
    `VERDICT: ${result.verified ? 'VERIFIED ✓' : 'TAMPERED ✗'}`
  ]

  return frame(rows)
}
