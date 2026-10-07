import * as SecureStore from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';

const key = 'orbit.pin-pepper.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainService: 'orbit.local-login', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
export const secretStore = {
  read: () => SecureStore.getItemAsync(key, options),
  write: (value: string) => SecureStore.setItemAsync(key, value, options),
};
export async function randomHex(bytes: number) { return bytesToHex(await getRandomBytesAsync(bytes)); }
