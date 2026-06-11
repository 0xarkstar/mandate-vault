import { keccak256, toBytes } from 'viem'

/**
 * keccak256 of the UTF-8 bytes of a string — byte-identical to Solidity's
 * `keccak256(bytes(s))`, which is what MandateVault emits in DecisionLogged.
 */
export function hashString(s: string): `0x${string}` {
  return keccak256(toBytes(s))
}
