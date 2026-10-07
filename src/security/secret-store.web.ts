// Browser preview only: localStorage cannot provide the phone's Keystore/Keychain protection.
const key = 'orbit-browser-preview-pepper-v1';
export const secretStore = {
  read: async () => window.localStorage.getItem(key),
  write: async (value: string) => { window.localStorage.setItem(key, value); },
};
export async function randomHex(bytes: number) {
  const value = new Uint8Array(bytes);
  window.crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
