/**
 * Minimal Node.js ambient types for cli.ts.
 *
 * @types/node is not installed anywhere in this workspace and dependency lists
 * are frozen for this build. This shim declares ONLY the surface cli.ts uses.
 * DELETE this file as soon as @types/node is added to verifier devDependencies
 * (the declarations below would then conflict with the real ones).
 */

declare module 'node:util' {
  interface ParseArgsOptionConfig {
    readonly type: 'string' | 'boolean'
    readonly short?: string
    readonly multiple?: boolean
    readonly default?: string | boolean | readonly string[] | readonly boolean[]
  }

  interface ParseArgsConfig {
    readonly args?: readonly string[]
    readonly options?: Record<string, ParseArgsOptionConfig>
    readonly strict?: boolean
    readonly allowPositionals?: boolean
  }

  function parseArgs(config: ParseArgsConfig): {
    values: Record<string, string | boolean | (string | boolean)[] | undefined>
    positionals: string[]
  }
}

declare const process: {
  readonly argv: readonly string[]
  readonly env: Record<string, string | undefined>
  exitCode: number | undefined
  readonly stdout: { write(chunk: string): boolean }
  readonly stderr: { write(chunk: string): boolean }
}
