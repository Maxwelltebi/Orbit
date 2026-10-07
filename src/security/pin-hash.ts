import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

// Version 1 uses PBKDF2-HMAC-SHA256, a random salt and a device-only pepper.
export const PIN_ITERATIONS = 600000;
export async function derivePin(pin: string, salt: string, pepper: string) {
  const key = await pbkdf2Async(sha256, `${pin}:${pepper}`, hexToBytes(salt), {
    c: PIN_ITERATIONS, dkLen: 32, asyncTick: 8,
  });
  try { return bytesToHex(key); }
  finally { key.fill(0); }
}

export function equalVerifier(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
