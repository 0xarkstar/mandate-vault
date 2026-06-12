import { describe, expect, it } from 'vitest'
import { loadConfig, loadToolConfig } from '../src/config.js'

const KEY = '0x' + '1'.repeat(64)
const ADDR = '0x' + 'a'.repeat(40)

const base: NodeJS.ProcessEnv = {
  PRIVATE_KEY: KEY,
  VAULT_ADDRESS: ADDR,
  OPENROUTER_API_KEY: 'sk-or-test',
  ORACLE_ADDRESS: ADDR
}

describe('loadConfig', () => {
  it('applies RPC/chainId defaults', () => {
    const cfg = loadConfig(base)
    expect(cfg.rpcUrl).toBe('https://rpc.sepolia.mantle.xyz')
    expect(cfg.chainId).toBe(5003)
    expect(cfg.fundingSymbol).toBe('ETHUSDT')
  })

  it('lets a vault override win', () => {
    const other = '0x' + 'b'.repeat(40)
    expect(loadConfig(base, other).vaultAddress).toBe(other)
  })

  it('rejects a malformed private key', () => {
    expect(() => loadConfig({ ...base, PRIVATE_KEY: '0xdead' })).toThrow(/Invalid agent configuration/)
  })

  it('rejects a missing OpenRouter key', () => {
    const { OPENROUTER_API_KEY: _omit, ...without } = base
    expect(() => loadConfig(without)).toThrow(/OPENROUTER_API_KEY/)
  })

  it('rejects a non-address vault', () => {
    expect(() => loadConfig({ ...base, VAULT_ADDRESS: 'nope' })).toThrow(/Invalid agent configuration/)
  })

  it('leaves viewingKey undefined when VIEWING_KEY is absent', () => {
    expect(loadConfig(base).viewingKey).toBeUndefined()
  })

  it('accepts a 64-hex VIEWING_KEY', () => {
    const vk = 'f'.repeat(64)
    expect(loadConfig({ ...base, VIEWING_KEY: vk }).viewingKey).toBe(vk)
  })

  it('rejects a malformed VIEWING_KEY', () => {
    expect(() => loadConfig({ ...base, VIEWING_KEY: '0xdead' })).toThrow(/Invalid agent configuration/)
  })
})

describe('loadToolConfig', () => {
  it('does not require the agent LLM key', () => {
    const cfg = loadToolConfig({ ORACLE_ADDRESS: ADDR, ORACLE_OWNER_KEY: KEY })
    expect(cfg.CHAIN_ID).toBe(5003)
    expect(cfg.ORACLE_OWNER_KEY).toBe(KEY)
  })
})
