/**
 * Field-level confidential decision payloads ("privacy-lite").
 *
 * With a viewing key set, the agent publishes ENCRYPTED ENVELOPES on-chain in
 * place of the plaintext snapshot/proposal/rationale strings. The keccak hashes
 * still commit to the published (envelope) strings, so integrity verification is
 * unchanged; content verification (schema parse + clamp replay) requires the
 * viewing key to decrypt the inner plaintext.
 *
 * AES-256-GCM via WebCrypto (globalThis.crypto.subtle) — works in both the
 * browser (native) and Node 18+ (WebCrypto is a global there too), with no
 * node:crypto import, keeping clamp-core browser-safe.
 */

/** An encrypted decision payload as published on-chain (base64 iv/enc). */
export interface ConfidentialEnvelope {
  readonly v: 1
  readonly alg: 'A256GCM'
  /** Base64-encoded 12-byte GCM IV. */
  readonly iv: string
  /** Base64-encoded ciphertext (includes the GCM auth tag). */
  readonly enc: string
}

const KEY_HEX_RE = /^[0-9a-fA-F]{64}$/
const IV_BYTES = 12

function assertKeyHex(keyHex: string): void {
  if (!KEY_HEX_RE.test(keyHex)) {
    throw new Error('viewing key must be 64 hex characters (32 bytes)')
  }
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2))
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] as number)
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

async function importKey(keyHex: string): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey('raw', hexToBytes(keyHex), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt'
  ])
}

/**
 * Encrypt a plaintext string into a {@link ConfidentialEnvelope}. `keyHex` is 64
 * hex chars (a 256-bit key); a fresh random 12-byte IV is generated per call.
 */
export async function encryptString(plaintext: string, keyHex: string): Promise<ConfidentialEnvelope> {
  assertKeyHex(keyHex)
  const key = await importKey(keyHex)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)))
  const encoded = new TextEncoder().encode(plaintext)
  const data = new Uint8Array(new ArrayBuffer(encoded.length))
  data.set(encoded)
  const cipher = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return {
    v: 1,
    alg: 'A256GCM',
    iv: bytesToBase64(iv),
    enc: bytesToBase64(new Uint8Array(cipher))
  }
}

/**
 * Decrypt a {@link ConfidentialEnvelope} back to its plaintext string. Throws on
 * a wrong key or tampered ciphertext (GCM auth-tag failure).
 */
export async function decryptEnvelope(env: ConfidentialEnvelope, keyHex: string): Promise<string> {
  assertKeyHex(keyHex)
  const key = await importKey(keyHex)
  const iv = base64ToBytes(env.iv)
  const cipher = base64ToBytes(env.enc)
  let plain: ArrayBuffer
  try {
    plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  } catch {
    throw new Error('decryption failed: viewing key incorrect or data tampered')
  }
  return new TextDecoder().decode(plain)
}

/** Structural guard: is `x` a v1 A256GCM confidential envelope? */
export function isConfidentialEnvelope(x: unknown): x is ConfidentialEnvelope {
  if (x === null || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return o.v === 1 && o.alg === 'A256GCM' && typeof o.iv === 'string' && typeof o.enc === 'string'
}

/**
 * Parse an envelope out of a JSON string, tolerating extra plaintext sibling
 * fields (e.g. `llmFallback`, `playbookVersion` carried alongside the envelope
 * in the published snapshot). Returns null when the JSON is not a valid
 * envelope.
 */
export function parseEnvelope(json: string): (ConfidentialEnvelope & Record<string, unknown>) | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  return isConfidentialEnvelope(parsed)
    ? (parsed as ConfidentialEnvelope & Record<string, unknown>)
    : null
}
