import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

// Retain the exact version 1 format for existing logins; new local locks use
// a keyed verifier backed by the 256-bit secret in Keystore/Keychain.
export const PIN_ITERATIONS = 600000;
export async function derivePin(pin: string, salt: string, pepper: string, version: 1 | 2 = 2) {
  if (!/^\d{6}$/.test(pin) || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(pepper)) {
    throw new Error('The PIN verification inputs are invalid.');
  }
  const password = asciiBytes(version === 1 ? `${pin}:${pepper}` : `orbit.local-pin.v2:${salt}:${pin}`);
  const secret = hexToBytes(pepper);
  let result: Uint8Array | undefined;
  try {
    result = version === 1 ? await pbkdf2Async(sha256, password, hexToBytes(salt), {
      c: PIN_ITERATIONS, dkLen: 32, asyncTick: 16,
    }) : hmac(sha256, secret, password);
    return bytesToHex(result);
  } finally { password.fill(0); secret.fill(0); result?.fill(0); }
}

// All inputs above are validated ASCII. No TextEncoder/polyfill is needed in Hermes.
function asciiBytes(text: string) { return Uint8Array.from(text, (character) => character.charCodeAt(0)); }

export function equalVerifier(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
