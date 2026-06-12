/**
 * Minimal ambient declarations for the Node.js surface this package uses.
 *
 * The monorepo does not depend on `@types/node` (none of the sibling packages
 * do), and adding it is out of scope for this component. These declarations
 * cover only the exact globals/modules the agent touches: `process`,
 * `NodeJS.ProcessEnv`, and `node:util`'s `parseArgs`. DOM lib (fetch,
 * AbortController, setTimeout, …) is already provided by the default TS libs.
 */

declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined
  }
}

declare const process: {
  env: NodeJS.ProcessEnv
  argv: string[]
  exit(code?: number): never
}

declare module 'node:util' {
  interface ParseArgsOptionConfig {
    type: 'string' | 'boolean'
    short?: string
    multiple?: boolean
    default?: string | boolean | string[] | boolean[]
  }
  interface ParseArgsConfig {
    args?: string[]
    options?: Record<string, ParseArgsOptionConfig>
    strict?: boolean
    allowPositionals?: boolean
  }
  interface ParseArgsResult {
    values: Record<string, string | boolean | (string | boolean)[] | undefined>
    positionals: string[]
  }
  export function parseArgs(config: ParseArgsConfig): ParseArgsResult
}

declare module 'node:fs' {
  export function realpathSync(path: string): string
}

declare module 'node:url' {
  export function pathToFileURL(path: string): { href: string }
}

declare module 'node:crypto' {
  export function randomBytes(size: number): { toString(encoding: 'hex'): string }
}
