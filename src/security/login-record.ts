export type LoginRecord = {
  version: 1 | 2; salt: string; verifier: string; attempts: number; retryAt: number;
};

export function validateLoginRecord(value: unknown): LoginRecord {
  const record = value as LoginRecord | null;
  if (!record || ![1, 2].includes(record.version) || typeof record.salt !== 'string' || !/^[0-9a-f]{32}$/.test(record.salt)
    || typeof record.verifier !== 'string' || !/^[0-9a-f]{64}$/.test(record.verifier)
    || !Number.isSafeInteger(record.attempts) || record.attempts < 0 || record.attempts > 20
    || !Number.isSafeInteger(record.retryAt) || record.retryAt < 0) {
    throw new Error('The saved login could not be opened. Your thoughts have not been deleted.');
  }
  return record;
}

export function validatePin(pin: string) {
  if (!/^\d{6}$/.test(pin)) throw new Error('Enter a six-digit PIN.');
}
