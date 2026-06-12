import { describe, expect, it } from 'vitest'
import {
  decryptEnvelope,
  encryptString,
  isConfidentialEnvelope,
  parseEnvelope,
  type ConfidentialEnvelope
} from '../src/index.js'

const KEY = 'a'.repeat(64)
const OTHER_KEY = 'b'.repeat(64)

describe('encryptString / decryptEnvelope', () => {
  it('round-trips a plaintext string', async () => {
    const plaintext = '{"regime":"RISK_ON","targetAllocBps":[3000,7000],"rationale":"carry"}'
    const env = await encryptString(plaintext, KEY)
    expect(env.v).toBe(1)
    expect(env.alg).toBe('A256GCM')
    expect(typeof env.iv).toBe('string')
    expect(typeof env.enc).toBe('string')
    expect(await decryptEnvelope(env, KEY)).toBe(plaintext)
  })

  it('produces a fresh IV per call (ciphertext is not deterministic)', async () => {
    const a = await encryptString('hello', KEY)
    const b = await encryptString('hello', KEY)
    expect(a.iv).not.toBe(b.iv)
    expect(a.enc).not.toBe(b.enc)
  })

  it('throws on the wrong key', async () => {
    const env = await encryptString('secret', KEY)
    await expect(decryptEnvelope(env, OTHER_KEY)).rejects.toThrow(/incorrect or data tampered/)
  })

  it('throws on tampered ciphertext', async () => {
    const env = await encryptString('secret', KEY)
    const bytes = atob(env.enc)
    const flipped = String.fromCharCode(bytes.charCodeAt(0) ^ 0xff) + bytes.slice(1)
    const tampered: ConfidentialEnvelope = { ...env, enc: btoa(flipped) }
    await expect(decryptEnvelope(tampered, KEY)).rejects.toThrow(/incorrect or data tampered/)
  })

  it('rejects a malformed key', async () => {
    await expect(encryptString('x', '0xdead')).rejects.toThrow(/64 hex/)
  })
})

describe('isConfidentialEnvelope', () => {
  it('accepts a real envelope', async () => {
    expect(isConfidentialEnvelope(await encryptString('x', KEY))).toBe(true)
  })

  it('rejects non-envelopes', () => {
    expect(isConfidentialEnvelope(null)).toBe(false)
    expect(isConfidentialEnvelope('string')).toBe(false)
    expect(isConfidentialEnvelope({ v: 2, alg: 'A256GCM', iv: 'a', enc: 'b' })).toBe(false)
    expect(isConfidentialEnvelope({ v: 1, alg: 'AES', iv: 'a', enc: 'b' })).toBe(false)
    expect(isConfidentialEnvelope({ v: 1, alg: 'A256GCM', iv: 1, enc: 'b' })).toBe(false)
    expect(isConfidentialEnvelope({ v: 1, alg: 'A256GCM', iv: 'a' })).toBe(false)
  })
})

describe('parseEnvelope', () => {
  it('parses an envelope from JSON', async () => {
    const env = await encryptString('x', KEY)
    const parsed = parseEnvelope(JSON.stringify(env))
    expect(parsed).not.toBeNull()
    expect(parsed?.alg).toBe('A256GCM')
  })

  it('tolerates extra plaintext sibling fields', async () => {
    const env = await encryptString('x', KEY)
    const json = JSON.stringify({ ...env, llmFallback: true, playbookVersion: 3 })
    const parsed = parseEnvelope(json)
    expect(parsed).not.toBeNull()
    expect(parsed?.llmFallback).toBe(true)
    expect(parsed?.playbookVersion).toBe(3)
  })

  it('returns null for plaintext (non-envelope) JSON', () => {
    expect(parseEnvelope('{"regime":"RISK_ON","targetAllocBps":[1]}')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseEnvelope('not-json{')).toBeNull()
  })
})
